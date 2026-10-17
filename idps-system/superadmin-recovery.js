'use strict';
// Password recovery only for the IDPS superadministrator. School accounts are untouched.
const crypto=require('node:crypto');
const bcrypt=require('bcryptjs');
const rateLimit=require('express-rate-limit');

const ORIGIN='https://idps-gestion-material-educativo.onrender.com';
const clean=v=>String(v??'').trim();
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
const esc=v=>clean(v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const passwordValid=v=>typeof v==='string'&&v.length>=12&&v.length<=128&&!/[\x00-\x1f\x7f]/.test(v);
const tokenValid=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const privateHeaders=res=>res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'});

function registerSuperadminRecovery(app,{pool,adminEmail,legacyPasswordHash,legacySalt,layout,env=process.env,sendEmail=null,mailAvailable=null}){
  if(!/^[a-f0-9]{128}$/i.test(legacyPasswordHash))throw Error('Invalid legacy superadmin password hash');
  const enabled=async()=>Boolean(pool&&(mailAvailable?await mailAvailable():((env.RESEND_API_KEY&&env.RESEND_FROM)||sendEmail)));
  async function init(){
    if(!pool)return;
    await pool.query('CREATE TABLE IF NOT EXISTS idps_superadmin_credentials ('+
      'id integer PRIMARY KEY CHECK(id=1),password_hash text NOT NULL,'+
      'password_version integer NOT NULL DEFAULT 0,reset_hash text,'+
      'reset_expires_at timestamptz,reset_sent_at timestamptz)');
    await pool.query('INSERT INTO idps_superadmin_credentials(id,password_hash,password_version) '+
      'VALUES(1,$1,0) ON CONFLICT(id) DO NOTHING',['legacy:'+legacyPasswordHash]);
  }
  async function current(){
    if(!pool)return {password_hash:'legacy:'+legacyPasswordHash,password_version:0};
    const found=await pool.query('SELECT password_hash,password_version FROM idps_superadmin_credentials WHERE id=1');
    if(!found.rows[0])throw Error('Admin credentials unavailable');
    return found.rows[0];
  }
  async function verifyPassword(email,password){
    if(clean(email).toLowerCase()!==adminEmail||typeof password!=='string')return {ok:false};
    const row=await current();
    let ok=false;
    if(row.password_hash.startsWith('legacy:')){
      const a=crypto.scryptSync(password.trim(),legacySalt,64);
      const b=Buffer.from(row.password_hash.slice(7),'hex');
      ok=a.length===b.length&&crypto.timingSafeEqual(a,b);
    }else if(row.password_hash.startsWith('$2'))ok=await bcrypt.compare(password,row.password_hash);
    return {ok,version:Number(row.password_version||0)};
  }
  async function sessionValid(claims){
    if(!claims||claims.role!=='superadmin')return false;
    try{const row=await current();return Number(row.password_version)===Number(claims.sv??0);}
    catch{return false;}
  }
  async function deliver(email,link){
    if(sendEmail)return sendEmail(email,link);
    if(!(await enabled()))throw Error('Mail not configured');
    const html='<div style="font-family:Arial,sans-serif;color:#17324d;line-height:1.6">'+
      '<h2>Restablecer contraseña de Superadministrador · IDPS</h2>'+
      '<p>Se solicitó recuperar el acceso al panel de Material Educativo Chile.</p>'+
      '<p><a href="'+esc(link)+'">Crear una nueva contraseña</a></p>'+
      '<p>El enlace vence en 30 minutos y solo se puede usar una vez.</p>'+
      '<p>Si no solicitaste el cambio, ignora este correo. Tu contraseña seguirá siendo la misma.</p></div>';
    const response=await fetch('https://api.resend.com/emails',{
      method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({from:env.RESEND_FROM,to:[email],
        subject:'Restablecer contraseña · Superadministrador IDPS',html}),
      signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)throw Error('Mail provider rejected reset request');
  }
  const limiter=rateLimit({windowMs:60*60*1000,limit:5,standardHeaders:true,legacyHeaders:false,
    message:'Demasiadas solicitudes. Intenta más tarde.'});
  const form='<section class="card" style="max-width:560px;margin:auto">'+
    '<h1>Recuperar contraseña</h1>'+
    '<p>Exclusivo para el Superadministrador de IDPS. Enviaremos un enlace al correo registrado.</p>'+
    '<form action="/superadmin/recuperar" method="post">'+
    '<div class="field"><label>Correo del Superadministrador</label>'+
    '<input name="email" type="email" autocomplete="email" maxlength="254" required></div>'+
    '<button class="btn primary">Solicitar enlace</button></form>'+
    '<p><a href="/superadmin">Volver al ingreso</a></p></section>';
  app.get('/superadmin/recuperar',(_req,res)=>{privateHeaders(res);res.send(layout('Recuperar contraseña',form));});
  app.post('/superadmin/recuperar',limiter,async(req,res)=>{
    privateHeaders(res);
    const generic=layout('Solicitud recibida',
      '<section class="card"><h1>Revisa tu correo</h1>'+
      '<p>Si el correo corresponde al Superadministrador, recibirás un enlace válido por 30 minutos.</p>'+
      '<p><a href="/superadmin">Volver al ingreso</a></p></section>');
    if(!(await enabled()))return res.status(503).send(layout('Recuperación no disponible',
      '<section class="card"><h1>Recuperación no disponible</h1>'+
      '<p>El envío de correos de recuperación aún no está configurado. Contacta al administrador técnico.</p></section>'));
    if(clean(req.body?.email).toLowerCase()!==adminEmail)return res.send(generic);
    let hash;
    try{
      const reset=crypto.randomBytes(32).toString('hex');
      hash=digest(reset);
      const stored=await pool.query(
        "UPDATE idps_superadmin_credentials SET reset_hash=$1,reset_expires_at=now()+interval '30 minutes',"+
        "reset_sent_at=now() WHERE id=1 AND (reset_sent_at IS NULL OR reset_sent_at<now()-interval '3 minutes') RETURNING id",[hash]);
      if(!stored.rowCount)return res.send(generic);
      // A URL fragment is not sent to the server or HTTP referrers.
      await deliver(adminEmail,ORIGIN+'/superadmin/restablecer#token='+reset);
      res.send(generic);
    }catch(error){
      console.error('Superadmin recovery mail failed:',error.message);
      if(hash){try{await pool.query('UPDATE idps_superadmin_credentials SET reset_hash=NULL,reset_expires_at=NULL,reset_sent_at=NULL WHERE id=1 AND reset_hash=$1',[hash]);}catch{}}
      res.status(503).send(layout('Correo no enviado',
        '<section class="card"><h1>No se pudo enviar el enlace</h1>'+
        '<p>Inténtalo más tarde. La contraseña actual no ha cambiado.</p></section>'));
    }
  });
  app.get('/superadmin/restablecer',(_req,res)=>{
    privateHeaders(res);
    res.send(layout('Crear nueva contraseña',
      '<section class="card" style="max-width:560px;margin:auto"><h1>Nueva contraseña</h1>'+
      '<p>Utiliza al menos 12 caracteres. El enlace vence 30 minutos después de solicitarlo.</p>'+
      '<form method="post" action="/superadmin/restablecer">'+
      '<input type="hidden" name="token" id="reset-token">'+
      '<div class="field"><label>Nueva contraseña</label><input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></div>'+
      '<div class="field"><label>Confirmar contraseña</label><input name="confirm" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></div>'+
      '<p id="reset-error" hidden>Enlace incorrecto. Solicita uno nuevo.</p>'+
      '<button id="reset-submit" class="btn primary">Guardar contraseña</button></form>'+
      '<p><a href="/superadmin/recuperar">Solicitar otro enlace</a></p></section>'+
      '<script>(function(){var m=location.hash.match(/^#token=([a-f0-9]{64})$/);'+
      'if(m){document.getElementById("reset-token").value=m[1];history.replaceState(null,"",location.pathname);}'+
      'else{document.getElementById("reset-error").hidden=false;document.getElementById("reset-submit").disabled=true;}})();</script>'));
  });
  app.post('/superadmin/restablecer',limiter,async(req,res)=>{
    privateHeaders(res);
    const password=req.body?.password,confirmation=req.body?.confirm;
    if(!pool||!tokenValid(req.body?.token)||!passwordValid(password)||password!==confirmation)
      return res.status(400).send(layout('Datos incorrectos',
        '<section class="card"><h1>No se pudo cambiar la contraseña</h1>'+
        '<p>Revisa el enlace y usa entre 12 y 128 caracteres.</p>'+
        '<a href="/superadmin/recuperar">Solicitar otro enlace</a></section>'));
    try{
      const hash=await bcrypt.hash(password,12);
      const updated=await pool.query(
        'UPDATE idps_superadmin_credentials SET password_hash=$1,password_version=password_version+1,'+
        'reset_hash=NULL,reset_expires_at=NULL,reset_sent_at=NULL '+
        'WHERE id=1 AND reset_hash=$2 AND reset_expires_at>now() RETURNING password_version',
        [hash,digest(req.body.token)]);
      if(!updated.rowCount)return res.status(400).send(layout('Enlace vencido',
        '<section class="card"><h1>Enlace vencido o ya utilizado</h1>'+
        '<a href="/superadmin/recuperar">Solicitar otro enlace</a></section>'));
      res.clearCookie('idps_session');
      res.send(layout('Contraseña actualizada',
        '<section class="card"><h1>Contraseña actualizada</h1>'+
        '<p>Las sesiones anteriores del Superadministrador quedaron invalidadas.</p>'+
        '<a class="btn primary" href="/superadmin">Ingresar al Superadministrador</a></section>'));
    }catch(error){
      console.error('Superadmin password update failed:',error.message);
      res.status(503).send(layout('Intenta más tarde',
        '<section class="card"><h1>No se pudo actualizar</h1><p>Intenta nuevamente en unos minutos.</p></section>'));
    }
  });
  return {init,verifyPassword,sessionValid,enabled};
}
module.exports=registerSuperadminRecovery;
module.exports.passwordValid=passwordValid;
module.exports.tokenValid=tokenValid;
