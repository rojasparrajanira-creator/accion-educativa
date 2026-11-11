'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {normalizedSellerCode,validAttribution,commissionCLP,pickLastEligibleReferral,recordPaidOrderCommissions}=require('./afiliados-core');
test('códigos de vendedores',()=>{
 assert.equal(normalizedSellerCode(' ven001 '),'VEN001');
 assert.equal(normalizedSellerCode('A'),'null'==='null'?null:undefined);
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
