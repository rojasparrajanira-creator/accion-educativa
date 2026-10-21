'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {configuration,checkoutUrl,verifyWebhook,verifiedRecurringPayment,createMercadoPagoSubscriptions}=require('./mercadopago-subscriptions');
const settings={MEC_SUBSCRIPTION_MP_MODE:'production',MEC_SUBSCRIPTION_MP_ACCESS_TOKEN:'TEST-DUMMY-NEVER-REAL',
 MEC_SUBSCRIPTION_MP_WEBHOOK_SECRET:'secret-for-tests',MEC_SUBSCRIPTION_MP_CHECKOUT_ENABLED:'1'};
test('Los cobros recurrentes están bloqueados hasta configuración explícita',()=>{
 assert.equal(configuration({}).ready,false);
 assert.equal(configuration({...settings,MEC_SUBSCRIPTION_MP_CHECKOUT_ENABLED:'0'}).ready,false);
 assert.equal(configuration({...settings,MEC_SUBSCRIPTION_MP_MODE:'integration'}).ready,false);
 assert.equal(configuration(settings).ready,true);
});
test('Checkout solo acepta HTTPS de Mercado Pago, nunca dominios similares',()=>{
 for(const good of ['https://www.mercadopago.cl/subscriptions/checkout','https://mercadopago.com/path'])
  assert.equal(checkoutUrl(good),true);
 for(const bad of ['javascript:alert(1)','http://mercadopago.cl/path','https://mercadopago.cl.bad.test','https://evil.test/x','https://mercadopago.cl@evil.test/'])
  assert.equal(checkoutUrl(bad),false);
});
test('Se verifica firma, timestamp y correlación de Webhook',()=>{
 const now=Date.now(),ts=String(Math.floor(now/1000)),dataId='AbC123',requestId='request-1';
 const signature=crypto.createHmac('sha256',settings.MEC_SUBSCRIPTION_MP_WEBHOOK_SECRET).update('id:abc123;request-id:request-1;ts:'+ts+';').digest('hex');
 const arg={secret:settings.MEC_SUBSCRIPTION_MP_WEBHOOK_SECRET,signature:'ts='+ts+',v1='+signature,requestId,dataId,now};
 assert.equal(verifyWebhook(arg),true);
 assert.equal(verifyWebhook({...arg,dataId:'other'}),false);
 assert.equal(verifyWebhook({...arg,requestId:'other'}),false);
 assert.equal(verifyWebhook({...arg,now:now+16*60000}),false);
});
test('No se confirma un pago solo por estado del plan ni sin monto correcto',()=>{
 const invoice={id:55,preapproval_id:'pre-1',external_reference:'MEC-CONV-id',currency_id:'CLP',transaction_amount:12990,payment:{id:100,status:'approved'}};
 const payment={id:100,live_mode:true,status:'approved',currency_id:'CLP',transaction_amount:12990};
 const expected={preapprovalId:'pre-1',externalReference:'MEC-CONV-id',amountClp:12990};
 assert.equal(verifiedRecurringPayment(invoice,payment,expected),true);
 assert.equal(verifiedRecurringPayment(invoice,{...payment,live_mode:false},expected),false);
 assert.equal(verifiedRecurringPayment(invoice,{...payment,transaction_amount:5},expected),false);
 assert.equal(verifiedRecurringPayment({...invoice,preapproval_id:'other'},payment,expected),false);
 assert.equal(verifiedRecurringPayment({...invoice,payment:{id:101,status:'approved'}},payment,expected),false);
 assert.equal(verifiedRecurringPayment(invoice,payment,{...expected,mode:'integration'}),false);
});
test('Crear suscripción genera referencia segura y recurrencia cada 30 días',async()=>{
 const calls=[],id='82cd056c-d53a-43a0-884a-acaa68c47a1f';
 const service=createMercadoPagoSubscriptions({env:settings,fetchFn:async(url,opts)=>{
  calls.push({url,opts});return {ok:true,json:async()=>({id:'mp-123',external_reference:'MEC-CONV-'+id,init_point:'https://www.mercadopago.cl/subscriptions/checkout/abc'})};
 }});
 const x=await service.createPreapproval({id,email:'prueba@example.test',establishmentName:'Escuela Test',amountClp:12990,backUrl:'https://example.test/return'});
 assert.equal(x.preapprovalId,'mp-123');
 assert.equal(calls.length,1);
 assert.ok(calls[0].url.endsWith('/preapproval'));
 const data=JSON.parse(calls[0].opts.body);
 assert.deepEqual(data.auto_recurring,{frequency:30,frequency_type:'days',transaction_amount:12990,currency_id:'CLP'});
 assert.equal(data.status,'pending');
 assert.ok(calls[0].opts.headers['X-Idempotency-Key'].includes(id));
});
test('Cancelación externa requiere confirmación de Mercado Pago',async()=>{
 const service=createMercadoPagoSubscriptions({env:settings,fetchFn:async()=>({ok:true,json:async()=>({id:'sub123',status:'cancelled'})})});
 assert.equal((await service.cancelPreapproval('sub123')).status,'cancelled');
 const failed=createMercadoPagoSubscriptions({env:settings,fetchFn:async()=>({ok:true,json:async()=>({id:'sub123',status:'authorized'})})});
 await assert.rejects(failed.cancelPreapproval('sub123'),/unconfirmed/);
});
test('No se invoca un cobro si Mercado Pago todavía no está habilitado',async()=>{
 let invoked=0;
 const service=createMercadoPagoSubscriptions({env:{...settings,MEC_SUBSCRIPTION_MP_CHECKOUT_ENABLED:'0'},fetchFn:async()=>{invoked++;return {ok:true}}});
 await assert.rejects(service.createPreapproval({id:'82cd056c-d53a-43a0-884a-acaa68c47a1f',email:'prueba@example.test',amountClp:12990,backUrl:'https://example.test'}),/not_ready/);
 assert.equal(invoked,0);
});
