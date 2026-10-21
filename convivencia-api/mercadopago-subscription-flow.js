'use strict';
// Flujo exclusivo de suscripciones recurrentes. No comparte URLs, claves ni tablas de cobro con la tienda.
// Inhabilitado por defecto hasta pruebas reales controladas.
const {createMercadoPagoSubscriptions,verifiedRecurringPayment}=require('./mercadopago-subscriptions');
const crypto=require('crypto');
function attachMercadoPagoSubscriptions({app,pool,getByToken,locked,rateLimit,queueMail,wakeMail,publicOrigin,getMailReady=()=>true,env=process.env}){
 const mp=createMercadoPagoSubscriptions({env});
 const mpReady=()=>mp.configuration().ready&&getMailReady();
 async function synchronize(id){
  if(!mpReady())return {disabled:true};
  return locked(id,async c=>{
   const s=(await c.query('select * from mec_subscriptions where id=$1',[id])).rows[0];
   if(!s||s.payment_provider!=='mercadopago'||!s.mp_preapproval_id)return {skipped:true};
   const pre=await mp.getPreapproval(s.mp_preapproval_id);
   const reference='MEC-CONV-'+s.id;
   if(String(pre.external_reference)!==reference||
      Number(pre.auto_recurring?.frequency)!==30||String(pre.auto_recurring?.frequency_type)!=='days'||
      String(pre.auto_recurring?.currency_id)!=='CLP'||
      Number(pre.auto_recurring?.transaction_amount)!==Number(s.price_clp)||
      String(pre.id)!==String(s.mp_preapproval_id))throw Error('mp_preapproval_mismatch');
   const invoices=await mp.listInvoices(s.mp_preapproval_id);
   const sorted=invoices.sort((a,b)=>new Date(a.date_created||0)-new Date(b.date_created||0));
   let confirmed=0;
   for(const invoice of sorted){
    if(!/^\d{1,20}$/.test(String(invoice.id||''))||!/^\d{1,20}$/.test(String(invoice.payment?.id||'')))continue;
    if(invoice.payment?.status!=='approved')continue;
    const details=await mp.getInvoice(invoice.id);
    const payment=await mp.getPayment(details.payment?.id);
    if(!verifiedRecurringPayment(details,payment,{preapprovalId:s.mp_preapproval_id,externalReference:reference,amountClp:s.price_clp,mode:mp.configuration().mode}))continue;
    await c.query('begin');
    try{
     const entry=await c.query('insert into mec_subscription_mp_invoices(invoice_id,subscription_id,payment_id,amount_clp) values($1,$2,$3,$4) on conflict do nothing returning invoice_id',
      [String(details.id),s.id,String(payment.id),s.price_clp]);
     if(entry.rowCount){
      confirmed++;
      const current=(await c.query('select * from mec_subscriptions where id=$1',[s.id])).rows[0];
      if(current.cancelled_at){
       await queueMail(c,s.id,String(env.MEC_SUBSCRIPTION_NOTIFY_EMAIL||env.MEC_PLATFORM_ADMIN_EMAIL||'accioneducativaspa@gmail.com'),
        '[MEC] Cobro posterior a cancelación para revisión',
        'Se detectó un pago aprobado en una suscripción cancelada. Revisar posible devolución. Referencia: '+reference);
      }else if(!current.activated_at){
       await c.query("update mec_subscriptions set status='paid_pending_activation',updated_at=now() where id=$1",[s.id]);
       await queueMail(c,s.id,s.email,'Pago confirmado · Convivencia Escolar',
        'Se confirmó un pago de $'+s.price_clp+'. Nuestro equipo revisará la cuenta y enviará el acceso por correo tras autorizar el establecimiento.');
       await queueMail(c,s.id,String(env.MEC_SUBSCRIPTION_NOTIFY_EMAIL||env.MEC_PLATFORM_ADMIN_EMAIL||'accioneducativaspa@gmail.com'),
        '[MEC] Pago aprobado · nueva suscripción','Pago confirmado para '+s.establishment_name+' (RBD '+s.rbd+'). Activar desde superadministración.');
      }else{
       const start=Math.max(Date.now(),new Date(current.access_until||0).getTime());
       const until=new Date(start+30*24*60*60*1000);
       await c.query("update mec_subscriptions set status='active',access_until=$1,next_charge_at=$2,updated_at=now() where id=$3",[until,until,s.id]);
       await queueMail(c,s.id,s.email,'Renovación aprobada · Convivencia Escolar',
        'Se confirmó el pago de renovación por $'+s.price_clp+'. Tu acceso seguirá vigente hasta '+until.toISOString()+'.');
      }
     }
     await c.query('commit');
    }catch(e){await c.query('rollback');throw e}
   }
   await c.query('update mec_subscriptions set mp_last_checked_at=now() where id=$1',[s.id]);
   if(confirmed)wakeMail();
   return {confirmed,checked:sorted.length};
  });
 }
 async function beforeCancel(s){
  if(s?.payment_provider==='mercadopago'&&s.mp_preapproval_id&&!s.cancelled_at){
   await mp.cancelPreapproval(s.mp_preapproval_id);
  }
 }
 app.post('/api/subscriptions/mercadopago/start',rateLimit({windowMs:3600000,max:8}),async(req,res)=>{
  if(!mpReady())return res.status(503).json({ok:false,error:'billing_not_ready'});
  try{
   const s=await getByToken(req.body?.token);
   if(!s)return res.status(404).json({ok:false,error:'subscription_not_found'});
   if(s.payment_provider!=='mercadopago')return res.status(409).json({ok:false,error:'payment_provider_mismatch'});
   const result=await locked(s.id,async c=>{
    const row=(await c.query('select * from mec_subscriptions where id=$1',[s.id])).rows[0];
    if(row.cancelled_at||row.activated_at||row.status==='paid_pending_activation'||!['requested','enrolling','payment_pending'].includes(row.status))throw Error('enrollment_not_available');
    if(row.mp_preapproval_id){
     const old=await mp.getPreapproval(row.mp_preapproval_id);
     if(old.status!=='pending'||String(old.external_reference)!=='MEC-CONV-'+row.id)throw Error('enrollment_not_available');
     if(!old.init_point)throw Error('enrollment_not_available');
     return {url:old.init_point};
    }
    const created=await mp.createPreapproval({id:row.id,email:row.email,establishmentName:row.establishment_name,
     amountClp:row.price_clp,backUrl:publicOrigin+'/solicitud-cuenta.html?solicitud='+encodeURIComponent(row.id)});
    await c.query("update mec_subscriptions set mp_preapproval_id=$1,status='enrolling',updated_at=now() where id=$2",[created.preapprovalId,row.id]);
    return {url:created.checkoutUrl};
   });
   res.json({ok:true,...result,payment_provider:'mercadopago'});
  }catch(e){res.status(409).json({ok:false,error:'enrollment_not_available'})}
 });
 app.post('/api/subscriptions/mercadopago/sync',rateLimit({windowMs:60000,max:8}),async(req,res)=>{
  try{
   const s=await getByToken(req.body?.token);
   if(!s)return res.status(404).json({ok:false,error:'subscription_not_found'});
   if(s.payment_provider!=='mercadopago')return res.status(409).json({ok:false,error:'payment_provider_mismatch'});
   res.json({ok:true,...await synchronize(s.id)});
  }catch(e){res.status(503).json({ok:false,error:'reconciliation_unavailable'})}
 });
 app.post('/api/subscriptions/mercadopago/webhook',rateLimit({windowMs:60000,max:100}),async(req,res)=>{
  try{
   if(!mpReady())return res.sendStatus(503);
   if(!mp.webhookValid(req))return res.sendStatus(401);
   const type=String(req.query.type||req.body?.type||'').toLowerCase();
   const notificationId=req.query['data.id']||req.body?.data?.id;
   let preapprovalId='';
   if(type==='subscription_authorized_payment'){
    const invoice=await mp.getInvoice(notificationId);
    preapprovalId=String(invoice.preapproval_id||'');
   }else if(type==='subscription_preapproval'){
    preapprovalId=String(notificationId||'');
   }else return res.json({ok:true,ignored:true});
   if(!preapprovalId)return res.sendStatus(400);
   const q=await pool.query("select id from mec_subscriptions where payment_provider='mercadopago' and mp_preapproval_id=$1",[preapprovalId]);
   if(!q.rowCount)return res.json({ok:true,unknown:true});
   await synchronize(q.rows[0].id);
   return res.json({ok:true});
  }catch(e){res.sendStatus(503)}
 });
 async function worker(){
  if(!mpReady())return;
  const rows=await pool.query("select id from mec_subscriptions where payment_provider='mercadopago' and mp_preapproval_id is not null and cancelled_at is null order by mp_last_checked_at asc nulls first limit 25");
  for(const s of rows.rows){try{await synchronize(s.id)}catch(e){console.error('Mercado Pago subscription reconciliation needs review')}}
 }
 function startWorkers(){const timer=setInterval(()=>worker().catch(()=>{}),5*60000);timer.unref()}
 return {configuration:()=>({...mp.configuration(),ready:mpReady()}),synchronize,beforeCancel,startWorkers};
}
module.exports={attachMercadoPagoSubscriptions};
