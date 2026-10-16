'use strict';
// Checkout Pro de Mercado Pago para pagos UNICOS de la tienda.
// No se conecta a IDPS ni a las suscripciones de Convivencia Escolar.
const crypto=require('crypto');
const API='https://api.mercadopago.com';
function config(env=process.env){
  const mode=String(env.MEC_MERCADOPAGO_MODE||'integration').trim().toLowerCase()==='production'?'production':'integration';
  const accessToken=String(env.MEC_MERCADOPAGO_ACCESS_TOKEN||'').trim();
  const webhookSecret=String(env.MEC_MERCADOPAGO_WEBHOOK_SECRET||'').trim();
  return {mode,accessToken,webhookSecret,configured:!!(accessToken&&webhookSecret)};
}
function isMercadoPagoCheckoutUrl(input){
  try{
    const u=new URL(input);
    return u.protocol==='https:'&&['www.mercadopago.cl','mercadopago.cl','www.mercadopago.com','mercadopago.com'].includes(u.hostname);
  }catch{return false}
}
function webhookValid({signature,requestId,dataId,secret}){
  if(!secret||!signature||!requestId||!dataId||!/^\\d{1,20}$/.test(String(dataId)))return false;
  const fields=Object.fromEntries(String(signature).split(',').map(part=>part.trim().split(/=(.*)/s).slice(0,2)).filter(p=>p.length===2));
  const ts=String(fields.ts||''),sig=String(fields.v1||'');
  if(!/^\\d{10,16}$/.test(ts)||! /^[0-9a-f]{64}$/i.test(sig))return false;
  const ms=Number(ts)*(ts.length<=10?1000:1);
  if(!Number.isFinite(ms)||Math.abs(Date.now()-ms)>15*60*1000)return false;
  const manifest='id:'+String(dataId).toLowerCase()+';request-id:'+String(requestId)+';ts:'+ts+';';
  const expected=crypto.createHmac('sha256',secret).update(manifest).digest();
  const received=Buffer.from(sig,'hex');
  return expected.length===received.length&&crypto.timingSafeEqual(expected,received);
}
function approvedForOrder(payment,order,mode='production'){
  return mode==='production'&&payment?.live_mode===true&&payment?.status==='approved'
    &&String(payment?.currency_id||'')==='CLP'
    &&Number(payment?.transaction_amount)===Number(order?.total_clp)
    &&String(payment?.external_reference||'')===String(order?.order_code||'')
    &&String(payment?.preference_id||'')===String(order?.payment_preference_id||'')
    &&!!order?.payment_preference_id&&order?.payment_provider==='mercadopago'
    &&/^\\d{1,20}$/.test(String(payment?.id||''));
}
function createMercadoPagoStore({env=process.env,fetchFn=fetch}={}){
  function configuration(){return config(env)}
  async function call(endpoint,options={}){
    const c=configuration();
    if(!c.accessToken)throw Error('mercadopago_not_configured');
    const response=await fetchFn(API+endpoint,{
      method:options.method||'GET',
      signal:AbortSignal.timeout(10000),
      headers:{Authorization:'Bearer '+c.accessToken,'Content-Type':'application/json',...options.headers},
      ...(options.body?{body:JSON.stringify(options.body)}:{})
    });
    if(!response.ok)throw Error('mercadopago_api_'+response.status);
    return response.json();
  }
  async function createPreference({order,items,notificationUrl}){
    const c=configuration();
    if(!c.configured||c.mode!=='production')throw Error('mercadopago_not_ready');
    if(!items.length||! /^https:\/\//.test(notificationUrl))throw Error('mercadopago_preference_invalid');
    const reference=String(order.order_code);
    const base='https://materialeducativochile.cl/tienda.html?payment=';
    const body={
      items:items.map(p=>({id:String(p.product_id),title:String(p.title).slice(0,180),currency_id:'CLP',quantity:Number(p.quantity),unit_price:Number(p.price_clp)})),
      payer:{name:String(order.buyer_name),email:String(order.buyer_email)},
      external_reference:reference,
      notification_url:notificationUrl,
      back_urls:{
        success:base+'pending&order='+encodeURIComponent(reference),
        pending:base+'pending&order='+encodeURIComponent(reference),
        failure:base+'failed&order='+encodeURIComponent(reference)
      },
      auto_return:'approved',
      statement_descriptor:'MATERIAL EDUCATIVO'
    };
    const result=await call('/checkout/preferences',{method:'POST',headers:{'X-Idempotency-Key':'mec-store-'+reference},body});
    if(!result.id||!isMercadoPagoCheckoutUrl(result.init_point))throw Error('mercadopago_preference_invalid');
    return {preference_id:String(result.id),url:result.init_point};
  }
  async function getPayment(id){
    if(!/^\\d{1,20}$/.test(String(id||'')))throw Error('invalid_mercadopago_payment_id');
    const payment=await call('/v1/payments/'+encodeURIComponent(String(id)));
    if(String(payment.id)!==String(id))throw Error('mercadopago_payment_mismatch');
    return payment;
  }
  return {configuration,createPreference,getPayment,verifyWebhook:(req)=>webhookValid({
    signature:req.headers['x-signature'],
    requestId:req.headers['x-request-id'],
    dataId:req.query['data.id'],
    secret:configuration().webhookSecret
  })};
}
module.exports={config,isMercadoPagoCheckoutUrl,webhookValid,approvedForOrder,createMercadoPagoStore};
