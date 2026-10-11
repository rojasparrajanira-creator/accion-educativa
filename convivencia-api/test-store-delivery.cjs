'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {settings,driveLink,verifiedTaxDocument,compose,createStoreDelivery}=require('./store-delivery');

test('delivery is disabled until explicit opt-in',()=>{
  assert.equal(settings({MEC_WEBPAY_MODE:'production',MEC_STORE_RESEND_API_KEY:'key',MEC_STORE_FROM_EMAIL:'sender@domain.cl'}).ready,false);
  assert.equal(settings({MEC_STORE_DELIVERY_ENABLED:'1',MEC_STORE_RESEND_API_KEY:'key',MEC_STORE_FROM_EMAIL:'sender@domain.cl'}).ready,false);
});
test('integration only enables a specific test mailbox',()=>{
  const c=settings({MEC_WEBPAY_MODE:'integration',MEC_STORE_DELIVERY_ENABLED:'1',MEC_STORE_RESEND_API_KEY:'fake',MEC_STORE_FROM_EMAIL:'sender@domain.cl',MEC_STORE_TEST_DELIVERY_EMAIL:'qa@example.org'});
  assert.equal(c.mode,'integration');assert.equal(c.ready,true);assert.equal(c.testRecipient,'qa@example.org');
});
test('only real Drive URLs can be delivered',()=>{
  assert.equal(driveLink('https://drive.google.com.evil.example/a'),'');
  assert.equal(driveLink('http://drive.google.com/drive/folders/a'),'');
  assert.equal(driveLink('https://drive.google.com/drive/folders/a'),'https://drive.google.com/drive/folders/a');
});
test('unpaid orders and broken links cannot compose a delivery',()=>{
  assert.throws(()=>compose({status:'pending'},[{delivery_url_snapshot:'https://drive.google.com/drive/folders/a'}]),/payment_not_confirmed/);
  assert.throws(()=>compose({status:'paid'},[{delivery_url_snapshot:'https://example.com/material'}]),/invalid_delivery_link/);
});
test('paid orders include ordered materials and order code',()=>{
  const msg=compose({status:'paid',buyer_name:'Cliente',order_code:'MEC-1'},[{product_title:'Taller',delivery_url_snapshot:'https://drive.google.com/drive/folders/a'}]);
  assert.match(msg.subject,/MEC-1/);assert.match(msg.text,/Taller/);assert.match(msg.text,/drive\.google\.com/);
});
function mockDb(){
  const queries=[];
  const conn={
    async query(sql,values){
      queries.push({sql,values});
      if(sql.includes('pg_try_advisory_lock'))return {rows:[{held:true}]};
      if(sql.startsWith('select order_id,attempts'))return {rows:[{order_id:5,attempts:0}]};
      if(sql.startsWith('select id,order_code'))return {rows:[{id:5,order_code:'MEC-5',buyer_name:'Cliente',buyer_email:'real@example.org',status:'paid'}]};
      if(sql.startsWith('select product_title'))return {rows:[{product_title:'Guía de prueba',delivery_url_snapshot:'https://drive.google.com/drive/folders/a'}]};
      return {rowCount:1,rows:[]};
    },
    release(){queries.push({sql:'released'})}
  };
  return {queries,pool:{connect:async()=>conn,query:async(sql,values)=>{queries.push({sql,values});return {rowCount:1,rows:[]}}}};
}
const TEST_ENV={MEC_WEBPAY_MODE:'integration',MEC_STORE_DELIVERY_ENABLED:'1',MEC_STORE_RESEND_API_KEY:'fake-key',MEC_STORE_FROM_EMAIL:'Pruebas <sender@example.org>',MEC_STORE_TEST_DELIVERY_EMAIL:'qa@example.org'};
test('sandbox sends only to the authorized test mailbox and stores sent status',async()=>{
  const {queries,pool}=mockDb();const sent=[];
  const srv=createStoreDelivery({pool,env:TEST_ENV,sendOverride:async email=>sent.push(email),logger:{error:()=>{}}});
  assert.equal(await srv.enqueue(5),true);
  assert.match(queries[0].sql,/status='paid'/);
  assert.deepEqual(queries[0].values,[5,'integration']);
  const result=await srv.flush();
  assert.equal(result.sent,1);
  assert.equal(sent.length,1);
  assert.equal(sent[0].to,'qa@example.org');
  assert.notEqual(sent[0].to,'real@example.org');
  assert.match(sent[0].subject,/PRUEBA/);
  assert.ok(queries.some(x=>x.sql.includes("set status='sent'")));
  assert.ok(queries.some(x=>x.sql==='released'));
});
test('sandbox filters out production delivery jobs',async()=>{
  const {queries,pool}=mockDb();
  const srv=createStoreDelivery({pool,env:TEST_ENV,sendOverride:async()=>{},logger:{error:()=>{}}});
  await srv.flush();
  const query=queries.find(x=>x.sql.startsWith('select order_id,attempts'));
  assert.match(query.sql,/payment_mode=\$1/);
  assert.deepEqual(query.values,['integration']);
});
test('failed provider send is recorded for retry without marking delivery sent',async()=>{
  const {queries,pool}=mockDb();
  const srv=createStoreDelivery({pool,env:TEST_ENV,sendOverride:async()=>{throw Error('provider_unavailable')},logger:{error:()=>{}}});
  const result=await srv.flush();
  assert.equal(result.sent,0);
  assert.ok(queries.some(x=>x.sql.includes("set status='failed'")));
  assert.ok(!queries.some(x=>x.sql.includes("set status='sent'")));
});

test('tax document must be verified before it is attached to an email',()=>{
  assert.equal(verifiedTaxDocument({status:'pending',document_type:'boleta_exenta',document_url:'https://sii.cl/abc'}),false);
  assert.equal(verifiedTaxDocument({status:'issued',document_type:'boleta_exenta',document_url:'http://invalid.test/abc'}),false);
  assert.equal(verifiedTaxDocument({status:'issued',document_type:'boleta_exenta',document_url:'https://example.org/boleta/abc'}),true);
  assert.throws(()=>compose({status:'paid',buyer_name:'Cliente',order_code:'MEC-2'},
    [{product_title:'Material',delivery_url_snapshot:'https://drive.google.com/drive/folders/abc'}],
    {status:'pending',document_type:'boleta_exenta',document_url:'https://example.org/abc'}),/tax_document_not_verified/);
});
test('issued tax document link is included in the paid email',()=>{
  const msg=compose({status:'paid',buyer_name:'Cliente',order_code:'MEC-2'},
    [{product_title:'Material',delivery_url_snapshot:'https://drive.google.com/drive/folders/abc'}],
    {status:'issued',document_type:'boleta_afecta',document_url:'https://example.org/boleta/abc'});
  assert.match(msg.text,/https:\/\/example\.org\/boleta\/abc/);
  assert.match(msg.text,/https:\/\/drive\.google\.com\/drive\/folders\/abc/);
});
test('production delivery query waits for issued fiscal document',async()=>{
  const {queries,pool}=mockDb();
  const srv=createStoreDelivery({pool,env:{...TEST_ENV,MEC_WEBPAY_MODE:'production'},sendOverride:async()=>{},logger:{error:()=>{}}});
  await srv.flush();
  const query=queries.find(x=>x.sql.startsWith('select order_id,attempts'));
  assert.match(query.sql,/store_tax_documents/);
  assert.match(query.sql,/document_url like/);
  assert.deepEqual(query.values,['production']);
});

test('issued affect invoice is treated as verified DTE, not mistaken for exempt boleta',()=>{
  const d={status:'issued',document_type:'factura_afecta',document_url:'https://example.org/factura/33'};
  assert.equal(verifiedTaxDocument(d),true);
  const message=compose({status:'paid',buyer_name:'Empresa',order_code:'MEC-F1'},[{product_title:'Digital',delivery_url_snapshot:'https://drive.google.com/drive/folders/abc'}],d);
  assert.match(message.text,/Factura electrónica/);
  assert.match(message.text,/example\.org\/factura\/33/);
});
test('issued exempt invoice is supported but never inferred from buyer choice',()=>{
  const d={status:'issued',document_type:'factura_exenta',document_url:'https://example.org/factura/34'};
  assert.equal(verifiedTaxDocument(d),true);
  assert.equal(verifiedTaxDocument({status:'pending',document_type:'factura_afecta',document_url:'https://example.org/x'}),false);
});
