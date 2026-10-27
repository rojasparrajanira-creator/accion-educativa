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
  assert.match(msg.subject,/MEC-1/);assert.match(msg.text,/Taller/);assert.match(msg.text,/drive\.google\.com/);assert.match(msg.text,/accioneducativaspa@gmail\.com/);
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
  const srv=createStoreDelivery({pool,grantAccess:async()=>{},env:TEST_ENV,sendOverride:async email=>sent.push(email),logger:{error:()=>{}}});
  assert.equal(await srv.enqueue(5),true);
  assert.match(queries[0].sql,/status='paid'/);
  assert.deepEqual(queries[0].values,[5,'integration']);
  const result=await srv.flush();
  assert.equal(result.sent,1);
  assert.equal(sent.length,1);
  assert.equal(sent[0].to,'qa@example.org');
  assert.equal(sent[0].replyTo,'accioneducativaspa@gmail.com');
  assert.notEqual(sent[0].to,'real@example.org');
  assert.match(sent[0].subject,/PRUEBA/);
  assert.ok(queries.some(x=>x.sql.includes("set status='sent'")));
  assert.ok(queries.some(x=>x.sql==='released'));
});
test('sandbox filters out production delivery jobs',async()=>{
  const {queries,pool}=mockDb();
  const srv=createStoreDelivery({pool,grantAccess:async()=>{},env:TEST_ENV,sendOverride:async()=>{},logger:{error:()=>{}}});
  await srv.flush();
  const query=queries.find(x=>x.sql.startsWith('select order_id,attempts'));
  assert.match(query.sql,/payment_mode=\$1/);
  assert.deepEqual(query.values,['integration']);
});
test('failed provider send is recorded for retry without marking delivery sent',async()=>{
  const {queries,pool}=mockDb();
  const srv=createStoreDelivery({pool,grantAccess:async()=>{},env:TEST_ENV,sendOverride:async()=>{throw Error('provider_unavailable')},logger:{error:()=>{}}});
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
test('production delivery queue does not wait for manual tax-document issuance',async()=>{
  const {queries,pool}=mockDb();
  const sent=[];
  const srv=createStoreDelivery({pool,grantAccess:async()=>{},env:{...TEST_ENV,MEC_WEBPAY_MODE:'production'},sendOverride:async email=>sent.push(email),logger:{error:()=>{}}});
  const result=await srv.flush();
  const query=queries.find(x=>x.sql.startsWith('select order_id,attempts'));
  assert.match(query.sql,/payment_mode=\$1/);
  assert.equal(query.sql.includes('store_tax_documents'),false);
  assert.deepEqual(query.values,['production']);
  assert.equal(result.sent,1);
  assert.equal(sent.length,1);
  assert.equal(sent[0].to,'real@example.org');
  assert.match(sent[0].text,/https:\/\/drive\.google\.com\/drive\/folders\/a/);
  assert.equal(sent[0].text.includes('Documento tributario electrónico'),false);
});
test('manual tax-document status remains pending when buyer receives digital access',async()=>{
  const {queries,pool}=mockDb();
  const srv=createStoreDelivery({pool,grantAccess:async()=>{},env:{...TEST_ENV,MEC_WEBPAY_MODE:'production'},sendOverride:async()=>{},logger:{error:()=>{}}});
  await srv.flush();
  assert.ok(queries.some(x=>x.sql.startsWith('select status,document_type,document_url from store_tax_documents')));
  assert.ok(queries.some(x=>x.sql.includes("set status='sent'")));
  assert.equal(queries.some(x=>/update store_tax_documents/i.test(x.sql)),false);
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

test('Resend receives Reply-To pointing to Acción Educativa rather than sender-only address',async()=>{
  const {pool}=mockDb();const deliveries=[];
  const srv=createStoreDelivery({pool,grantAccess:async()=>{},env:TEST_ENV,fetchFn:async(url,init)=>{
    deliveries.push({url,headers:init.headers,payload:JSON.parse(init.body)});
    return {ok:true};
  },logger:{error:()=>{}}});
  const result=await srv.flush();
  assert.equal(result.sent,1);
  assert.equal(deliveries.length,1);
  assert.equal(deliveries[0].payload.reply_to,'accioneducativaspa@gmail.com');
  assert.deepEqual(deliveries[0].payload.to,['qa@example.org']);
  assert.match(deliveries[0].payload.text,/accioneducativaspa@gmail\.com/);
});
test('a store-specific Reply-To address can be configured without changing the sender',()=>{
  const c=settings({...TEST_ENV,MEC_STORE_REPLY_TO_EMAIL:'ayuda@example.org'});
  assert.equal(c.replyTo,'ayuda@example.org');
  assert.equal(c.from,TEST_ENV.MEC_STORE_FROM_EMAIL);
  assert.equal(settings({...TEST_ENV,MEC_STORE_REPLY_TO_EMAIL:'invalid'}).ready,false);
});

test('delivery grants private Drive permission for BUYER before sending test email to Acción Educativa',async()=>{
  const {pool}=mockDb();const stages=[];
  const srv=createStoreDelivery({
    pool,env:TEST_ENV,
    grantAccess:async x=>{stages.push('permission:'+x.buyerEmail);assert.equal(x.items.length,1)},
    sendOverride:async x=>{stages.push('email:'+x.to)},
    logger:{error:()=>{}}
  });
  const result=await srv.flush();
  assert.equal(result.sent,1);
  assert.deepEqual(stages,['permission:real@example.org','email:qa@example.org']);
});
test('no buyer access is granted and no link is emailed unless the payment is confirmed',async()=>{
  const {pool}=mockDb();let grantCalls=0,emailCalls=0;
  const baseConnect=pool.connect;
  pool.connect=async()=>{
    const conn=await baseConnect();
    const originalQuery=conn.query;
    conn.query=async(sql,params)=>{
      if(sql.startsWith('select id,order_code,buyer_name,buyer_email,status from store_orders')){
        return {rows:[{id:5,order_code:'MEC-5',buyer_name:'Cliente',buyer_email:'real@example.org',status:'payment_initialized'}]};
      }
      return originalQuery(sql,params);
    };
    return conn;
  };
  const srv=createStoreDelivery({pool,env:{...TEST_ENV,MEC_WEBPAY_MODE:'production'},
    grantAccess:async()=>{grantCalls++},sendOverride:async()=>{emailCalls++},logger:{error:()=>{}}});
  const result=await srv.flush();
  assert.equal(result.sent,0);
  assert.equal(grantCalls,0);
  assert.equal(emailCalls,0);
});
test('a missing Drive grant implementation prevents sending private links',async()=>{
  const {pool}=mockDb();const mail=[];
  const srv=createStoreDelivery({pool,env:TEST_ENV,sendOverride:async x=>mail.push(x),logger:{error:()=>{}}});
  const result=await srv.flush();
  assert.equal(result.sent,0);
  assert.equal(mail.length,0);
});
test('a Drive share error leaves the delivery failed for administrative retry',async()=>{
  const {pool}=mockDb();const mail=[];
  const srv=createStoreDelivery({
    pool,env:TEST_ENV,grantAccess:async()=>{throw Error('drive_folder_not_authorized_for_app')},
    sendOverride:async x=>mail.push(x),logger:{error:()=>{}}
  });
  const result=await srv.flush();
  assert.equal(result.sent,0);
  assert.equal(mail.length,0);
});

test('paid email gives verification and editing instructions without authorizing a different address',()=>{
 const order={status:'paid',buyer_name:'Cliente de prueba',order_code:'MEC-PRUEBA-22'};
 const msg=compose(order,[{product_title:'Protocolos escolares',delivery_url_snapshot:'https://drive.google.com/drive/folders/1ABCDEFGHijklmnopqrst'}]);
 assert.match(msg.subject,/Material enviado/);
 assert.match(msg.text,/Material enviado ✅/);
 assert.match(msg.text,/tu compra es muy importante/);
 assert.match(msg.text,/Spam o No deseados/);
 assert.match(msg.text,/descargarlos en tu computadora/);
 assert.match(msg.text,/descárgalo y descomprímelo/);
 assert.match(msg.text,/mismo correo/);
 assert.match(msg.text,/todas las subcarpetas/);
 assert.match(msg.text,/ni se otorgará acceso a terceros/);
 assert.match(msg.text,/Quedamos atentos a tu confirmación/);
 assert.match(msg.text,/MEC-PRUEBA-22/);
});
