'use strict';
const crypto = require('node:crypto');
const rateLimit = require('express-rate-limit');
const MP = 'https://api.mercadopago.com';
const BILLING_DAYS = 30;
const PRICE_CLP = 15000;

// IDPS never handles or stores card numbers. Mercado Pago owns the secure checkout.
const ready = () => Boolean(process.env.DATABASE_URL && process.env.MERCADOPAGO_ACCESS_TOKEN
  && process.env.MERCADOPAGO_WEBHOOK_SECRET && process.env.IDPS_BILLING_CRON_SECRET
  && process.env.RESEND_API_KEY && process.env.PUBLIC_URL);
const clean = value => String(value || '').trim();
const rbdNorm = value => clean(value).toUpperCase().replace(/[^0-9K]/g, '');
const html = value => clean(value).replace(/[&<>"']/g, ch =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const secretHash = value => crypto.createHash('sha256').update(value).digest('hex');
const linkSafe = raw => {
  try {
    const u=new URL(raw);
    return u.protocol==='https:' && !u.username && !u.password
      && (u.hostname==='mercadopago.cl' || u.hostname.endsWith('.mercadopago.cl')
        || u.hostname==='mercadopago.com' || u.hostname.endsWith('.mercadopago.com')
        || u.hostname==='mpago.la') ? u.href : null;
  } catch {return null;}
};
const fmt = date => new Date(date).toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric',timeZone:'America/Santiago'});
const publicUrl = () => {
  const u=new URL(process.env.PUBLIC_URL);
  if(u.protocol!=='https:') throw new Error('PUBLIC_URL debe ser HTTPS');
  return u.origin;
};

async function mp(method, path, payload) {
  if (!ready()) throw new Error('Cobros todavía sin configurar');
  const res=await fetch(MP+path,{method,headers:{
    Authorization:'Bearer '+process.env.MERCADOPAGO_ACCESS_TOKEN,
    'Content-Type':'application/json'
  },body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(12000)});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) { const error=new Error('Mercado Pago no completó la operación');error.status=502;throw error; }
  return data;
}

async function sendMail(to, subject, content) {
  if(!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) throw new Error('Correo de avisos sin configurar');
  const r=await fetch('https://api.resend.com/emails',{
    method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({
      from:process.env.RESEND_FROM,to:[to],subject,
      html:'<div style="font-family:Arial,sans-serif;color:#123052;line-height:1.6">'+content+
        '<p>Atentamente,<br><b>Material Educativo Chile</b></p></div>'
    }),signal:AbortSignal.timeout(12000)
  });
  if(!r.ok) throw new Error('No se pudo entregar aviso por correo');
}

function validateMpSignature(req) {
  const header=clean(req.get('x-signature'));
  const requestId=clean(req.get('x-request-id'));
  const dataId=clean(req.query['data.id']);
  const props=Object.fromEntries(header.split(',').map(p=>p.split('=').map(x=>x.trim())));
  const ts=props.ts, signature=props.v1;
  if(!requestId || !dataId || !/^\d{10,13}$/.test(ts||'') || !/^[a-f0-9]{64}$/i.test(signature||''))return false;
  // Ignore stale/replayed webhooks; both seconds and milliseconds are documented.
  const ms=Number(ts.length===10?Number(ts)*1000:ts);
  if(!Number.isFinite(ms) || Math.abs(Date.now()-ms)>10*60*1000)return false;
  const manifest='id:'+dataId.toLowerCase()+';request-id:'+requestId+';ts:'+ts+';';
  const calculated=crypto.createHmac('sha256',process.env.MERCADOPAGO_WEBHOOK_SECRET||'')
    .update(manifest).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(calculated,'hex'),Buffer.from(signature,'hex'));
}

module.exports=function registerBilling(app,{pool,layout}){
  if(!pool) return;
  async function initBilling(){
    await pool.query('CREATE TABLE IF NOT EXISTS idps_billing_subscriptions ('+
      'id uuid PRIMARY KEY,rbd_norm text NOT NULL,email text NOT NULL,'+
      'preapproval_id text UNIQUE NOT NULL,checkout_url text NOT NULL,'+
      'cancel_token_hash text NOT NULL,status text NOT NULL DEFAULT \'pending\','+
      'next_payment_at timestamptz,last_payment_at timestamptz,access_until timestamptz,'+
      'created_at timestamptz NOT NULL DEFAULT now(),cancelled_at timestamptz)');
    await pool.query('CREATE TABLE IF NOT EXISTS idps_billing_charges ('+
      'payment_id text PRIMARY KEY,subscription_id uuid NOT NULL REFERENCES idps_billing_subscriptions(id),'+
      'paid_at timestamptz NOT NULL DEFAULT now())');
    await pool.query('CREATE TABLE IF NOT EXISTS idps_billing_notices ('+
      'subscription_id uuid NOT NULL REFERENCES idps_billing_subscriptions(id),'+
      'kind text NOT NULL,cycle_key text NOT NULL,sent_at timestamptz NOT NULL DEFAULT now(),'+
      'PRIMARY KEY(subscription_id,kind,cycle_key))');
  }
  async function rowById(id){
    return (await pool.query('SELECT * FROM idps_billing_subscriptions WHERE id=$1',[id])).rows[0];
  }
  function cancelHref(s,token) {
    return publicUrl()+'/suscripcion/cancelar/'+encodeURIComponent(s.id)+'?token='+encodeURIComponent(token);
  }
  function cancelHtml(s,token){
    return '<p>Si no deseas continuar, puedes <a href="'+html(cancelHref(s,token))+'">cancelar la suscripción aquí</a>. '+
      'La cancelación evita nuevos cargos; conservarás el acceso correspondiente a pagos ya realizados hasta su fecha de vencimiento.</p>';
  }
  async function sendNotice(s,kind,cycleKey,token,body){
    const exists=await pool.query('SELECT 1 FROM idps_billing_notices WHERE subscription_id=$1 AND kind=$2 AND cycle_key=$3',
      [s.id,kind,cycleKey]);
    if(exists.rowCount)return false;
    await sendMail(s.email,kind==='reminder'?'Próxima renovación de IDPS':
      kind==='charged'?'Renovación de IDPS confirmada':'Cancelación de IDPS confirmada',
      '<h2>'+ (kind==='reminder'?'Recordatorio de renovación':kind==='charged'?'Pago de renovación confirmado':'Suscripción cancelada') +
      '</h2><p>Establecimiento (RBD): <b>'+html(s.rbd_norm)+'</b></p>'+body+
      (kind==='cancelled'?'':cancelHtml(s,token)));
    await pool.query('INSERT INTO idps_billing_notices(subscription_id,kind,cycle_key) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
      [s.id,kind,cycleKey]);
    return true;
  }

  const limiter=rateLimit({windowMs:15*60*1000,limit:5,standardHeaders:true,legacyHeaders:false});
  app.post('/suscripcion/iniciar',limiter,async(req,res)=>{
    if(!ready())return res.status(503).send('El servicio de suscripciones aún no está habilitado.');
    if(req.body.accept!=='yes')return res.status(400).send('Debes autorizar expresamente los cobros recurrentes.');
    const rbd=rbdNorm(req.body.rbd), email=clean(req.body.email).toLowerCase();
    if(!/^[0-9K]{2,12}$/.test(rbd) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254)
      return res.status(400).send('Revisa el RBD y el correo electrónico.');
    try{
      const current=await pool.query("SELECT * FROM idps_billing_subscriptions "+
        "WHERE rbd_norm=$1 AND lower(email)=$2 AND status IN ('pending','authorized') ORDER BY created_at DESC LIMIT 1",
        [rbd,email]);
      if(current.rowCount){
        const previous=current.rows[0];
        if(previous.status==='pending' && linkSafe(previous.checkout_url))
          return res.redirect(303,previous.checkout_url);
        return res.status(409).send('Ya existe una suscripción para este RBD y correo. Revisa tu correo o comunícate con Material Educativo Chile.');
      }
      const id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('hex');
      // Pending checkout lets the client authorize their own card on Mercado Pago.
      const sub=await mp('POST','/preapproval',{
        reason:'IDPS Material Educativo Chile · $15.000 cada 30 días',
        external_reference:id,payer_email:email,
        auto_recurring:{frequency:BILLING_DAYS,frequency_type:'days',transaction_amount:PRICE_CLP,currency_id:'CLP'},
        back_url:publicUrl()+'/suscripcion/retorno',status:'pending'
      });
      const target=linkSafe(sub.init_point);
      if(!sub.id || !target)throw new Error('Mercado Pago no entregó checkout seguro');
      await pool.query('INSERT INTO idps_billing_subscriptions(id,rbd_norm,email,preapproval_id,checkout_url,cancel_token_hash) VALUES($1,$2,$3,$4,$5,$6)',
        [id,rbd,email,String(sub.id),target,secretHash(token)]);
      return res.redirect(303,target);
    }catch(e){console.error('subscription initiation failed',e.message);
      return res.status(502).send('No se pudo iniciar la suscripción. Intenta nuevamente o contacta al equipo.');}
  });
  app.get('/suscripcion/retorno',(req,res)=>res.send(layout('Suscripción IDPS',
    '<section class="card"><h2>Solicitud de suscripción recibida</h2>'+
    '<p>La vinculación de la tarjeta y el pago serán verificados directamente con Mercado Pago. '+
    'Este retorno no confirma un pago ni activa automáticamente una cuenta.</p>'+
    '<p>Te notificaremos por correo cuando el pago esté confirmado.</p>'+
    '<a href="/" class="btn primary">Volver al inicio</a></section>')));

  app.post('/webhooks/mercadopago/subscriptions',async(req,res)=>{
    if(!ready())return res.sendStatus(503);
    if(!validateMpSignature(req) || clean(req.body?.data?.id).toLowerCase()!==clean(req.query['data.id']).toLowerCase())
      return res.sendStatus(401);
    const kind=clean(req.body?.type), dataId=clean(req.body?.data?.id);
    try{
      if(kind==='subscription_preapproval'){
        const sub=await mp('GET','/preapproval/'+encodeURIComponent(dataId));
        const result=await pool.query('UPDATE idps_billing_subscriptions SET status=$1,next_payment_at=$2 WHERE preapproval_id=$3 AND id::text=$4 RETURNING id',
          [sub.status||'pending',sub.next_payment_date||null,String(sub.id),String(sub.external_reference||'')]);
        if(!result.rowCount)console.warn('Unmatched subscription update');
      }
      if(kind==='subscription_authorized_payment' || kind==='payment'){
        let invoice;
        if(kind==='subscription_authorized_payment'){
          invoice=await mp('GET','/authorized_payments/'+encodeURIComponent(dataId));
        }else{
          const match=await mp('GET','/authorized_payments/search?payment_id='+encodeURIComponent(dataId));
          invoice=(match.results||[]).find(x=>String(x.payment?.id)===dataId);
        }
        if(invoice?.payment?.status==='approved' && invoice.preapproval_id &&
            invoice.currency_id==='CLP' && Number(invoice.transaction_amount)===PRICE_CLP){
          const payment=await mp('GET','/v1/payments/'+encodeURIComponent(invoice.payment.id));
          const subscription=await mp('GET','/preapproval/'+encodeURIComponent(invoice.preapproval_id));
          const stored=await pool.query('SELECT * FROM idps_billing_subscriptions WHERE preapproval_id=$1',
            [invoice.preapproval_id]);
          const s=stored.rows[0];
          if(s && subscription.status==='authorized' && String(subscription.external_reference)===String(s.id)
             && payment.status==='approved' && payment.currency_id==='CLP' && Number(payment.transaction_amount)===PRICE_CLP
             && String(payment.id)===String(invoice.payment.id)){
            const added=await pool.query('INSERT INTO idps_billing_charges(payment_id,subscription_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING payment_id',
              [String(payment.id),s.id]);
            if(added.rowCount){
              const updated=await pool.query(
                "UPDATE idps_billing_subscriptions SET status='authorized',last_payment_at=now(),"+
                "access_until=GREATEST(COALESCE(access_until,now()),now())+INTERVAL '30 days',next_payment_at=$2 "+
                'WHERE id=$1 RETURNING *',[s.id,subscription.next_payment_date||null]);
              const u=updated.rows[0];
              // Do not activate accounts blindly: require a separately verified institutional account.
              await pool.query("UPDATE idps_establishments SET expires_at=$3 "+
                "WHERE rbd_norm=$1 AND lower(email)=$2 AND status='active'",
                [s.rbd_norm,s.email,u.access_until]);
              // User-facing cancellation links use a separate high-entropy secret, never card data.
              // Hash is saved; plaintext token is not recoverable. Renewal emails use a fresh token.
              const token=crypto.randomBytes(32).toString('hex');
              await pool.query('UPDATE idps_billing_subscriptions SET cancel_token_hash=$2 WHERE id=$1',
                [u.id,secretHash(token)]);
              try{await sendNotice(u,'charged',String(payment.id),token,
                '<p>Se confirmó un cobro de <b>$15.000 CLP</b>. Tu acceso cubre 30 días y estará vigente hasta <b>'+
                html(fmt(u.access_until))+'</b>.</p><p>Te avisaremos antes del próximo cargo.</p>');}
              catch(e){console.error('Renewal notice failed',e.message);}
            }
          }
        }
      }
      return res.sendStatus(200);
    }catch(e){console.error('MP webhook processing failed',e.message);return res.sendStatus(503);}
  });

  async function validateCancellation(id, token){
    if(!/^[0-9a-f-]{36}$/.test(id)|| !/^[0-9a-f]{64}$/.test(token))return null;
    const s=await rowById(id);
    if(!s)return null;
    const current=Buffer.from(s.cancel_token_hash,'hex');
    const candidate=Buffer.from(secretHash(token),'hex');
    return current.length===candidate.length && crypto.timingSafeEqual(current,candidate)?s:null;
  }
  app.get('/suscripcion/cancelar/:id',async(req,res)=>{
    const s=await validateCancellation(req.params.id,clean(req.query.token));
    if(!s)return res.status(403).send('Enlace de cancelación no válido. Solicita un nuevo enlace al equipo.');
    if(s.status==='canceled')return res.send(layout('Suscripción cancelada','<div class="card"><h2>Suscripción cancelada</h2><p>Ya no habrá nuevos cobros.</p></div>'));
    res.set('Cache-Control','no-store').send(layout('Cancelar suscripción IDPS',
      '<section class="card"><h2>Cancelar suscripción</h2><p>RBD: '+html(s.rbd_norm)+
      '</p><p>Se detendrán los futuros cobros. El acceso ya pagado permanecerá vigente hasta su vencimiento.</p>'+
      '<form method="post" action="/suscripcion/cancelar/'+encodeURIComponent(s.id)+'">'+
      '<input type="hidden" name="token" value="'+html(clean(req.query.token))+'">'+
      '<button class="btn danger" type="submit">Confirmar cancelación</button></form></section>'));
  });
  app.post('/suscripcion/cancelar/:id',limiter,async(req,res)=>{
    if(!ready())return res.sendStatus(503);
    const s=await validateCancellation(req.params.id,clean(req.body.token));
    if(!s)return res.status(403).send('Enlace de cancelación no válido.');
    if(s.status!=='canceled'){
      try{
        await mp('PUT','/preapproval/'+encodeURIComponent(s.preapproval_id),{status:'canceled'});
        await pool.query("UPDATE idps_billing_subscriptions SET status='canceled',cancelled_at=now() WHERE id=$1",[s.id]);
        try{await sendNotice(s,'cancelled','final','',
          '<p>La renovación automática fue cancelada. No realizaremos nuevos cobros. '+
          (s.access_until?'Tu acceso pagado seguirá vigente hasta '+html(fmt(s.access_until))+'.':'')+'</p>');}
        catch(e){console.error('Cancellation notice failed',e.message);}
      }catch(e){console.error('Cancellation failed',e.message);return res.status(502).send('No pudimos confirmar la cancelación. Intenta nuevamente o contacta a soporte.');}
    }
    res.send(layout('Cancelación de IDPS',
      '<div class="card"><h2>Suscripción cancelada</h2><p>No se realizarán nuevos cargos automáticos.</p>'+
      '<p>Revisa tu correo para la confirmación.</p></div>'));
  });

  // Invoke once daily from Render Cron using a secret header. Never assume the app is awake.
  app.post('/internal/subscriptions/renewal-notices',async(req,res)=>{
    const key=clean(req.get('x-billing-cron-key'));
    const expected=clean(process.env.IDPS_BILLING_CRON_SECRET);
    if(!ready()||!expected||key.length!==expected.length||
      !crypto.timingSafeEqual(Buffer.from(key),Buffer.from(expected)))return res.sendStatus(403);
    let sent=0,errors=0;
    const subscriptions=(await pool.query("SELECT * FROM idps_billing_subscriptions WHERE status='authorized' ORDER BY created_at LIMIT 500")).rows;
    for(const s of subscriptions){
      try{
        const latest=await mp('GET','/preapproval/'+encodeURIComponent(s.preapproval_id));
        await pool.query('UPDATE idps_billing_subscriptions SET status=$2,next_payment_at=$3 WHERE id=$1',
          [s.id,latest.status,latest.next_payment_date||null]);
        if(latest.status!=='authorized'||!latest.next_payment_date)continue;
        const diff=new Date(latest.next_payment_date).getTime()-Date.now();
        if(diff>=0 && diff<=3*86400000){
          // Cancellation token is rotated before sending, so the new email has a live link.
          const key=''+new Date(latest.next_payment_date).toISOString().slice(0,10);
          const exists=await pool.query('SELECT 1 FROM idps_billing_notices WHERE subscription_id=$1 AND kind=$2 AND cycle_key=$3',
            [s.id,'reminder',key]);
          if(exists.rowCount)continue;
          const token=crypto.randomBytes(32).toString('hex');
          await pool.query('UPDATE idps_billing_subscriptions SET cancel_token_hash=$2 WHERE id=$1',
            [s.id,secretHash(token)]);
          if(await sendNotice(s,'reminder',key,token,
            '<p>Tu suscripción IDPS de <b>$15.000 CLP</b> tiene su próximo cargo programado para <b>'+
            html(fmt(latest.next_payment_date))+'</b>.</p><p>El pago se intentará automáticamente en la tarjeta autorizada.</p>'))sent++;
        }
      }catch(e){errors++;console.error('Renewal reminder problem',e.message);}
    }
    res.json({checked:subscriptions.length,sent,errors});
  });
  return initBilling;
};

module.exports.ready = ready;
module.exports.validateMpSignature = validateMpSignature;
