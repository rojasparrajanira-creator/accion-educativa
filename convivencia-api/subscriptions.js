'use strict';
const crypto=require('crypto');
const {Oneclick,Options,Environment,TransactionDetail}=require('transbank-sdk');
const {PLANS,hash,cipher,authorized,active,temporaryExpired,nextPeriod}=require('./subscription-domain');
function createSubscriptions({app,pool,requireAuth,requireRole,rateLimit,makePassword,validRut,normalizeRut,env=process.env,gatewayOverride,mailOverride,lockOverride}){
 const vault=cipher(env.MEC_SUBSCRIPTION_ENCRYPTION_KEY||env.MEC_GOOGLE_TOKEN_ENCRYPTION_KEY);
 const publicOrigin=String(env.MEC_SUBSCRIPTION_WEB_ORIGIN||'https://www.materialeducativochile.cl/convivencia-escolar').replace(/\/$/,'');
 const apiOrigin=String(env.MEC_SUBSCRIPTION_API_ORIGIN||'https://convivencia-escolar-api.onrender.com').replace(/\/$/,'');
 const notifyEmail=String(env.MEC_SUBSCRIPTION_NOTIFY_EMAIL||env.MEC_PLATFORM_ADMIN_EMAIL||'accioneducativaspa@gmail.com').trim();
 const mailKey=String(env.MEC_SUBSCRIPTION_RESEND_API_KEY||env.MEC_CONTACT_RESEND_API_KEY||'');
 const mailFrom=String(env.MEC_SUBSCRIPTION_FROM_EMAIL||env.MEC_CONTACT_FROM_EMAIL||'');
 function configuration(){
  const production=env.MEC_ONECLICK_MODE==='production';
  const code=String(env.MEC_ONECLICK_COMMERCE_CODE||''),child=String(env.MEC_ONECLICK_CHILD_COMMERCE_CODE||''),apiKey=String(env.MEC_ONECLICK_API_KEY||'');
  const configured=production&&!!(code&&child&&apiKey&&vault.ready);
  const mailReady=!!(vault.ready&&((mailKey&&mailFrom)||mailOverride));
  return {configured,mailReady,ready:configured&&mailReady,code,child,apiKey,production};
 }
 function gateway(){if(gatewayOverride)return gatewayOverride;const c=configuration();if(!c.ready)throw Error('billing_not_ready');const opts=new Options(c.code,c.apiKey,Environment.Production);return {inscription:new Oneclick.MallInscription(opts),transaction:new Oneclick.MallTransaction(opts),child:c.child}}
 async function locked(id,fn){
  if(lockOverride)return lockOverride(id,fn);
  const c=await pool.connect();let held=false;
  try{await c.query('select pg_advisory_lock(hashtext($1))',['mec-subscription:'+id]);held=true;return await fn(c)}finally{if(held)await c.query('select pg_advisory_unlock(hashtext($1))',['mec-subscription:'+id]).catch(()=>{});c.release()}
 }
 async function queueMail(c,subscriptionId,recipient,subject,text){
  if(!vault.ready)return false;
  await c.query('insert into mec_subscription_mail(id,subscription_id,recipient,subject,body_encrypted) values($1,$2,$3,$4,$5)',[crypto.randomUUID(),subscriptionId,recipient,subject,vault.encrypt(text)]);return true;
 }
 async function flushMail(){
  if(!configuration().mailReady)return;
  const c=await pool.connect();let held=false;
  try{
   const lock=await c.query("select pg_try_advisory_lock(hashtext('mec-subscription-mail')) held");held=lock.rows[0]?.held;if(!held)return;
   const q=await c.query("select * from mec_subscription_mail where status<>'sent' and attempts<8 and next_attempt_at<=now() order by created_at limit 20");
   for(const mail of q.rows){
    try{
     const text=vault.decrypt(mail.body_encrypted);
     if(mailOverride)await mailOverride({...mail,text});
     else {const r=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+mailKey,'Content-Type':'application/json','Idempotency-Key':'mec-'+mail.id},body:JSON.stringify({from:mailFrom,to:[mail.recipient],subject:mail.subject,text})});if(!r.ok)throw Error('mail_delivery_failed')}
     await c.query("update mec_subscription_mail set status='sent',sent_at=now(),body_encrypted=null,attempts=attempts+1 where id=$1",[mail.id]);
    }catch(e){await c.query("update mec_subscription_mail set status='failed',attempts=attempts+1,next_attempt_at=now()+interval '15 minutes' where id=$1",[mail.id]);console.error('Subscription mail delivery failed')}
   }
  }finally{if(held)await c.query("select pg_advisory_unlock(hashtext('mec-subscription-mail'))").catch(()=>{});c.release()}
 }
 function wakeMail(){flushMail().catch(()=>console.error('Subscription mail queue unavailable'))}
 async function accessStatus(establishmentId,c=pool){const q=await c.query('select activated_at,access_until,cancelled_at from mec_subscriptions where establishment_id=$1',[establishmentId]);return active(q.rows[0])}
 async function getByToken(token){if(typeof token!=='string'||token.length<32||token.length>100)return null;const q=await pool.query('select * from mec_subscriptions where management_token_hash=$1 or id in (select subscription_id from mec_subscription_cancellation_tokens where token_hash=$1)',[hash(token)]);return q.rows[0]||null}
 function rbdOf(value){const raw=String(value||'').trim();return /^\d{1,6}(?:-[0-9Kk])?$/.test(raw)?String(Number(raw.split('-')[0])):''}
 async function cancellationLink(c,id){const token=crypto.randomBytes(32).toString('base64url');await c.query('insert into mec_subscription_cancellation_tokens(id,subscription_id,token_hash) values($1,$2,$3)',[crypto.randomUUID(),id,hash(token)]);return '\n\nCancelar suscripción de Plataforma de Convivencia Escolar:\n'+publicOrigin+'/cancelar-suscripcion.html#'+token}
 function summary(s){return {id:s.id,plan_code:s.plan_code,student_limit:s.student_limit,price_clp:s.price_clp,status:s.status,activated_at:s.activated_at,access_until:s.access_until,next_charge_at:s.next_charge_at,cancelled_at:s.cancelled_at,access_active:active(s)}}
 function paymentDestination(id,status){return publicOrigin+'/solicitud-cuenta.html?solicitud='+encodeURIComponent(id)+'&resultado='+status}
 async function charge(id,initial=false){return locked(id,async c=>{
  const sq=await c.query('select * from mec_subscriptions where id=$1',[id]);const s=sq.rows[0];
  if(!s||!s.tbk_user_encrypted)return {skipped:true};
  let payment,result;
  if(s.cancelled_at){
   // Cancelar impide nuevas autorizaciones, pero un cargo previo incierto debe verificarse.
   const pending=await c.query("select * from mec_subscription_payments where subscription_id=$1 and state in ('processing','uncertain') order by created_at desc limit 1",[id]);payment=pending.rows[0];if(!payment)return {skipped:true};initial=payment.cycle_key==='initial';
  }else{
   if(initial){if(s.activated_at||s.status==='paid_pending_activation')return {skipped:true}}
   else if(!s.activated_at||!s.next_charge_at||new Date(s.next_charge_at)>new Date())return {skipped:true};
  }
  const cycle=payment?.cycle_key||(initial?'initial':new Date(s.next_charge_at).toISOString());
  if(!payment){const pq=await c.query('select * from mec_subscription_payments where subscription_id=$1 and cycle_key=$2',[id,cycle]);payment=pq.rows[0]}
  if(payment?.state==='authorized')return {approved:true};
  if(payment?.state==='declined')return {declined:true};
  const gw=gateway();
  if(payment){
   // Un intento incierto sólo se consulta: no se emite otro cargo.
   try{result=await gw.transaction.status(payment.buy_order)}catch(e){return {uncertain:true}}
  }else{
   const order='MEC'+crypto.randomBytes(10).toString('hex');
   const pq=await c.query('insert into mec_subscription_payments(subscription_id,cycle_key,buy_order,amount_clp) values($1,$2,$3,$4) returning *',[id,cycle,order,s.price_clp]);payment=pq.rows[0];
   try{result=await gw.transaction.authorize(s.username,vault.decrypt(s.tbk_user_encrypted),order,[new TransactionDetail(s.price_clp,gw.child,order,1)])}
   catch(e){await c.query("update mec_subscription_payments set state='uncertain' where id=$1",[payment.id]);return {uncertain:true}}
  }
  const approved=authorized(result,payment,gw.child),detail=result?.details?.[0];
  // Respuestas incompletas no se consideran rechazos ni autorizaciones.
  if(!approved&&!(result?.buy_order===payment.buy_order&&detail?.buy_order===payment.buy_order&&String(detail?.commerce_code)===String(gw.child)&&Number(detail?.amount)===Number(payment.amount_clp)&&detail?.status==='FAILED'&&Number(detail.response_code)!==0)){
   await c.query("update mec_subscription_payments set state='uncertain' where id=$1",[payment.id]);return {uncertain:true};
  }
  await c.query('begin');
  try{
   await c.query('update mec_subscription_payments set state=$1,provider_status=$2,response_code=$3,authorization_code=$4,resolved_at=now() where id=$5',[approved?'authorized':'declined',detail.status,detail.response_code,detail.authorization_code||null,payment.id]);
   if(approved&&initial&&s.cancelled_at){
    await queueMail(c,id,notifyEmail,'[MEC] Pago confirmado después de cancelación','La solicitud '+id+' está cancelada. Se confirmó un cargo previo por $'+s.price_clp+'. Revisar devolución; no activar la cuenta.');
    await queueMail(c,id,s.email,'Pago en revisión · Material Educativo Chile','Se confirmó un pago previo de tu solicitud cancelada. No se activará la cuenta ni habrá nuevos cobros. Nuestro equipo revisará la devolución correspondiente.');
   }else if(approved&&initial){
    await c.query("update mec_subscriptions set status='paid_pending_activation',updated_at=now() where id=$1",[id]);
    await queueMail(c,id,notifyEmail,'[MEC] Pago aprobado · solicitud de cuenta','Se confirmó el pago de $'+s.price_clp+' para '+s.establishment_name+' (RBD '+s.rbd+'). Profesional: '+s.full_name+'. Revisa y activa la cuenta en '+publicOrigin+'/admin-centro.html#suscripciones');
    await queueMail(c,id,s.email,'Pago aprobado · Material Educativo Chile','Estimado/a '+s.full_name+':\n\nTu pago fue aprobado. El equipo de Material Educativo Chile revisará y autorizará tu establecimiento. Los 30 días de acceso comenzarán al activar la cuenta. Recibirás tu usuario y clave provisoria por este correo.'+await cancellationLink(c,id));
   }else if(approved){
    // No cobrar períodos sin acceso tras una interrupción prolongada del servicio.
    const until=nextPeriod(new Date(Math.max(new Date(s.access_until).getTime(),Date.now())));
    await c.query("update mec_subscriptions set status=$1,access_until=$2,next_charge_at=$3,updated_at=now() where id=$4",[s.cancelled_at?'cancelled':'active',until,s.cancelled_at?null:until,id]);
    await queueMail(c,id,s.email,'Renovación aprobada · Material Educativo Chile','Se aprobó la renovación de tu plan por $'+s.price_clp+'. Tu acceso estará vigente hasta '+until.toISOString()+'. Puedes cancelar futuras renovaciones desde el enlace de este correo.'+await cancellationLink(c,id));
   }else{
    await c.query("update mec_subscriptions set status=case when cancelled_at is not null then 'cancelled' else 'payment_failed' end,updated_at=now() where id=$1",[id]);
    await queueMail(c,id,s.email,'Pago no aprobado · Material Educativo Chile','No se aprobó el pago de tu plan. No se amplió la vigencia. Contacta al equipo para revisar tu suscripción.');
    await queueMail(c,id,notifyEmail,'[MEC] Pago no aprobado','Revisa la suscripción '+id+' en superadministración.');
   }
   await c.query('commit');
  }catch(e){await c.query('rollback');throw e}
  wakeMail();return {approved,declined:!approved};
 })}
 async function cancel(id){return locked(id,async c=>{
  const q=await c.query('select * from mec_subscriptions where id=$1',[id]);const s=q.rows[0];if(!s)throw Error('subscription_not_found');
  if(s.cancelled_at)return summary(s);
  await c.query('begin');
  try{
   const u=await c.query("update mec_subscriptions set cancelled_at=now(),next_charge_at=null,status='cancelled',updated_at=now() where id=$1 returning *",[id]);
   await queueMail(c,id,s.email,'Suscripción cancelada · Material Educativo Chile','Se cancelaron las próximas renovaciones. '+(s.access_until?'Tu acceso se mantiene hasta '+new Date(s.access_until).toISOString()+'.':'Tu cuenta no será activada. Si existe un pago pendiente de revisión, nuestro equipo lo revisará.')+' No se efectuarán nuevos cargos.');
   await queueMail(c,id,notifyEmail,'[MEC] Suscripción cancelada','Se canceló la renovación de '+s.establishment_name+' (RBD '+s.rbd+'). Revisa cualquier pago pendiente de activación.');
   await c.query('commit');wakeMail();return summary(u.rows[0]);
  }catch(e){await c.query('rollback');throw e}
 })}
 // Bloquear acciones autenticadas iniciadas desde un sitio ajeno (cookies SameSite=None).
 const origins=new Set(['https://www.materialeducativochile.cl','https://materialeducativochile.cl','https://convivencia-escolar-material-educativo.onrender.com','https://material-educativo-chile-portal.onrender.com',new URL(publicOrigin).origin,...String(env.MEC_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean)]);
 app.use((req,res,next)=>{const related=req.path.startsWith('/api/subscriptions/')||req.path==='/api/auth/request-access'||/^\/api\/auth\/users\/\d+\/send-temporary-key$/.test(req.path);if(related&&req.method!=='GET'&&req.method!=='OPTIONS'&&req.path!=='/api/subscriptions/oneclick/return'&&req.headers.origin&&!origins.has(req.headers.origin))return res.status(403).json({ok:false,error:'origin_forbidden'});next()});
 const limits=rateLimit({windowMs:3600000,max:8});
 app.get('/api/subscriptions/plans',(req,res)=>{const c=configuration();res.json({ok:true,plans:Object.values(PLANS),period_days:30,payment_ready:c.ready})});
 app.post('/api/subscriptions/requests',limits,async(req,res)=>{try{
  const b=req.body||{},plan=PLANS[String(b.plan_code)],rbd=rbdOf(b.rbd),name=String(b.full_name||'').trim(),school=String(b.establishment_name||'').trim(),email=String(b.email||'').trim().toLowerCase(),rut=normalizeRut(b.rut);
  if(!plan||!/^\d{1,6}$/.test(rbd)||Number(rbd)<1||name.length<3||name.length>120||school.length<3||school.length>160||!validRut(rut)||!/^\S+@\S+\.\S+$/.test(email)||email.length>100||b.consent!==true||b.recurring_consent!==true)return res.status(400).json({ok:false,error:'invalid_request'});
  const exists=await pool.query("select id from establishments where regexp_replace(split_part(rbd,'-',1),'^0+','')=$1",[rbd]);if(exists.rowCount)return res.status(409).json({ok:false,error:'rbd_already_registered'});
  const id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('base64url');
  await pool.query('insert into mec_subscriptions(id,rbd,establishment_name,full_name,rut,email,plan_code,student_limit,price_clp,management_token_hash,username,recurring_consent_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())',[id,rbd,school,name,rut,email,plan.code,plan.student_limit,plan.price_clp,hash(token),'mec-'+id]);
  const manageUrl=publicOrigin+'/cancelar-suscripcion.html#'+token;
  await queueMail(pool,id,notifyEmail,'[MEC] Nueva solicitud de cuenta','Nueva solicitud de '+school+' (RBD '+rbd+'). Plan hasta '+plan.student_limit+' estudiantes, $'+plan.price_clp+' cada 30 días. El pago aún no está aprobado. Revisa '+publicOrigin+'/admin-centro.html#suscripciones');
  await queueMail(pool,id,email,'Solicitud recibida · Material Educativo Chile','Estimado/a '+name+':\n\nGracias por preferir a Material Educativo Chile, una plataforma con sello de calidad que acompaña a tu comunidad educativa. Registramos tu solicitud. El pago y la activación están pendientes.\n\nPuedes cancelar tu solicitud desde este enlace personal (no lo compartas):\n'+manageUrl);
  wakeMail();res.status(201).json({ok:true,id,management_token:token,payment_ready:configuration().ready});
 }catch(e){res.status(e.code==='23505'?409:500).json({ok:false,error:e.code==='23505'?'request_already_exists':'request_failed'})}});
 app.post('/api/subscriptions/enroll',limits,async(req,res)=>{try{
  if(!configuration().ready)return res.status(503).json({ok:false,error:'billing_not_ready'});
  const s=await getByToken(req.body?.token);if(!s)return res.status(404).json({ok:false,error:'subscription_not_found'});
  const result=await locked(s.id,async c=>{
   const row=(await c.query('select * from mec_subscriptions where id=$1',[s.id])).rows[0];
   if(row.cancelled_at||row.status!=='requested')throw Error('enrollment_not_available');
   const g=gateway(),r=await g.inscription.start(row.username,row.email,apiOrigin+'/api/subscriptions/oneclick/return');
   if(!r.token||!r.url_webpay||!/^https:\/\/(?:[a-z0-9-]+\.)*transbank\.cl\//i.test(r.url_webpay))throw Error('enrollment_invalid');
   await c.query("update mec_subscriptions set status='enrolling',enrollment_token_hash=$1,enrollment_expires_at=now()+interval '30 minutes',updated_at=now() where id=$2",[hash(r.token),s.id]);return r;
  });res.json({ok:true,token:result.token,url:result.url_webpay});
 }catch(e){res.status(409).json({ok:false,error:'enrollment_not_available'})}});
 app.all('/api/subscriptions/oneclick/return',async(req,res)=>{
  const token=String(req.body?.TBK_TOKEN||req.query.TBK_TOKEN||'');if(token.length<1||token.length>128)return res.redirect(303,publicOrigin+'/solicitud-cuenta.html?resultado=cancelado');
  let id=null;
  try{
   const q=await pool.query('select id from mec_subscriptions where enrollment_token_hash=$1',[hash(token)]);id=q.rows[0]?.id;if(!id)return res.redirect(303,publicOrigin+'/solicitud-cuenta.html?resultado=no-verificado');
   await locked(id,async c=>{
    let s=(await c.query('select * from mec_subscriptions where id=$1',[id])).rows[0];
    if(s.cancelled_at||s.tbk_user_encrypted)return;
    if(s.status!=='enrolling'||new Date(s.enrollment_expires_at)<new Date())throw Error('enrollment_expired');
    // Marcar antes de llamar para no finalizar dos veces si se interrumpe la conexión.
    await c.query("update mec_subscriptions set status='enrollment_uncertain' where id=$1",[id]);
    const result=await gateway().inscription.finish(token);
    if(Number(result.response_code)!==0||!result.tbk_user){await c.query("update mec_subscriptions set status='payment_failed' where id=$1",[id]);return}
    await c.query("update mec_subscriptions set tbk_user_encrypted=$1,status='payment_pending',updated_at=now() where id=$2",[vault.encrypt(result.tbk_user),id]);
   });
   const result=await charge(id,true);res.redirect(303,paymentDestination(id,result.approved?'aprobado':result.uncertain?'verificando':'no-aprobado'));
  }catch(e){res.redirect(303,id?paymentDestination(id,'verificando'):publicOrigin+'/solicitud-cuenta.html?resultado=no-verificado')}
 });
 app.post('/api/subscriptions/status',rateLimit({windowMs:60000,max:30}),async(req,res)=>{try{const s=await getByToken(req.body?.token);if(!s)return res.status(404).json({ok:false,error:'subscription_not_found'});res.json({ok:true,subscription:summary(s)})}catch(e){res.status(503).json({ok:false,error:'status_unavailable'})}});
 app.post('/api/subscriptions/cancel-by-token',limits,async(req,res)=>{try{const s=await getByToken(req.body?.token);if(!s)return res.status(404).json({ok:false,error:'subscription_not_found'});res.json({ok:true,subscription:await cancel(s.id)})}catch(e){res.status(503).json({ok:false,error:'cancellation_failed'})}});
 app.get('/api/subscriptions/me',requireAuth,async(req,res)=>{try{const q=await pool.query('select * from mec_subscriptions where establishment_id=$1',[req.auth.establishment_id]);res.json({ok:true,subscription:q.rowCount?summary(q.rows[0]):null})}catch(e){res.status(503).json({ok:false,error:'status_unavailable'})}});
 app.post('/api/subscriptions/cancel',...requireRole('coordinador_convivencia'),async(req,res)=>{try{const q=await pool.query('select id from mec_subscriptions where establishment_id=$1 and user_id=$2',[req.auth.establishment_id,req.auth.id]);if(!q.rowCount)return res.status(403).json({ok:false,error:'owner_required'});res.json({ok:true,subscription:await cancel(q.rows[0].id)})}catch(e){res.status(503).json({ok:false,error:'cancellation_failed'})}});
 app.get('/api/subscriptions/admin',...requireRole('platform_admin'),async(req,res)=>{try{
  const q=await pool.query(`select s.id,s.rbd,s.establishment_name,s.full_name,s.rut,s.email,s.plan_code,s.student_limit,s.price_clp,s.status,s.created_at,s.access_until,s.cancelled_at,s.activated_at,
   (select count(*) from mec_subscription_payments p where p.subscription_id=s.id and p.state='authorized')::int approved_payments,
   (select count(*) from mec_subscription_payments p where p.subscription_id=s.id and p.state in ('processing','uncertain'))::int uncertain_payments,
   (select count(*) from mec_subscription_mail m where m.subscription_id=s.id and m.status<>'sent')::int pending_emails
   from mec_subscriptions s order by s.created_at desc limit 200`);
  const access=await pool.query('select r.id,r.created_at,u.name,u.email,e.rbd,e.name establishment from mec_access_requests r join users u on u.id=r.user_id join establishments e on e.id=u.establishment_id where r.status=$1 order by r.created_at desc limit 100',['pending']);
  const c=configuration();res.json({ok:true,subscriptions:q.rows,access_requests:access.rows,configuration:{production:c.production,oneclick_ready:c.configured,email_ready:c.mailReady,payment_ready:c.ready}});
 }catch(e){res.status(503).json({ok:false,error:'admin_unavailable'})}});
 app.post('/api/subscriptions/admin/:id/activate',...requireRole('platform_admin'),async(req,res)=>{try{
  if(!configuration().mailReady)return res.status(503).json({ok:false,error:'email_not_ready'});
  const result=await locked(req.params.id,async c=>{
   const s=(await c.query('select * from mec_subscriptions where id=$1',[req.params.id])).rows[0];
   if(!s||s.status!=='paid_pending_activation'||s.cancelled_at)throw Error('approved_payment_required');
   const payment=await c.query("select id from mec_subscription_payments where subscription_id=$1 and cycle_key='initial' and state='authorized'",[s.id]);if(!payment.rowCount)throw Error('approved_payment_required');
   await c.query('begin');
   try{
    const e=await c.query('insert into establishments(name,rbd) values($1,$2) returning id',[s.establishment_name,s.rbd]);
    const password=crypto.randomBytes(18).toString('base64url')+'A7',cred=await makePassword(password);
    const u=await c.query("insert into users(establishment_id,email,rut,name,role,password_hash,password_salt,must_change_password,temporary_password_expires_at) values($1,$2,$3,$4,'coordinador_convivencia',$5,$6,true,now()+interval '48 hours') returning id",[e.rows[0].id,s.email,s.rut,s.full_name,cred.hash,cred.salt]);
    const year=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'America/Santiago'}).format(new Date()));
    for(const code of ['M1','M2','M3'])await c.query("insert into measurements(establishment_id,code,school_year,status) values($1,$2,$3,'draft')",[e.rows[0].id,code,year]);
    const until=nextPeriod(new Date());
    await c.query("update mec_subscriptions set status='active',establishment_id=$1,user_id=$2,approved_by=$3,activated_at=now(),access_until=$4,next_charge_at=$4,updated_at=now() where id=$5",[e.rows[0].id,u.rows[0].id,req.auth.id,until,s.id]);
    await queueMail(c,s.id,s.email,'Tu cuenta está activa · Material Educativo Chile','Estimado/a '+s.full_name+':\n\nGracias por preferir a Material Educativo Chile, una plataforma con sello de calidad, creada para acompañar el diagnóstico, la intervención y el seguimiento de tu comunidad educativa.\n\nTu establecimiento '+s.establishment_name+' (RBD '+s.rbd+') ya está autorizado.\nUsuario: '+s.email+'\nClave provisoria: '+password+'\nIngreso: '+publicOrigin+'/ingreso.html\n\nEsta clave vence en 48 horas. Debes reemplazarla en el primer ingreso por una clave personal. No la compartas. La clave definitiva no será visible para nuestro equipo.\n\nPlan: hasta '+s.student_limit+' estudiantes. Precio: $'+s.price_clp+' cada 30 días. Vigencia inicial hasta '+until.toISOString()+'. Las renovaciones serán automáticas mientras mantengas la suscripción. Puedes cancelar los próximos cobros desde el enlace de este correo.'+await cancellationLink(c,s.id));
    await c.query('commit');wakeMail();return {activated:true,email_queued:true,access_until:until};
   }catch(e){await c.query('rollback');throw e}
  });res.json({ok:true,...result});
 }catch(e){res.status(409).json({ok:false,error:e.code==='23505'?'rbd_already_registered':'activation_not_available'})}});
 app.post('/api/subscriptions/admin/:id/reconcile',...requireRole('platform_admin'),async(req,res)=>{try{const s=(await pool.query('select activated_at from mec_subscriptions where id=$1',[req.params.id])).rows[0];if(!s)return res.status(404).json({ok:false,error:'subscription_not_found'});res.json({ok:true,...await charge(req.params.id,!s.activated_at)})}catch(e){res.status(503).json({ok:false,error:'reconciliation_unavailable'})}});
 app.post('/api/subscriptions/admin/mail/retry',...requireRole('platform_admin'),async(req,res)=>{try{await pool.query("update mec_subscription_mail set next_attempt_at=now(),attempts=0 where status<>'sent'");await flushMail();res.json({ok:true})}catch(e){res.status(503).json({ok:false,error:'mail_unavailable'})}});
 async function prepareRecovery(userId){
  if(!configuration().mailReady)return false;
  return locked('credential-'+userId,async c=>{
   const u=(await c.query("select u.*,e.name establishment from users u join establishments e on e.id=u.establishment_id where u.id=$1 and u.active=true and u.role<>'platform_admin'",[userId])).rows[0];if(!u)return false;
   const requests=await c.query("select id from mec_access_requests where user_id=$1 and status='pending'",[userId]);if(!requests.rowCount)return false;
   const password=crypto.randomBytes(18).toString('base64url')+'A7',cred=await makePassword(password);
   await c.query('begin');try{
    await c.query("insert into mec_password_recoveries(user_id,password_hash,password_salt,expires_at) values($1,$2,$3,now()+interval '48 hours') on conflict(user_id) do update set password_hash=excluded.password_hash,password_salt=excluded.password_salt,expires_at=excluded.expires_at,created_at=now()",[userId,cred.hash,cred.salt]);
    await queueMail(c,null,u.email,'Tu clave provisoria · Material Educativo Chile','Estimado/a '+u.name+':\n\nRecibimos una solicitud para recuperar tu acceso a '+u.establishment+'.\nUsuario: '+u.email+'\nClave provisoria: '+password+'\nIngreso: '+publicOrigin+'/ingreso.html\n\nEsta clave vence en 48 horas y debes cambiarla al ingresar. Si no solicitaste recuperar tu acceso, ignora este correo; tu clave actual sigue funcionando. Tu clave personal no es visible para nuestro equipo.');
    await c.query("update mec_access_requests set status='queued' where user_id=$1 and status='pending'",[userId]);await c.query('commit');return true;
   }catch(e){await c.query('rollback');throw e}
  });
 }
 async function redeemRecovery(user,password,verifyPassword){
  if(user.role==='platform_admin')return false;
  return locked('credential-'+user.id,async c=>{
   const r=(await c.query('select * from mec_password_recoveries where user_id=$1 and expires_at>now()',[user.id])).rows[0];if(!r||!await verifyPassword(password,r.password_salt,r.password_hash))return false;
   await c.query('begin');try{
    await c.query('update users set password_hash=$1,password_salt=$2,must_change_password=true,temporary_password_expires_at=$3,failed_login_count=0,locked_until=null where id=$4',[r.password_hash,r.password_salt,r.expires_at,user.id]);
    await c.query('delete from auth_sessions where user_id=$1',[user.id]);await c.query('delete from mec_password_recoveries where user_id=$1',[user.id]);await c.query("update mec_access_requests set status='resolved' where user_id=$1 and status in ('pending','queued')",[user.id]);await c.query('commit');Object.assign(user,{password_hash:r.password_hash,password_salt:r.password_salt,must_change_password:true,temporary_password_expires_at:r.expires_at});return true;
   }catch(e){await c.query('rollback');throw e}
  });
 }
 async function runRecoveries(){if(!configuration().mailReady)return;const q=await pool.query("select distinct user_id from mec_access_requests where status='pending' limit 20");for(const u of q.rows)await prepareRecovery(u.user_id)}
 // Respuesta uniforme: no revelar si existe una cuenta asociada al correo.
 app.post('/api/auth/request-access',limits,async(req,res)=>{try{
  const email=String(req.body?.email||'').trim().toLowerCase();if(!/^\S+@\S+\.\S+$/.test(email)||email.length>180)return res.status(400).json({ok:false,error:'invalid_request'});
  const q=await pool.query("select id from users where lower(email)=$1 and active=true and role<>'platform_admin'",[email]);
  for(const u of q.rows){await locked('request-'+u.id,async c=>{const pending=await c.query("select id from mec_access_requests where user_id=$1 and created_at>now()-interval '1 hour' and status in ('pending','queued')",[u.id]);if(!pending.rowCount)await c.query('insert into mec_access_requests(user_id) values($1)',[u.id])});await prepareRecovery(u.id)}
  wakeMail();res.json({ok:true,received:true,email_ready:configuration().mailReady});
 }catch(e){res.status(503).json({ok:false,error:'request_unavailable'})}});
 async function issueTemporaryCredential(userId,requester,platform=false){
  if(!configuration().mailReady)throw Error('email_not_ready');
  return locked('credential-'+userId,async c=>{
   const u=(await c.query('select * from users where id=$1 and active=true',[userId])).rows[0];
   if(!u||u.role==='platform_admin'||(!platform&&Number(u.establishment_id)!==Number(requester.establishment_id)))throw Error('user_forbidden');
   const password=crypto.randomBytes(18).toString('base64url')+'A7',cred=await makePassword(password);
   await c.query('begin');
   try{
    await c.query("update users set password_hash=$1,password_salt=$2,must_change_password=true,temporary_password_expires_at=now()+interval '48 hours',failed_login_count=0,locked_until=null where id=$3",[cred.hash,cred.salt,u.id]);
    await c.query('delete from auth_sessions where user_id=$1',[u.id]);await c.query('delete from mec_password_recoveries where user_id=$1',[u.id]);
    await queueMail(c,null,u.email,'Nueva clave provisoria · Material Educativo Chile','Estimado/a '+u.name+':\n\nTu acceso fue restablecido por la administración.\nUsuario: '+u.email+'\nClave provisoria: '+password+'\nIngreso: '+publicOrigin+'/ingreso.html\n\nLa clave vence en 48 horas y debes cambiarla al ingresar. Tu clave definitiva no será visible para el equipo de Material Educativo Chile.');
    await c.query("update mec_access_requests set status='resolved' where user_id=$1 and status='pending'",[u.id]);
    await c.query("insert into professional_audit_events(establishment_id,user_id,action,entity_type,entity_id,metadata) values($1,$2,'temporary_credential_emailed','user',$3,'{}'::jsonb)",[u.establishment_id,requester.id,String(u.id)]);
    await c.query('commit');wakeMail();return {email_queued:true};
   }catch(e){await c.query('rollback');throw e}
  });
 }
 app.post('/api/auth/users/:id/send-temporary-key',...requireRole('coordinador_convivencia'),async(req,res)=>{try{res.json({ok:true,...await issueTemporaryCredential(req.params.id,req.auth)})}catch(e){res.status(409).json({ok:false,error:'credential_delivery_unavailable'})}});
 app.post('/api/subscriptions/admin/access/:id/resolve',...requireRole('platform_admin'),async(req,res)=>{try{const r=await pool.query("select user_id from mec_access_requests where id=$1 and status='pending'",[req.params.id]);if(!r.rowCount)return res.status(404).json({ok:false,error:'request_not_found'});res.json({ok:true,...await issueTemporaryCredential(r.rows[0].user_id,req.auth,true)})}catch(e){res.status(409).json({ok:false,error:'credential_delivery_unavailable'})}});
 async function runRenewals(){
  if(!configuration().ready)return;
  const due=await pool.query("select id from mec_subscriptions where (cancelled_at is null and ((activated_at is not null and next_charge_at<=now()) or status='payment_pending')) or (cancelled_at is not null and exists(select 1 from mec_subscription_payments p where p.subscription_id=mec_subscriptions.id and p.state in ('processing','uncertain'))) order by next_charge_at nulls first limit 25");
  for(const s of due.rows){try{const row=(await pool.query('select activated_at from mec_subscriptions where id=$1',[s.id])).rows[0];await charge(s.id,!row.activated_at)}catch(e){console.error('Subscription renewal needs review')}}
 }
 function startWorkers(){
  const work=()=>Promise.allSettled([runRenewals(),runRecoveries().then(flushMail)]);work();const timer=setInterval(work,60000);timer.unref();
  console.log('Subscription production payment ready:',configuration().ready?'yes':'no');
  console.log('Subscription email ready:',configuration().mailReady?'yes':'no');
 }
 return {accessStatus,temporaryExpired,startWorkers,configuration,charge,cancel,runRenewals,flushMail,redeemRecovery,runRecoveries};
}
module.exports={createSubscriptions};
