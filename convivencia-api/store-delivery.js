'use strict';
// Entrega automatizada: solo para pedidos con pago Webpay confirmado.
function settings(env){
  const mode=String(env.MEC_WEBPAY_MODE||'integration').toLowerCase()==='production'?'production':'integration';
  const enabled=env.MEC_STORE_DELIVERY_ENABLED==='1';
  const apiKey=String(env.MEC_STORE_RESEND_API_KEY||env.MEC_CONTACT_RESEND_API_KEY||'').trim();
  const from=String(env.MEC_STORE_FROM_EMAIL||env.MEC_CONTACT_FROM_EMAIL||'').trim();
  const replyTo=String(env.MEC_STORE_REPLY_TO_EMAIL||'accioneducativaspa@gmail.com').trim().toLowerCase();
  const testRecipient=String(env.MEC_STORE_TEST_DELIVERY_EMAIL||'').trim().toLowerCase();
  const testReady=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testRecipient);
  return {mode,enabled,apiKey,from,replyTo,testRecipient,ready:enabled&&!!apiKey&&!!from&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)&&(mode==='production'||testReady)};
}
function driveLink(value){
  const url=String(value||'').trim();
  return /^https:\/\/drive\.google\.com\/[^\s<>"']+$/i.test(url)?url:'';
}
function verifiedTaxDocument(doc){
  if(!doc || !['issued','voucher_validated'].includes(doc.status))return false;
  if(!['boleta_afecta','boleta_exenta','factura_afecta','factura_exenta','voucher'].includes(doc.document_type))return false;
  return /^https:\/\/[^\s<>"']+$/i.test(String(doc.document_url||''));
}
function compose(order,items,taxDocument=null,contactEmail='accioneducativaspa@gmail.com'){
  if(!order||order.status!=='paid')throw Error('payment_not_confirmed');
  if(!Array.isArray(items)||!items.length)throw Error('delivery_items_missing');
  const name=String(order.buyer_name||'').replace(/[\r\n]+/g,' ').trim();
  const code=String(order.order_code||'').replace(/[\r\n]+/g,' ').trim();
  let text='Hola '+name+',\n\nGracias por comprar en Material Educativo Chile.\nTu pago fue confirmado. Aquí tienes tus materiales digitales:\n\n';
  for(const item of items){
    const url=driveLink(item.delivery_url_snapshot);
    if(!url)throw Error('invalid_delivery_link');
    text+='- '+String(item.product_title||'Material educativo').replace(/[\r\n]+/g,' ').trim()+'\n  '+url+'\n';
  }
  if(taxDocument){
    if(!verifiedTaxDocument(taxDocument))throw Error('tax_document_not_verified');
    const name=taxDocument.document_type==='voucher'?'Comprobante de pago electrónico':taxDocument.document_type.startsWith('factura_')?'Factura electrónica':'Boleta electrónica';
    text+='\n'+name+':\n'+taxDocument.document_url+'\n';
  }
  text+='\nNúmero de pedido: '+code+'\n\nSi necesitas ayuda para acceder al material, escríbenos a '+contactEmail+'.\nMaterial Educativo Chile\nwww.materialeducativochile.cl\n';
  return {subject:'Tus materiales digitales - pedido '+code,text};
}
function createStoreDelivery({pool,env=process.env,fetchFn=fetch,sendOverride,logger=console}){
  let processing=false;
  function configuration(){
    const c=settings(env);
    return {mode:c.mode,enabled:c.enabled,email_ready:c.ready,test_mode:c.mode!=='production',provider_configured:!!c.apiKey,sender_configured:!!c.from,test_recipient_configured:!!c.testRecipient};
  }
  async function enqueue(orderId){
    const mode=settings(env).mode;
    const r=await pool.query("insert into store_delivery_jobs(order_id,payment_mode) select id,$2 from store_orders where id=$1 and status='paid' on conflict(order_id) do nothing returning order_id",[orderId,mode]);
    return r.rowCount>0;
  }
  async function send(c,job,cfg){
    const oq=await c.query('select id,order_code,buyer_name,buyer_email,status from store_orders where id=$1',[job.order_id]);
    const order=oq.rows[0];
    if(!order||order.status!=='paid')throw Error('payment_not_confirmed');
    const iq=await c.query('select product_title,delivery_url_snapshot from store_order_items where order_id=$1 order by id',[job.order_id]);
    // La entrega digital no queda bloqueada por la emisión tributaria manual.
    // Solo se adjunta un documento si ya existe uno registrado como emitido/validado.
    const tax=await c.query('select status,document_type,document_url from store_tax_documents where order_id=$1',[job.order_id]);
    const taxDocument=verifiedTaxDocument(tax.rows[0])?tax.rows[0]:null;
    const email=compose(order,iq.rows,taxDocument,cfg.replyTo);
    const to=cfg.mode==='production'?String(order.buyer_email||'').trim().toLowerCase():cfg.testRecipient;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))throw Error('invalid_recipient');
    const subject=(cfg.mode==='integration'?'[PRUEBA - SIN COMPRA REAL] ':'')+email.subject;
    if(sendOverride)await sendOverride({from:cfg.from,to,replyTo:cfg.replyTo,subject,text:email.text,orderId:job.order_id});
    else {
      const result=await fetchFn('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),
        headers:{Authorization:'Bearer '+cfg.apiKey,'Content-Type':'application/json','Idempotency-Key':'mec-store-delivery-'+job.order_id},
        body:JSON.stringify({from:cfg.from,to:[to],reply_to:cfg.replyTo,subject,text:email.text})});
      if(!result.ok)throw Error('mail_provider_status_'+result.status);
    }
    await c.query("update store_delivery_jobs set status='sent',sent_at=now(),attempts=attempts+1,last_error=null,updated_at=now() where order_id=$1",[job.order_id]);
    await c.query("insert into store_delivery_events(order_id,status,buyer_email,sent_at,detail) values($1,'sent',$2,now(),$3)",[job.order_id,to,cfg.mode==='integration'?'Envío de prueba':'Enviado al cliente']);
  }
  async function flush(){
    const cfg=settings(env);
    if(!cfg.ready||processing)return {ready:cfg.ready,sent:0};
    processing=true;
    let conn,held=false,sent=0;
    try{
      conn=await pool.connect();
      const lock=await conn.query("select pg_try_advisory_lock(hashtext('mec-store-delivery')) held");
      held=lock.rows[0]?.held===true;
      if(!held)return {ready:true,sent:0};
      const jobs=await conn.query("select order_id,attempts from store_delivery_jobs where payment_mode=$1 and status in ('pending','failed') and attempts<6 and next_attempt_at<=now() order by created_at limit 10",[cfg.mode]);
      for(const job of jobs.rows){
        try{await send(conn,job,cfg);sent++}
        catch(error){
          const reason=String(error?.message||'delivery_failed').slice(0,90);
          await conn.query("update store_delivery_jobs set status='failed',attempts=attempts+1,last_error=$2,next_attempt_at=now()+interval '5 minutes'*least(attempts+1,12),updated_at=now() where order_id=$1",[job.order_id,reason]);
          await conn.query("insert into store_delivery_events(order_id,status,buyer_email,detail) select id,'failed',buyer_email,$2 from store_orders where id=$1",[job.order_id,reason]);
          logger.error('Store delivery failed for order '+job.order_id+': '+reason);
        }
      }
      return {ready:true,sent};
    }finally{
      if(held&&conn)await conn.query("select pg_advisory_unlock(hashtext('mec-store-delivery'))").catch(()=>{});
      if(conn)conn.release();
      processing=false;
    }
  }
  function wake(){flush().catch(e=>logger.error('Store delivery worker error: '+String(e?.message||'unknown')))}
  function startWorkers(){const timer=setInterval(wake,60000);if(timer.unref)timer.unref();wake();return timer}
  return {configuration,enqueue,flush,wake,startWorkers};
}
module.exports={settings,driveLink,verifiedTaxDocument,compose,createStoreDelivery};
