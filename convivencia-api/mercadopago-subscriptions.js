'use strict';
// Proveedor exclusivo para suscripciones de Convivencia Escolar.
// La tienda usa mercadopago-store.js (pagos únicos): NO mezclar tokens ni webhooks.
const crypto=require('crypto');
const MP_API='https://api.mercadopago.com';
function configuration(env=process.env){
 const mode=String(env.MEC_SUBSCRIPTION_MP_MODE||'integration').trim().toLowerCase()==='production'?'production':'integration';
 const accessToken=String(env.MEC_SUBSCRIPTION_MP_ACCESS_TOKEN||'').trim();
 const webhookSecret=String(env.MEC_SUBSCRIPTION_MP_WEBHOOK_SECRET||'').trim();
 const checkoutEnabled=String(env.MEC_SUBSCRIPTION_MP_CHECKOUT_ENABLED||'')==='1';
 return {mode,configured:!!(accessToken&&webhookSecret),checkoutEnabled,
  ready:mode==='production'&&!!(accessToken&&webhookSecret)&&checkoutEnabled};
}
function checkoutUrl(value){
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&(/(^|\.)mercadopago\.cl$/.test(u.hostname)||/(^|\.)mercadopago\.com$/.test(u.hostname));
 }catch(_){return false}
}
function verifyWebhook({secret,signature,requestId,dataId,now=Date.now()}){
 if(!secret||!signature||!requestId||!/^[a-zA-Z0-9_-]{1,100}$/.test(String(dataId||'')))return false;
 const fields={};
 for(const field of String(signature).split(',')){const pos=field.indexOf('=');if(pos>0)fields[field.slice(0,pos).trim()]=field.slice(pos+1).trim()}
 const ts=String(fields.ts||''),hex=String(fields.v1||'');
 if(!/^\d{10,16}$/.test(ts)||!/^[a-fA-F0-9]{64}$/.test(hex))return false;
 const stamp=Number(ts)*(ts.length<=10?1000:1);
 if(!Number.isFinite(stamp)||Math.abs(now-stamp)>15*60*1000)return false;
 const msg='id:'+String(dataId).toLowerCase()+';request-id:'+requestId+';ts:'+ts+';';
 const expected=crypto.createHmac('sha256',secret).update(msg).digest(),actual=Buffer.from(hex,'hex');
 return expected.length===actual.length&&crypto.timingSafeEqual(expected,actual);
}
function verifiedRecurringPayment(invoice,payment,{preapprovalId,externalReference,amountClp,mode='production'}){
 return mode==='production'
  &&String(invoice?.preapproval_id||'')===String(preapprovalId||'')
  &&String(invoice?.external_reference||'')===String(externalReference||'')
  &&String(invoice?.currency_id||'')==='CLP'
  &&Number(invoice?.transaction_amount)===Number(amountClp)
  &&invoice?.payment?.status==='approved'
  &&String(invoice?.payment?.id||'')===String(payment?.id||'')
  &&payment?.live_mode===true
  &&payment?.status==='approved'
  &&String(payment?.currency_id||'')==='CLP'
  &&Number(payment?.transaction_amount)===Number(amountClp)
  &&/^[0-9]{1,20}$/.test(String(payment?.id||''))
  &&Number.isSafeInteger(Number(amountClp))&&Number(amountClp)>0;
}
function createMercadoPagoSubscriptions({env=process.env,fetchFn=fetch}={}){
 const cfg=()=>configuration(env);
 async function request(endpoint,{method='GET',body,idempotencyKey}={}){
  const c=cfg();if(!c.configured)throw Error('subscription_mp_not_configured');
  const response=await fetchFn(MP_API+endpoint,{
   method,signal:AbortSignal.timeout(12000),
   headers:{Authorization:'Bearer '+String(env.MEC_SUBSCRIPTION_MP_ACCESS_TOKEN).trim(),
    'Content-Type':'application/json',...(idempotencyKey?{'X-Idempotency-Key':idempotencyKey}:{})},
   ...(body?{body:JSON.stringify(body)}:{})
  });
  if(!response.ok)throw Error('subscription_mp_api_'+response.status);
  return response.json();
 }
 function validId(id){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(String(id||'')))throw Error('subscription_mp_invalid_id');return encodeURIComponent(String(id))}
 function validInvoiceId(id){if(!/^\d{1,20}$/.test(String(id||'')))throw Error('subscription_mp_invalid_invoice_id');return encodeURIComponent(String(id))}
 async function createPreapproval({id,email,establishmentName,amountClp,backUrl}){
  if(!cfg().ready)throw Error('subscription_mp_not_ready');
  if(!/^[0-9a-f-]{36}$/i.test(String(id||''))||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email||''))||!Number.isSafeInteger(amountClp)||amountClp<=0||!/^https:\/\//.test(String(backUrl||'')))throw Error('subscription_mp_invalid_request');
  const reference='MEC-CONV-'+id;
  const data=await request('/preapproval',{method:'POST',idempotencyKey:'mec-conv-'+id,
   body:{reason:('Convivencia Escolar - '+establishmentName).slice(0,120),external_reference:reference,
    payer_email:email,back_url:backUrl,status:'pending',
    auto_recurring:{frequency:30,frequency_type:'days',transaction_amount:amountClp,currency_id:'CLP'}}});
  if(!data.id||!checkoutUrl(data.init_point)||String(data.external_reference||reference)!==reference)throw Error('subscription_mp_invalid_response');
  return {preapprovalId:String(data.id),checkoutUrl:data.init_point,externalReference:reference};
 }
 async function getPreapproval(id){
  const result=await request('/preapproval/'+validId(id));
  if(String(result.id)!==String(id))throw Error('subscription_mp_id_mismatch');
  return result;
 }
 async function listInvoices(preapprovalId){
  const id=validId(preapprovalId),out=[];
  for(let offset=0;offset<1000;offset+=50){
    const d=await request('/authorized_payments/search?preapproval_id='+id+'&limit=50&offset='+offset);
    const rows=Array.isArray(d.results)?d.results:[];
    out.push(...rows.filter(row=>String(row.preapproval_id)===String(preapprovalId)));
    if(rows.length<50||Number(d.paging?.total)<=offset+50)return out;
  }
  throw Error('subscription_mp_pagination_exceeded');
 }
 async function getInvoice(invoiceId){
  const result=await request('/authorized_payments/'+validInvoiceId(invoiceId));
  if(String(result.id)!==String(invoiceId))throw Error('subscription_mp_invoice_mismatch');
  return result;
 }
 async function getPayment(paymentId){
  const result=await request('/v1/payments/'+validInvoiceId(paymentId));
  if(String(result.id)!==String(paymentId))throw Error('subscription_mp_payment_mismatch');
  return result;
 }
 async function cancelPreapproval(id){
  const result=await request('/preapproval/'+validId(id),{method:'PUT',body:{status:'cancelled'}});
  if(String(result.id)!==String(id)||result.status!=='cancelled')throw Error('subscription_mp_cancellation_unconfirmed');
  return result;
 }
 function webhookValid(req){
  const dataId=req.query?.['data.id']||req.body?.data?.id||'';
  return verifyWebhook({secret:String(env.MEC_SUBSCRIPTION_MP_WEBHOOK_SECRET||''),
   signature:req.headers?.['x-signature'],requestId:req.headers?.['x-request-id'],dataId});
 }
 return {configuration:cfg,createPreapproval,getPreapproval,listInvoices,getInvoice,getPayment,cancelPreapproval,webhookValid};
}
module.exports={configuration,checkoutUrl,verifyWebhook,verifiedRecurringPayment,createMercadoPagoSubscriptions};
