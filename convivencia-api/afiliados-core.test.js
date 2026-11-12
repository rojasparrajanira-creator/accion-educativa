'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizedSellerCode,validAttribution,commissionCLP,pickLastEligibleReferral,recordPaidOrderCommissions}=require('./afiliados-core');
test('códigos de vendedores',()=>{
 assert.equal(normalizedSellerCode(' ven001 '),'VEN001');
 assert.equal(normalizedSellerCode('A'),null);
 assert.equal(normalizedSellerCode('bad&code'),null);
});
test('ventana de 30 días y fecha futura',()=>{
 const now=new Date('2026-11-11T12:00:00Z');
 assert.equal(validAttribution({seenAt:'2026-10-12T12:00:00Z',now}),true);
 assert.equal(validAttribution({seenAt:'2026-10-12T11:59:59Z',now}),false);
 assert.equal(validAttribution({seenAt:'2026-11-12T12:00:00Z',now}),false);
});
test('último enlace válido gana',()=>{
 const now=new Date('2026-11-11T12:00:00Z');
 const got=pickLastEligibleReferral([{code:'VEN001',seenAt:'2026-11-08T12:00:00Z'},{code:'VEN002',seenAt:'2026-11-10T12:00:00Z'}],now);
 assert.equal(got.code,'VEN002');
});
test('comisión 10% en pesos, sin decimales',()=>{
 assert.equal(commissionCLP(34990),3499);
 assert.equal(commissionCLP(12990),1299);
 assert.equal(commissionCLP(3490),349);
 assert.throws(()=>commissionCLP(-1));
});
test('solo se registra con pago confirmado y una vez por ítem',async()=>{
 const calls=[],client={query:async(sql,args)=>{
   calls.push(sql);
   if(sql.startsWith('select id,status'))return {rowCount:1,rows:[{id:5,status:'paid'}]};
   if(sql.startsWith('select a.seller_id'))return {rowCount:1,rows:[{seller_id:2,commission_bps_snapshot:1000}]};
   if(sql.startsWith('select id,product_title'))return {rows:[{id:10,product_title:'RICE',unit_price_clp:34990,quantity:1}]};
   if(sql.includes('insert into store_affiliate_commissions'))return {rowCount:calls.filter(x=>x.includes('insert into store_affiliate_commissions')).length===1?1:0};
 }};
 assert.deepEqual(await recordPaidOrderCommissions(client,5),{recorded:1});
 assert.deepEqual(await recordPaidOrderCommissions(client,5),{recorded:0});
});

test('no se contabiliza una orden pendiente de pago',async()=>{
 const client={query:async()=>({rowCount:1,rows:[{id:9,status:'payment_initialized'}]})};
 assert.deepEqual(await recordPaidOrderCommissions(client,9),{recorded:0,reason:'not_paid'});
});
test('no se contabiliza una orden sin vendedor atribuido',async()=>{
 const client={query:async(sql)=>{
  if(sql.startsWith('select id,status'))return {rowCount:1,rows:[{id:9,status:'paid'}]};
  return {rowCount:0,rows:[]};
 }};
 assert.deepEqual(await recordPaidOrderCommissions(client,9),{recorded:0,reason:'not_attributed'});
});
test('un enlace vencido no supera a uno vigente',()=>{
 const now=new Date('2026-11-12T12:00:00Z');
 const referral=pickLastEligibleReferral([
  {code:'VEN001',seenAt:'2026-10-01T12:00:00Z'},
  {code:'VEN002',seenAt:'2026-11-11T12:00:00Z'}
 ],now);
 assert.equal(referral.code,'VEN002');
});
test('varios productos en carrito generan comisiones distintas',async()=>{
 const values=[],client={query:async(sql,params)=>{
  if(sql.startsWith('select id,status'))return {rowCount:1,rows:[{id:9,status:'paid'}]};
  if(sql.startsWith('select a.seller_id'))return {rowCount:1,rows:[{seller_id:3,commission_bps_snapshot:1000}]};
  if(sql.startsWith('select id,product_title'))return {rows:[
   {id:101,product_title:'RICE 2027',unit_price_clp:20000,quantity:1},
   {id:102,product_title:'Taller',unit_price_clp:3490,quantity:2}
  ]};
  if(sql.includes('insert into store_affiliate_commissions')){values.push({sale:params[4],commission:params[6]});return {rowCount:1}}
 }};
 assert.deepEqual(await recordPaidOrderCommissions(client,9),{recorded:2});
 assert.deepEqual(values,[{sale:20000,commission:2000},{sale:6980,commission:698}]);
});
