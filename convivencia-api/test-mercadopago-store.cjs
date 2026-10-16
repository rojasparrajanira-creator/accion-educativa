'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {config,isMercadoPagoCheckoutUrl,webhookValid,approvedForOrder,createMercadoPagoStore}=require('./mercadopago-store');

test('checkout cerrado cuando falta autorización de producción',()=>{
  assert.equal(config({MEC_MERCADOPAGO_MODE:'integration'}).configured,false);
  assert.equal(config({MEC_MERCADOPAGO_MODE:'production',MEC_MERCADOPAGO_ACCESS_TOKEN:'token'}).configured,false);
  assert.equal(config({MEC_MERCADOPAGO_MODE:'production',MEC_MERCADOPAGO_ACCESS_TOKEN:'token',MEC_MERCADOPAGO_WEBHOOK_SECRET:'secret'}).configured,true);
});

test('solo URLs legítimas de checkout Mercado Pago',()=>{
  assert.equal(isMercadoPagoCheckoutUrl('https://www.mercadopago.cl/checkout/v1/redirect?pref_id=123'),true);
  assert.equal(isMercadoPagoCheckoutUrl('https://mercadopago.cl.evil.example/checkout'),false);
  assert.equal(isMercadoPagoCheckoutUrl('http://www.mercadopago.cl/checkout'),false);
});

test('verificación del webhook con firma HMAC, solicitud y antigüedad',()=>{
  const secret='test-secret';
  const id='123456';
  const requestId='webhook-test';
  const ts=String(Date.now());
  const manifest='id:'+id+';request-id:'+requestId+';ts:'+ts+';';
  const signature='ts='+ts+',v1='+crypto.createHmac('sha256',secret).update(manifest).digest('hex');
  assert.equal(webhookValid({signature,requestId,dataId:id,secret}),true);
  assert.equal(webhookValid({signature,requestId:'otra-solicitud',dataId:id,secret}),false);
  assert.equal(webhookValid({signature,requestId,dataId:'123457',secret}),false);
  assert.equal(webhookValid({signature:'ts=1,v1='+'0'.repeat(64),requestId,dataId:id,secret}),false);
});

test('ningún pago pendiente, de prueba o ajeno libera un pedido',()=>{
  const order={order_code:'MEC-ABC-123456',total_clp:12990,payment_provider:'mercadopago',payment_preference_id:'preference-valid'};
  const payment={id:567890,external_reference:order.order_code,transaction_amount:12990,currency_id:'CLP',status:'approved',live_mode:true,preference_id:order.payment_preference_id};
  assert.equal(approvedForOrder(payment,order),true);
  assert.equal(approvedForOrder({...payment,status:'pending'},order),false);
  assert.equal(approvedForOrder({...payment,live_mode:false},order),false);
  assert.equal(approvedForOrder({...payment,transaction_amount:13000},order),false);
  assert.equal(approvedForOrder({...payment,currency_id:'ARS'},order),false);
  assert.equal(approvedForOrder({...payment,external_reference:'MEC-OTHER'},order),false);
  assert.equal(approvedForOrder({...payment,preference_id:'otra'},order),false);
  assert.equal(approvedForOrder(payment,{...order,payment_provider:'webpay'}),false);
  const merchant={external_reference:order.order_code,preference_id:order.payment_preference_id,payments:[{id:payment.id}]};
  assert.equal(approvedForOrder({...payment,preference_id:null},order,'production',merchant),true);
  assert.equal(approvedForOrder({...payment,preference_id:null},order,'production',{...merchant,payments:[]}),false);
});

test('preferencia calcula el precio exclusivamente desde datos del servidor',async()=>{
  const env={MEC_MERCADOPAGO_MODE:'production',MEC_MERCADOPAGO_ACCESS_TOKEN:'APP_USR-test',MEC_MERCADOPAGO_WEBHOOK_SECRET:'hook-secret'};
  const requests=[];
  const fetchFn=async(url,options)=>{
    requests.push({url,method:options.method,body:options.body&&JSON.parse(options.body)});
    if(url.endsWith('/checkout/preferences'))return {ok:true,json:async()=>({id:'pref-1',init_point:'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=pref-1'})};
    if(url.endsWith('/v1/payments/123'))return {ok:true,json:async()=>({id:123,status:'approved'})};
    if(url.endsWith('/merchant_orders/456'))return {ok:true,json:async()=>({id:456,preference_id:'pref-1'})};
    throw Error('unexpected mock request');
  };
  const api=createMercadoPagoStore({env,fetchFn});
  const p=await api.createPreference({order:{order_code:'MEC-ABC-123',buyer_name:'Cliente Ejemplo',buyer_email:'test@example.com'},
    items:[{product_id:3,title:'Cuadernillo',quantity:2,price_clp:5990}],
    notificationUrl:'https://convivencia-escolar-api.onrender.com/api/store/mercadopago/webhook'});
  assert.equal(p.preference_id,'pref-1');
  assert.equal(requests[0].body.external_reference,'MEC-ABC-123');
  assert.equal(requests[0].body.items[0].unit_price,5990);
  assert.equal(requests[0].body.items[0].quantity,2);
  assert.equal(requests[0].body.auto_return,'approved');
  assert.equal((await api.getPayment(123)).status,'approved');
  assert.equal((await api.getMerchantOrder(456)).preference_id,'pref-1');
});
