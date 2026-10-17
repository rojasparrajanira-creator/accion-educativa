const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(48).toString('hex');
const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || 'accioneducativaspa@gmail.com').toLowerCase();
const SUPERADMIN_PASSWORD_HASH = process.env.SUPERADMIN_PASSWORD_HASH || '0b357512f032de5d5557d0d9fc7f0e0e1d1e6b3c3451c1cd6fcbc257b8b3b59ed218cf6061aed6aa726bf6a9f2ee48b063872412f71e6943529cadde122d4c3d';
const SUPERADMIN_SALT = 'mec-idps-superadmin-v1';
const SURVEY_URL = process.env.SURVEY_URL || 'https://diagnostico-idps-material-educativo.onrender.com';
const DATABASE_URL = process.env.DATABASE_URL || '';
const upload = multer({storage: multer.memoryStorage(), limits:{fileSize: 5 * 1024 * 1024}});
const pool = DATABASE_URL ? new Pool({connectionString:DATABASE_URL, ssl:{rejectUnauthorized:false}}) : null;
const mailer = require('./idps-mailer')({pool,env:process.env});

app.use(helmet({contentSecurityPolicy:false}));
app.use(express.urlencoded({extended:true}));
app.use(express.json({limit:'1mb'}));
app.use(cookieParser());

const loginLimiter = rateLimit({windowMs:15*60*1000, limit:10, standardHeaders:true, legacyHeaders:false});
const requestLimiter=rateLimit({windowMs:60*60*1000,limit:5,standardHeaders:true,legacyHeaders:false,message:'Has realizado demasiadas solicitudes. Intenta más tarde.'});

const mem = { requests: [], establishments: [] };
const payments=require('./request-payment');
const paymentSettings=require('./idps-transfer-settings')({pool,requireSuper,layout});

function normalizeRbd(v=''){ return String(v).toUpperCase().replace(/[^0-9K]/g,''); }
function clean(v=''){ return String(v).trim(); }
function pin6(){ return String(crypto.randomInt(100000, 1000000)); }
function id(){ return crypto.randomUUID(); }
function token(payload){ return jwt.sign(payload, JWT_SECRET, {expiresIn:'8h'}); }
function getAuth(req){ try { return jwt.verify(req.cookies.idps_session || '', JWT_SECRET); } catch { return null; } }
async function requireSuper(req,res,next){ const a=getAuth(req); if(!a || a.role!=='superadmin'||!(await superRecovery.sessionValid(a))) return res.redirect('/superadmin'); req.auth=a; next(); }
function requireEst(req,res,next){ const a=getAuth(req); if(!a || a.role!=='establishment') return res.redirect('/'); req.auth=a; next(); }

async function initDb(){
  if(!pool) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS idps_account_requests (
    id uuid PRIMARY KEY, rbd text NOT NULL, rbd_norm text NOT NULL, establishment_name text NOT NULL,
    commune text, contact_name text NOT NULL, email text NOT NULL, voucher_name text,
    status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS idps_establishments (
    id uuid PRIMARY KEY, rbd text NOT NULL UNIQUE, rbd_norm text NOT NULL UNIQUE, name text NOT NULL,
    commune text, contact_name text, email text NOT NULL, pin_hash text NOT NULL,
    status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz
  )`);
  await pool.query('CREATE TABLE IF NOT EXISTS idps_request_notifications ('+
    'request_id uuid PRIMARY KEY REFERENCES idps_account_requests(id) ON DELETE CASCADE,'+
    'sent_at timestamptz,last_attempt_at timestamptz,attempts integer NOT NULL DEFAULT 0)');
  await pool.query("INSERT INTO idps_request_notifications(request_id) "+
    "SELECT id FROM idps_account_requests WHERE status='pending' ON CONFLICT DO NOTHING");
  // Existing pending requests keep a legacy review path; never require an old uploader
  // to submit a file that the previous version discarded.
  await pool.query('ALTER TABLE idps_account_requests ADD COLUMN IF NOT EXISTS payment_status text');
  await pool.query("UPDATE idps_account_requests SET payment_status='legacy' WHERE payment_status IS NULL");
  await pool.query('ALTER TABLE idps_account_requests ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz');
  await pool.query('CREATE TABLE IF NOT EXISTS idps_request_vouchers ('+
    'request_id uuid PRIMARY KEY REFERENCES idps_account_requests(id) ON DELETE CASCADE,'+
    'filename text NOT NULL, mimetype text NOT NULL,'+
    'file_size integer NOT NULL CHECK(file_size>0 AND file_size<=5242880),'+
    'sha256 text NOT NULL, content bytea NOT NULL, uploaded_at timestamptz NOT NULL DEFAULT now())');
}

async function createRequest(data,file){
  if(!pool)throw Error('Las solicitudes se encuentran temporalmente fuera de servicio.');
  const checked=payments.validate(file);
  const row={id:id(),...data,status:'pending',payment_status:'pending',created_at:new Date().toISOString()};
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query(
      "INSERT INTO idps_account_requests(id,rbd,rbd_norm,establishment_name,commune,contact_name,email,voucher_name,status,payment_status) "+
      "VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending','pending')",
      [row.id,row.rbd,row.rbd_norm,row.establishment_name,row.commune,row.contact_name,row.email,checked.filename]);
    await client.query('INSERT INTO idps_request_vouchers(request_id,filename,mimetype,file_size,sha256,content) VALUES($1,$2,$3,$4,$5,$6)',
      [row.id,checked.filename,checked.mime,checked.size,checked.sha256,checked.content]);
    await client.query('INSERT INTO idps_request_notifications(request_id) VALUES($1) ON CONFLICT DO NOTHING',[row.id]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
  return row;
}

async function listRequests(){
  if(pool) return (await pool.query(`SELECT r.*,n.sent_at AS notification_sent_at,(v.request_id IS NOT NULL) AS voucher_available FROM idps_account_requests r LEFT JOIN idps_request_notifications n ON n.request_id=r.id LEFT JOIN idps_request_vouchers v ON v.request_id=r.id ORDER BY r.created_at DESC`)).rows;
  return mem.requests;
}

async function sendRequestNotice(row){
  if(!pool)return false;
  const exists=await pool.query('SELECT sent_at FROM idps_request_notifications WHERE request_id=$1',[row.id]);
  if(exists.rows[0]?.sent_at)return true;
  const safe=mailer.escape;
  const body='<div style="font:15px Arial,sans-serif;color:#153657;line-height:1.6">'+
    '<h2>Nueva solicitud de acceso a IDPS</h2>'+
    '<p>Se ha recibido una solicitud y está <b>pendiente de aprobación</b>.</p>'+
    '<p><b>Establecimiento:</b> '+safe(row.establishment_name)+'<br>'+
    '<b>RBD:</b> '+safe(row.rbd)+'<br>'+
    '<b>Comuna:</b> '+safe(row.commune||'No informada')+'<br>'+
    '<b>Responsable:</b> '+safe(row.contact_name)+'<br>'+
    '<b>Correo:</b> '+safe(row.email)+'</p>'+
    '<p><a href="https://idps-gestion-material-educativo.onrender.com/superadmin/dashboard">'+
    'Revisar solicitud en el panel del Superadministrador</a></p>'+
    '<p><small>La solicitud no está aprobada y el acceso no se genera automáticamente.</small></p></div>';
  try{
    await pool.query('UPDATE idps_request_notifications SET attempts=attempts+1,last_attempt_at=now() WHERE request_id=$1',[row.id]);
    await mailer.send({to:SUPERADMIN_EMAIL,
      subject:'IDPS · Nueva solicitud de acceso',html:body,category:'solicitud_admin',relatedId:row.id});
    await pool.query('UPDATE idps_request_notifications SET sent_at=now() WHERE request_id=$1',[row.id]);
    return true;
  }catch(error){
    console.error('IDPS institutional access notice delivery failed:',error.message);
    return false;
  }
}

async function findRequest(rid){
  if(pool) return (await pool.query(`SELECT * FROM idps_account_requests WHERE id=$1`,[rid])).rows[0];
  return mem.requests.find(x=>x.id===rid);
}
async function approveRequest(rid){
  if(!pool)throw Error('La aprobación requiere base de datos permanente.');
  const client=await pool.connect();
  let est,generatedPin;
  try{
    await client.query('BEGIN');
    const r=(await client.query('SELECT * FROM idps_account_requests WHERE id=$1 FOR UPDATE',[rid])).rows[0];
    if(!r||r.status!=='pending')throw Error('Solicitud no encontrada o ya procesada.');
    if(!['verified','legacy'].includes(r.payment_status))
      throw Error('Debes revisar el comprobante y confirmar primero el abono de la transferencia.');
    generatedPin=pin6();
    const pinHash=await bcrypt.hash(generatedPin,10);
    est={id:id(),rbd:r.rbd,rbd_norm:r.rbd_norm,name:r.establishment_name,
      commune:r.commune,contact_name:r.contact_name,email:r.email,pin_hash:pinHash,
      status:'active',created_at:new Date().toISOString(),expires_at:new Date(Date.now()+30*86400000).toISOString()};
    await client.query(
      "INSERT INTO idps_establishments(id,rbd,rbd_norm,name,commune,contact_name,email,pin_hash,status,expires_at) "+
      "VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active',$9) "+
      "ON CONFLICT (rbd_norm) DO UPDATE SET name=EXCLUDED.name,commune=EXCLUDED.commune,"+
      "contact_name=EXCLUDED.contact_name,email=EXCLUDED.email,pin_hash=EXCLUDED.pin_hash,status='active',"+
      "expires_at=GREATEST(idps_establishments.expires_at,EXCLUDED.expires_at)",
      [est.id,est.rbd,est.rbd_norm,est.name,est.commune,est.contact_name,est.email,est.pin_hash,est.expires_at]);
    await client.query("UPDATE idps_account_requests SET status='approved',reviewed_at=now() WHERE id=$1",[rid]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
  return {est,generatedPin};
}

async function rejectRequest(rid){
  if(pool) await pool.query(`UPDATE idps_account_requests SET status='rejected', reviewed_at=now() WHERE id=$1`,[rid]);
  else { const r=mem.requests.find(x=>x.id===rid); if(r){r.status='rejected'; r.reviewed_at=new Date().toISOString();} }
}
async function deleteRequest(rid){
 if(pool){const r=await pool.query('DELETE FROM idps_account_requests WHERE id=$1 RETURNING id',[rid]);if(!r.rowCount)throw new Error('Solicitud no encontrada');}
 else {const i=mem.requests.findIndex(x=>x.id===rid);if(i<0)throw new Error('Solicitud no encontrada');mem.requests.splice(i,1);}
}
async function findEstByRbd(norm){
  if(pool) return (await pool.query(`SELECT * FROM idps_establishments WHERE rbd_norm=$1`,[norm])).rows[0];
  return mem.establishments.find(x=>x.rbd_norm===norm);
}
async function listEstablishments(){
  if(pool) return (await pool.query(`SELECT id,rbd,rbd_norm,name,commune,contact_name,email,status,created_at,expires_at FROM idps_establishments ORDER BY created_at DESC`)).rows;
  return mem.establishments.map(({pin_hash,...x})=>x);
}

async function resetPin(eid){
 const est=pool?(await pool.query('SELECT * FROM idps_establishments WHERE id=$1',[eid])).rows[0]:mem.establishments.find(x=>x.id===eid);
 if(!est) throw new Error('Establecimiento no encontrado');
 const generatedPin=pin6(), pinHash=await bcrypt.hash(generatedPin,10);
 if(pool) await pool.query('UPDATE idps_establishments SET pin_hash=$1 WHERE id=$2',[pinHash,eid]); else est.pin_hash=pinHash;
 return {est,generatedPin};
}

async function removeEst(eid){
 if(pool){const r=await pool.query('DELETE FROM idps_establishments WHERE id=$1 RETURNING id',[eid]);if(!r.rowCount)throw new Error('Establecimiento no encontrado');}
 else {const i=mem.establishments.findIndex(x=>x.id===eid);if(i<0)throw new Error('Establecimiento no encontrado');mem.establishments.splice(i,1);}
}

async function sendActivation(est,pin){
  const email=require('./activation-email-template')(est,pin);
  return mailer.send({to:est.email,subject:email.subject,html:email.html,category:'acceso_pin',relatedId:est.id});
}

async function gmailToken(){
 if(!pool) return null;
 await pool.query("CREATE TABLE IF NOT EXISTS idps_settings (key text PRIMARY KEY, value text NOT NULL)");
 const q=await pool.query("SELECT value FROM idps_settings WHERE key='gmail_refresh_token'");
 return q.rows[0]?.value||null;
}
async function saveGmailToken(v){
 await pool.query("CREATE TABLE IF NOT EXISTS idps_settings (key text PRIMARY KEY, value text NOT NULL)");
 await pool.query("INSERT INTO idps_settings(key,value) VALUES('gmail_refresh_token',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",[v]);
}

function googleRedirect(){return (process.env.PUBLIC_URL||'https://idps-gestion-material-educativo.onrender.com')+'/auth/google/callback';}
app.get('/auth/google',requireSuper,(req,res)=>{
  const state=crypto.randomBytes(32).toString('hex');
  res.cookie('idps_gmail_oauth_state',state,{httpOnly:true,
    secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:10*60*1000});
  const q=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID||'',redirect_uri:googleRedirect(),
    response_type:'code',scope:'https://www.googleapis.com/auth/gmail.send',
    access_type:'offline',prompt:'consent select_account',state});
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?'+q.toString());
});
app.get('/auth/google/callback',requireSuper,async(req,res)=>{
  const state=clean(req.query.state),cookie=clean(req.cookies.idps_gmail_oauth_state);
  res.clearCookie('idps_gmail_oauth_state');
  const x=Buffer.from(state),y=Buffer.from(cookie);
  if(!/^[a-f0-9]{64}$/.test(state)||x.length!==y.length||!crypto.timingSafeEqual(x,y))
    return res.redirect('/superadmin/dashboard?err=1&msg='+encodeURIComponent('Autorización Gmail caducada o inválida. Intenta nuevamente.'));
  try{
    const r=await fetch('https://oauth2.googleapis.com/token',{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({code:clean(req.query.code),client_id:process.env.GOOGLE_CLIENT_ID||'',
        client_secret:process.env.GOOGLE_CLIENT_SECRET||'',redirect_uri:googleRedirect(),
        grant_type:'authorization_code'}),signal:AbortSignal.timeout(12000)});
    const j=await r.json();
    if(!r.ok)throw Error('Google rechazó la autorización.');
    if(!j.refresh_token)throw Error('Google no entregó autorización permanente. Debes aceptar todos los permisos solicitados.');
    await saveGmailToken(j.refresh_token);
    const status=await mailer.status();
    if(!status.connected)throw Error('Gmail no pudo validar el nuevo permiso. Intenta reconectar.');
    res.redirect('/superadmin/dashboard?msg='+encodeURIComponent('Gmail reconectado y verificado. Ahora los correos se enviarán desde esta cuenta y quedarán en Enviados.'));
  }catch(error){
    console.error('IDPS Gmail connect failed:',error.message);
    res.redirect('/superadmin/dashboard?err=1&msg='+encodeURIComponent('No se pudo completar la conexión con Gmail. Reintenta la autorización.'));
  }
});

const css = `
:root{--navy:#0F2D52;--blue:#1E7FBC;--turq:#19C2D1;--yellow:#FFD200;--bg:#F4F7FA;--line:#E6E8EB;--text:#17324d;--red:#c0392b;--green:#198754}
*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;background:var(--bg);color:var(--text)}
header{background:var(--navy);color:#fff;padding:18px 24px}.wrap{max-width:1180px;margin:auto}.brand{display:flex;align-items:center;justify-content:space-between;gap:16px}.brand b{font-size:20px}.brand small{opacity:.8}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:0 8px 28px rgba(15,45,82,.07)}
main{padding:34px 18px}.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:20px}.col6{grid-column:span 6}.col12{grid-column:span 12}.col4{grid-column:span 4}
h1,h2,h3{color:var(--navy);margin-top:0}.muted{color:#637083}.field{margin:14px 0}.field label{display:block;font-size:13px;font-weight:800;margin-bottom:6px}.field input,.field select{width:100%;padding:12px 13px;border:1px solid #cfd8e3;border-radius:10px;background:#fff}.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:999px;padding:11px 20px;font-weight:800;cursor:pointer;text-decoration:none}.primary{background:var(--blue);color:#fff}.secondary{background:#fff;color:var(--blue);border:1px solid var(--blue)}.warn{background:var(--yellow);color:var(--navy)}.danger{background:#fff;color:var(--red);border:1px solid #efb4ae}.success{background:var(--green);color:#fff}.actions{display:flex;gap:10px;flex-wrap:wrap}.notice{padding:12px 14px;border-radius:10px;margin:12px 0;background:#ecf8fb;border:1px solid #b6edf2}.error{background:#fff0ef;border-color:#f0b8b3}.ok{background:#eef9f3;border-color:#bfe7cf}.badge{display:inline-block;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800}.pending{background:#fff7d1}.approved,.active{background:#e7f6ec;color:#166534}.rejected,.suspended{background:#fde8e7;color:#991b1b}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:11px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;color:#637083}.kpi{font-size:30px;font-weight:900;color:var(--navy)}.topnav a{color:#fff;text-decoration:none;margin-left:14px;font-weight:700}.mode{font-size:12px;color:#637083;margin-top:8px}.mobile-list{display:none}.mobile-item{border:1px solid var(--line);border-radius:14px;padding:16px;margin-top:12px;background:#fff}.mobile-row{margin:8px 0;overflow-wrap:anywhere}.mobile-label{display:block;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.04em;color:#637083;margin-bottom:2px}@media(max-width:780px){.col6,.col4{grid-column:span 12}.brand{align-items:flex-start;flex-direction:column}.topnav a{margin:0 12px 0 0}.card{padding:18px}.desktop-table{display:none}.mobile-list{display:block}.mobile-item .actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.mobile-item .actions form,.mobile-item .actions .btn{width:100%}.btn{white-space:nowrap}}
`;
function layout(title, body, nav=''){
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0F2D52"><title>${title}</title><style>${css}</style></head><body><header><div class="wrap brand"><div><b>Material Educativo Chile</b><br><small>Diagnóstico IDPS · Gestión de establecimientos</small></div><div class="topnav">${nav}</div></div></header><main><div class="wrap">${body}<div class="mode">Sistema: ${pool?'base de datos central':'modo de configuración temporal'}.</div></div></main></body></html>`;
}

app.get('/', (req,res)=>{
 const msg=req.query.msg?`<div class="notice ${req.query.err?'error':'ok'}">${clean(req.query.msg)}</div>`:'';
 res.send(layout('Acceso establecimiento', `${msg}<section class="home-intro"><span class="home-kicker">PLATAFORMA IDPS</span><h1>Desarrollo Personal y Social</h1><p>Aplicación, seguimiento, resultados, informes y planificación institucional en un solo espacio.</p><div class="home-points"><span><b>IDPS</b> · Resultados organizados</span><span><b>45</b> ítems de aplicación</span><span><b>1</b> plan integrado</span></div></section><section class="login-shell"><div class="login-form-panel"><h2>Ingreso al sistema</h2><p class="muted login-lead">Información organizada para apoyar la gestión educativa, el análisis institucional y la toma de decisiones.</p><form method="post" action="/login"><div class="field"><label>RBD del establecimiento</label><input name="rbd" placeholder="Ej.: 6586-2" required></div><div class="field"><label>PIN de acceso</label><input name="pin" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" type="password" required></div><button class="btn primary login-main-btn">Ingresar <span aria-hidden="true">→</span></button></form><div class="login-links"><a href="/solicitud">Solicitar acceso</a><span>·</span><a href="/superadmin">Superadministrador</a></div></div><aside class="login-side"><span class="side-kicker">GESTIÓN EDUCATIVA</span><h3>Del diagnóstico a la acción</h3><p>Una plataforma para acompañar la gestión de los Indicadores de Desarrollo Personal y Social.</p></aside></section><section class="home-action-cards" aria-label="Accesos rápidos IDPS"><a class="home-action-card home-action-demo" href="/demo"><span class="home-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="16" rx="3"/><path d="m10 8 6 4-6 4V8Z"/></svg></span><span class="home-action-copy"><span class="home-action-eyebrow">CONOCE LA PLATAFORMA</span><strong>Revisa el demo</strong><span>Descubre cómo funciona IDPS en un establecimiento educacional.</span></span><span class="home-action-arrow" aria-hidden="true">↗</span></a><a class="home-action-card home-action-students" href="${SURVEY_URL}/encuesta-idps.html" target="_blank" rel="noopener noreferrer"><span class="home-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7.5" r="3.5"/><path d="M4.5 20v-2.5a7.5 7.5 0 0 1 15 0V20"/></svg></span><span class="home-action-copy"><span class="home-action-eyebrow">PORTAL ESTUDIANTIL</span><strong>Ingreso estudiantes</strong><span>Accede a la encuesta con RUT y clave entregada por el establecimiento.</span></span><span class="home-action-arrow" aria-hidden="true">↗</span></a></section>`));
});


// Página pública del video demostrativo. El archivo se aloja externamente para
// evitar almacenar videos pesados en la aplicación o afectar el servicio.
app.get('/demo',(req,res)=>{
 // Video oficial compartido por Material Educativo Chile. YouTube se reproduce
 // incrustado en la plataforma, sin redireccionar al visitante.
 const videoId='M-6zn_iowvU';
 const watchUrl='https://youtu.be/'+videoId;
 const player='<iframe title="Video demostrativo de la Plataforma IDPS de Material Educativo Chile" src="https://www.youtube-nocookie.com/embed/'+videoId+'?rel=0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy" style="display:block;width:100%;aspect-ratio:16/9;border:0;border-radius:15px;background:#071D3B"></iframe>';
 const media=player+'<p class="muted" style="margin-top:14px"><a href="'+watchUrl+'" target="_blank" rel="noopener noreferrer">Abrir video en YouTube</a></p>';
 res.send(layout('Demo de la Plataforma IDPS','<div class="idps-demo-page"><a class="idps-demo-back" href="/">← Volver al inicio</a><span class="home-kicker">MATERIAL EDUCATIVO CHILE</span><h1>Conoce nuestra plataforma IDPS</h1><p>Descubre cómo funciona el proceso de matrícula, aplicación, seguimiento, resultados, informes y planificación institucional.</p>'+media+'</div>','<a href="/">Inicio</a>'));
});

app.get('/solicitud',async(req,res)=>{
  const info=await paymentSettings.get();
  const notice=req.query.msg?'<div class="notice error">'+payments.escape(req.query.msg)+'</div>':'';
  const preface='<div class="card" style="max-width:800px;margin:auto"><h1>Solicitar cuenta IDPS</h1>'+notice+
    '<p>Para comenzar, realiza la transferencia, carga el comprobante y completa los datos del establecimiento. '+
    'Acción Educativa SPA revisará el pago antes de habilitar la cuenta.</p>'+
    payments.paymentInstruction(info);
  if(!info.ready)return res.send(layout('Solicitud de cuenta IDPS',preface+
    '<p>Los datos bancarios deben estar confirmados antes de aceptar pagos. Consultas: '+
    '<a href="mailto:accioneducativaspa@gmail.com">accioneducativaspa@gmail.com</a>.</p>'+
    '<p><a href="/">Volver</a></p></div>','<a href="/">Inicio</a>'));
  const form='<h2>2. Solicita la cuenta y adjunta el comprobante</h2>'+
    '<form method="post" action="/solicitud" enctype="multipart/form-data"><div class="grid">'+
    '<div class="col6 field"><label>RBD *</label><input name="rbd" maxlength="20" required></div>'+
    '<div class="col6 field"><label>Establecimiento *</label><input name="establishment_name" maxlength="140" required></div>'+
    '<div class="col6 field"><label>Comuna</label><input name="commune" maxlength="80"></div>'+
    '<div class="col6 field"><label>Nombre del responsable *</label><input name="contact_name" maxlength="120" required></div>'+
    '<div class="col6 field"><label>Correo *</label><input name="email" type="email" maxlength="254" required></div>'+
    '<div class="col6 field"><label>Comprobante de transferencia * (PDF, JPG o PNG; máximo 5 MB)</label>'+
    '<input name="voucher" type="file" accept="image/png,image/jpeg,application/pdf" required></div></div>'+
    '<p class="muted">Tu comprobante será privado y solo el Superadministrador podrá verlo. La activación queda pendiente de confirmar el abono.</p>'+
    '<button class="btn primary">Enviar solicitud con comprobante</button></form><p><a href="/">Volver</a></p></div>';
  res.send(layout('Solicitud de cuenta IDPS',preface+form,'<a href="/">Inicio</a>'));
});
async function sendRequestReceipt(row){
  const safe=mailer.escape;
  try{
    await mailer.send({to:row.email,subject:'Recibimos tu solicitud de acceso · IDPS',
      html:'<div style="font-family:Arial,sans-serif;line-height:1.6;color:#153657">'+
        '<h2>Solicitud de acceso registrada</h2>'+
        '<p>Estimada/o '+safe(row.contact_name)+':</p>'+
        '<p>Recibimos la solicitud de <b>'+safe(row.establishment_name)+'</b>, RBD <b>'+safe(row.rbd)+'</b>.</p>'+
        '<p>La solicitud queda pendiente de revisión. Esta confirmación NO contiene clave de acceso.</p>'+
        '<p>Una vez aprobada, te comunicaremos cómo ingresar a IDPS.</p>'+
        '<p>Saludos,<br><b>Material Educativo Chile · Acción Educativa SPA</b></p></div>',category:'solicitud_cliente',relatedId:row.id});
    return true;
  }catch(error){console.error('IDPS client request receipt failed:',error.message);return false;}
}

app.post('/solicitud',requestLimiter,upload.single('voucher'),async(req,res)=>{
  try{
    if(!(await paymentSettings.get()).ready)
      throw Error('Los datos de pago aún no están publicados. No transfieras hasta que aparezcan en la plataforma.');
    const rbd=clean(req.body.rbd),rbd_norm=normalizeRbd(rbd);
    if(rbd_norm.length<2)throw Error('RBD inválido.');
    const data={rbd,rbd_norm,establishment_name:clean(req.body.establishment_name),
      commune:clean(req.body.commune),contact_name:clean(req.body.contact_name),
      email:clean(req.body.email).toLowerCase(),
      voucher_name:req.file?.originalname||''};
    if(!data.establishment_name||!data.contact_name||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)))
      throw Error('Debes completar los datos del establecimiento y el contacto.');
    const request=await createRequest(data,req.file);
    await Promise.all([sendRequestNotice(request),sendRequestReceipt(request)]);
    res.redirect('/?msg='+encodeURIComponent('Solicitud recibida con comprobante. Acción Educativa SPA verificará el abono antes de habilitar tu cuenta.'));
  }catch(error){
    res.redirect('/solicitud?err=1&msg='+encodeURIComponent(error.message));
  }
});
app.post('/login', loginLimiter, async(req,res)=>{
 try{
   const est=await findEstByRbd(normalizeRbd(req.body.rbd));
   if(!est || est.status!=='active' || !(await bcrypt.compare(clean(req.body.pin), est.pin_hash))) throw new Error('RBD o PIN incorrecto, o cuenta no activa.');
   res.cookie('idps_session',token({role:'establishment',establishmentId:est.id,rbd:est.rbd_norm}),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:8*60*60*1000});
   res.redirect('/panel');
 }catch(e){res.redirect('/?err=1&msg='+encodeURIComponent(e.message));}
});

app.get('/panel', requireEst, async(req,res)=>{
 const est=await findEstByRbd(req.auth.rbd); if(!est) return res.redirect('/logout');
 res.send(layout('Panel establecimiento',`<div class="dashboard-shell"><section class="dashboard-hero"><div><span class="eyebrow">PANEL DEL ESTABLECIMIENTO</span><h1>Bienvenida/o al espacio de gestión</h1><p>Administra la aplicación IDPS, revisa resultados y utiliza la información para orientar decisiones educativas.</p></div><div class="school-chip"><div class="school-chip-icon">⌂</div><div><b>${est.name}</b><span>RBD ${est.rbd}</span><span>${est.commune||''}</span></div></div></section><div class="grid dashboard-kpis"><div class="col4 card kpi-card"><div class="kpi">0</div><b>Estudiantes cargados</b><p class="muted">La carga de nómina se habilitará en el siguiente módulo.</p></div><div class="col4 card kpi-card"><div class="kpi">0%</div><b>Aplicación</b><p class="muted">Seguimiento por curso y nivel.</p></div><div class="col4 card kpi-card"><div class="kpi">—</div><b>Diagnóstico</b><p class="muted">Se activará al recibir respuestas.</p></div></div><section class="quick-section"><div class="section-heading"><div><span class="eyebrow">ACCESOS RÁPIDOS</span><h2>Gestión institucional</h2></div><p>Todo lo necesario para administrar el proceso desde un mismo panel.</p></div><div class="quick-grid"><a class="quick-card qc-turq" href="/panel/estudiantes"><span class="quick-icon">👥</span><div><b>Nómina de estudiantes</b><small>Carga de matrícula, altas, retiros y gestión de cursos.</small></div><span class="quick-arrow">›</span></a><a class="quick-card qc-blue" href="/panel/aplicacion"><span class="quick-icon">▣</span><div><b>Aplicación de encuestas</b><small>Genera accesos y revisa el avance de respuestas.</small></div><span class="quick-arrow">›</span></a><a class="quick-card qc-yellow" href="/panel/resultados"><span class="quick-icon">▥</span><div><b>Resultados</b><small>Visualiza resultados individuales, por curso e institucionales.</small></div><span class="quick-arrow">›</span></a><a class="quick-card qc-navy" href="/panel/informe/institucional"><span class="quick-icon">▤</span><div><b>Informe institucional</b><small>Diagnóstico, interpretación y síntesis para la toma de decisiones.</small></div><span class="quick-arrow">›</span></a><a class="quick-card qc-turq" href="/panel/informe/institucional#plan-intervencion"><span class="quick-icon">◎</span><div><b>Plan de intervención</b><small>Acciones, responsables, metas, currículum y Carta Gantt.</small></div><span class="quick-arrow">›</span></a><a class="quick-card qc-blue" href="${SURVEY_URL}/encuesta-idps.html" target="_blank"><span class="quick-icon">↗</span><div><b>Portal del estudiante</b><small>Abre directamente la aplicación para estudiantes.</small></div><span class="quick-arrow">›</span></a></div></section><section class="dashboard-banner"><div><span class="eyebrow">INDICADORES DE DESARROLLO PERSONAL Y SOCIAL</span><h2>Información para fortalecer el bienestar y el desarrollo integral.</h2><p>Los resultados permiten orientar acciones de acompañamiento, convivencia, participación y vida saludable.</p></div><div class="banner-mark">IDPS</div></section><div class="legacy-controls" aria-hidden="true"><a class="btn primary" href="${SURVEY_URL}" target="_blank">Abrir encuesta publicada</a><button class="btn secondary" disabled>Cargar nómina Excel · próximo módulo</button></div></div>`,`<a href="/panel">Inicio</a><a href="/panel/estudiantes">Nómina</a><a href="/panel/aplicacion">Aplicación</a><a href="/panel/resultados">Resultados</a><a href="/logout">Cerrar sesión</a>`));
});

const superRecovery=require('./superadmin-recovery')(app,{
  pool,adminEmail:SUPERADMIN_EMAIL,legacyPasswordHash:SUPERADMIN_PASSWORD_HASH,legacySalt:SUPERADMIN_SALT,layout,
  mailAvailable:mailer.available,
  sendEmail:(email,link)=>mailer.send({
    to:email,subject:'Restablecer contraseña · Superadministrador IDPS',
    html:'<div style="font-family:Arial,sans-serif;line-height:1.6;color:#153657">'+
      '<h2>Restablecer contraseña de Superadministrador</h2>'+
      '<p>Se solicitó recuperar el acceso a IDPS. El enlace es de un solo uso y caduca en 30 minutos.</p>'+
      '<p><a href="'+mailer.escape(link)+'">Crear nueva contraseña</a></p>'+
      '<p>Si no lo solicitaste, ignora este mensaje; tu contraseña no cambiará.</p></div>',category:'recuperacion_admin'
  })
});

app.get('/superadmin',(req,res)=>{
 const msg=req.query.msg?`<div class="notice ${req.query.err?'error':'ok'}">${clean(req.query.msg)}</div>`:'';
 res.send(layout('Superadministrador',`${msg}<div class="card" style="max-width:560px;margin:auto"><h1>Superadministrador</h1><p class="muted">Acceso exclusivo de Acción Educativa SPA.</p><form method="post" action="/superadmin/login"><div class="field"><label>Correo</label><input name="email" type="email" value="accioneducativaspa@gmail.com" required></div><div class="field"><label>Contraseña</label><input name="password" type="password" required></div><button class="btn primary">Ingresar</button></form><p style="margin-top:20px"><a href="/superadmin/recuperar">¿Olvidaste tu contraseña?</a></p></div>`,`<a href="/">Inicio</a>`));
});
app.post('/superadmin/login',loginLimiter,async(req,res)=>{
  try{
    const result=await superRecovery.verifyPassword(req.body.email,req.body.password);
    if(!result.ok)return res.redirect('/superadmin?err=1&msg='+encodeURIComponent('Credenciales incorrectas.'));
    res.cookie('idps_session',token({role:'superadmin',sv:result.version}),{
      httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:8*60*60*1000
    });
    return res.redirect('/superadmin/dashboard');
  }catch(error){
    console.error('Superadmin login unavailable:',error.message);
    return res.redirect('/superadmin?err=1&msg='+encodeURIComponent('Acceso temporalmente no disponible.'));
  }
});

require('./request-payment-admin')(app,{pool,requireSuper,findRequest,layout});
paymentSettings.register(app);

app.get('/superadmin/dashboard',requireSuper,async(req,res)=>{
 const [requests,ests,gmailStatus]=await Promise.all([listRequests(),listEstablishments(),mailer.status()]);
 const pending=requests.filter(x=>x.status==='pending').length;
 const missingNotices=requests.filter(x=>x.status==='pending'&&!x.notification_sent_at).length;
 const requestActions=r=>{
   const payment=r.payment_status==='verified'?'Pago confirmado':r.payment_status==='legacy'?'Solicitud anterior':'Pago pendiente';
   const canApprove=r.status==='pending'&&['verified','legacy'].includes(r.payment_status);
   return '<div><span class="badge '+(r.payment_status==='verified'?'approved':'pending')+'">'+payment+'</span></div>'+
     '<div class="actions">'+
     (r.voucher_available?'<a class="btn secondary" href="/superadmin/pagos/'+r.id+'">Ver comprobante / pago</a>':'')+
     (canApprove?'<form method="post" action="/superadmin/approve/'+r.id+'"><button class="btn success">Aprobar cuenta</button></form>':'')+
     (r.status==='pending'?'<form method="post" action="/superadmin/reject/'+r.id+'"><button class="btn danger">Rechazar</button></form>':'')+
     '<form method="post" action="/superadmin/delete-request/'+r.id+'" onsubmit="return confirm(\'¿Eliminar esta solicitud?\')"><button class="btn danger">Eliminar solicitud</button></form></div>';
 };
 const reqRows=requests.map(r=>'<tr><td>'+r.rbd+'</td><td><b>'+r.establishment_name+'</b><br><span class="muted">'+(r.commune||'')+'</span></td><td>'+r.contact_name+'<br>'+r.email+'</td><td>'+(r.voucher_available?'<a href="/superadmin/pagos/'+r.id+'">Ver fotografía o PDF</a>':r.voucher_name?'Comprobante antiguo no conservado':'Sin archivo')+'</td><td><span class="badge '+r.status+'">'+r.status+'</span></td><td>'+requestActions(r)+'</td></tr>').join('');
 const reqCards=requests.map(r=>'<div class="mobile-item"><div class="mobile-row"><span class="mobile-label">RBD</span><b>'+r.rbd+'</b></div><div class="mobile-row"><span class="mobile-label">Establecimiento</span><b>'+r.establishment_name+'</b><br><span class="muted">'+(r.commune||'')+'</span></div><div class="mobile-row"><span class="mobile-label">Contacto</span>'+r.contact_name+'<br>'+r.email+'</div><div class="mobile-row"><span class="mobile-label">Voucher</span>'+(r.voucher_available?'<a href="/superadmin/pagos/'+r.id+'">Ver fotografía o PDF</a>':r.voucher_name?'Comprobante antiguo no conservado':'Sin archivo')+'</div><div class="mobile-row"><span class="mobile-label">Estado</span><span class="badge '+r.status+'">'+r.status+'</span></div>'+requestActions(r)+'</div>').join('');
 const accountActions=e=>'<div class="actions"><form method="post" action="/superadmin/send-password/'+e.id+'" onsubmit="return confirm(\'Esto generará un PIN nuevo y anulará el anterior. ¿Continuar?\')"><button class="btn secondary">Generar y enviar PIN nuevo</button></form><form method="post" action="/superadmin/remove/'+e.id+'" onsubmit="return confirm(\'¿Eliminar esta cuenta?\')"><button class="btn danger">Eliminar cuenta</button></form></div>';
 const estRows=ests.map(e=>'<tr><td>'+e.rbd+'</td><td><b>'+e.name+'</b><br><span class="muted">'+(e.commune||'')+'</span></td><td>'+e.email+'</td><td><span class="badge '+e.status+'">'+e.status+'</span></td><td>'+(e.expires_at?new Date(e.expires_at).toLocaleDateString('es-CL'):'—')+'</td><td>'+accountActions(e)+'</td></tr>').join('');
 const estCards=ests.map(e=>'<div class="mobile-item"><div class="mobile-row"><span class="mobile-label">RBD</span><b>'+e.rbd+'</b></div><div class="mobile-row"><span class="mobile-label">Establecimiento</span><b>'+e.name+'</b><br><span class="muted">'+(e.commune||'')+'</span></div><div class="mobile-row"><span class="mobile-label">Correo</span>'+e.email+'</div><div class="mobile-row"><span class="mobile-label">Estado</span><span class="badge '+e.status+'">'+e.status+'</span></div><div class="mobile-row"><span class="mobile-label">Vigencia</span>'+(e.expires_at?new Date(e.expires_at).toLocaleDateString('es-CL'):'—')+'</div>'+accountActions(e)+'</div>').join('');
 res.send(layout('Panel superadministrador',`<div class="grid"><div class="col12 card"><h2>Pagos por transferencia</h2><p>Configura los datos bancarios que verán los establecimientos al solicitar una cuenta y revisa sus comprobantes antes de aprobar.</p><a class="btn primary" href="/superadmin/datos-transferencia">Datos de transferencia</a></div><div class="col12 card"><h2>Correo institucional</h2><p>${gmailStatus.connected?'Gmail autorizado y operativo para el envío de mensajes.':'Gmail necesita reconexión: los correos no pueden enviarse todavía.'}</p><p>Los envíos se harán desde la cuenta de Gmail autorizada y quedarán en su carpeta Enviados.</p><a class="btn secondary" href="/auth/google">${gmailStatus.connected?'Cambiar o renovar Gmail':'Reconectar Gmail'}</a> <a class="btn primary" href="/superadmin/correos">Ver historial de correos</a></div><div class="col12 card"><h2>Avisos de solicitudes</h2><p>Hay <b>${missingNotices}</b> solicitud(es) pendiente(s) cuyos avisos no constan como aceptados por el proveedor de correo. Esto no confirma recepción en la bandeja del destinatario.</p><form method="post" action="/superadmin/notificaciones/reintentar"><button class="btn secondary" ${missingNotices===0?'disabled':''}>Reintentar avisos pendientes</button></form></div><div class="col4 card"><div class="kpi">${pending}</div><b>Solicitudes pendientes</b></div><div class="col4 card"><div class="kpi">${ests.filter(x=>x.status==='active').length}</div><b>Establecimientos activos</b></div><div class="col4 card"><div class="kpi">${requests.length}</div><b>Solicitudes totales</b></div><div class="col12 card"><h2>Correo automático</h2>${gmailStatus.connected?'<p class="muted">Gmail disponible para enviar. Los mensajes quedan en Enviados.</p><span class="btn success">✓ Gmail operativo</span>':'<p class="muted">Gmail necesita autorización para enviar correos.</p><a class="btn primary" href="/auth/google">Reconectar Gmail</a>'}</div><div class="col12 card"><h2>Solicitudes de cuenta</h2><table class="desktop-table"><thead><tr><th>RBD</th><th>Establecimiento</th><th>Contacto</th><th>Voucher</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${reqRows||'<tr><td colspan="6">Aún no hay solicitudes.</td></tr>'}</tbody></table><div class="mobile-list">${reqCards||'<p class="muted">Aún no hay solicitudes.</p>'}</div></div><div class="col12 card"><h2>Establecimientos</h2><table class="desktop-table"><thead><tr><th>RBD</th><th>Establecimiento</th><th>Correo</th><th>Estado</th><th>Vigencia</th><th>Acciones</th></tr></thead><tbody>${estRows||'<tr><td colspan="6">Aún no hay cuentas activas.</td></tr>'}</tbody></table><div class="mobile-list">${estCards||'<p class="muted">Aún no hay cuentas activas.</p>'}</div></div></div>`,`<a href="/superadmin/dashboard">Panel</a><a href="/logout">Cerrar sesión</a>`));
});

app.get('/superadmin/correos',requireSuper,async(req,res)=>{
  try{
    const items=await mailer.history(100);
    const safe=mailer.escape;
    const rows=items.map(m=>{
      const date=new Date(m.created_at);
      const when=Number.isFinite(date.getTime())?date.toLocaleString('es-CL',{timeZone:'America/Santiago'}):'—';
      const status=m.status==='accepted'?'Aceptado por Gmail':'Fallido';
      return '<tr><td>'+safe(when)+'</td><td>'+safe(m.category.replaceAll('_',' '))+'</td>'+
        '<td>'+safe(m.recipient)+'</td><td>'+safe(m.subject)+'</td>'+
        '<td>'+status+'</td><td>'+safe(m.provider_message_id||'—')+'</td></tr>';
    }).join('');
    res.set('Cache-Control','no-store');
    return res.send(layout('Historial de correos IDPS',
      '<div class="card"><h1>Historial de correos institucionales</h1>'+
      '<p>El estado «Aceptado por Gmail» significa que el proveedor recibió el mensaje para envío; '+
      '<b>no demuestra que la clienta lo haya recibido, abierto o leído</b>.</p>'+
      '<p>Los correos aceptados se guardan en la carpeta <b>Enviados</b> del Gmail conectado.</p>'+
      '<p><a class="btn primary" href="https://mail.google.com/mail/u/0/#sent" target="_blank" rel="noopener noreferrer">Abrir Gmail · Enviados</a> '+
      '<a class="btn secondary" href="/superadmin/dashboard">Volver al panel</a></p>'+
      '<div style="overflow-x:auto"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Destinatario</th>'+
      '<th>Asunto</th><th>Estado</th><th>ID Gmail</th></tr></thead><tbody>'+
      (rows||'<tr><td colspan="6">No existen correos registrados por la nueva función.</td></tr>')+
      '</tbody></table></div>'+
      '<p class="muted">Los envíos anteriores a la activación de este registro no pueden reconstruirse desde aquí.</p></div>',
      '<a href="/superadmin/dashboard">Panel</a><a href="/logout">Cerrar sesión</a>'));
  }catch(error){
    console.error('IDPS email history unavailable:',error.message);
    return res.status(503).send(layout('Historial no disponible',
      '<div class="card"><h1>Historial temporalmente no disponible</h1>'+
      '<p><a href="/superadmin/dashboard">Volver al panel</a></p></div>'));
  }
});

app.post('/superadmin/notificaciones/reintentar',requireSuper,async(req,res)=>{
  try{
    const items=(await listRequests()).filter(r=>r.status==='pending'&&!r.notification_sent_at).slice(0,30);
    let ok=0;
    for(const item of items)if(await sendRequestNotice(item))ok++;
    return res.redirect('/superadmin/dashboard?msg='+encodeURIComponent(
      'El proveedor aceptó '+ok+' de '+items.length+' aviso(s). La recepción por el destinatario no está confirmada.'));
  }catch(error){console.error('IDPS retry notices failed:',error.message);
    return res.redirect('/superadmin/dashboard?err=1&msg='+encodeURIComponent('No se pudieron reintentar los avisos.'));}
});

app.post('/superadmin/approve/:id',requireSuper,async(req,res)=>{
  let result;
  try{result=await approveRequest(req.params.id);}
  catch(error){console.error('IDPS account approval failed:',error.message);
    return res.redirect('/superadmin/dashboard?err=1&msg='+encodeURIComponent('No se pudo aprobar la cuenta.'));}
  try{
    await sendActivation(result.est,result.generatedPin);
    return res.redirect('/superadmin/dashboard?msg='+encodeURIComponent(
      'Cuenta aprobada. El proveedor aceptó el correo de acceso; confirma recepción con el establecimiento.'));
  }catch(error){
    console.error('IDPS activation email failed:',error.message);
    res.set('Cache-Control','no-store');
    return res.send(layout('Cuenta aprobada, correo pendiente',
      '<section class="card"><h1>Cuenta aprobada, correo pendiente</h1>'+
      '<p>La cuenta se creó, pero el correo no se envió correctamente. Entrega el PIN por un canal privado verificado o vuelve a generarlo cuando funcione el correo.</p>'+
      '<p><b>RBD:</b> '+mailer.escape(result.est.rbd)+'</p>'+
      '<p><b>PIN provisional (se muestra una vez):</b> <strong>'+mailer.escape(result.generatedPin)+'</strong></p>'+
      '<p><a href="/superadmin/dashboard">Volver al panel</a></p></section>'));
  }
});
app.post('/superadmin/reject/:id',requireSuper,async(req,res)=>{await rejectRequest(req.params.id); res.redirect('/superadmin/dashboard?msg='+encodeURIComponent('Solicitud rechazada.'));});
app.post('/superadmin/delete-request/:id',requireSuper,async(req,res)=>{try{await deleteRequest(req.params.id);res.redirect('/superadmin/dashboard?msg='+encodeURIComponent('Solicitud eliminada correctamente.'));}catch(e){res.redirect('/superadmin/dashboard?err=1&msg='+encodeURIComponent(e.message));}});
app.post('/superadmin/send-password/:id',requireSuper,async(req,res)=>{
  const connection=await mailer.status();
  if(!connection.connected)return res.redirect('/superadmin/dashboard?err=1&msg='+encodeURIComponent('Gmail no está conectado. Reconéctalo antes de generar un PIN nuevo. La clave actual no se modificó.'));
  let reset;
  try{reset=await resetPin(req.params.id);}
  catch(error){console.error('IDPS PIN reset error:',error.message);
    return res.redirect('/superadmin/dashboard?err=1&msg='+encodeURIComponent('No se pudo generar el PIN.'));}
  try{
    await sendActivation(reset.est,reset.generatedPin);
    return res.redirect('/superadmin/dashboard?msg='+encodeURIComponent(
      'Nuevo PIN generado. El proveedor aceptó el correo; verifica recepción con el establecimiento.'));
  }catch(error){
    console.error('IDPS PIN delivery failed:',error.message);
    res.set('Cache-Control','no-store');
    return res.send(layout('PIN nuevo, correo no enviado',
      '<section class="card"><h1>PIN generado, pero correo no enviado</h1>'+
      '<p>El PIN anterior ya fue reemplazado. Puedes comunicar el nuevo PIN por un medio privado.</p>'+
      '<p><b>RBD:</b> '+mailer.escape(reset.est.rbd)+'</p>'+
      '<p><b>PIN provisional (se muestra una vez):</b> <strong>'+mailer.escape(reset.generatedPin)+'</strong></p>'+
      '<p><a href="/superadmin/dashboard">Volver al panel</a></p></section>'));
  }
});
app.post('/superadmin/remove/:id',requireSuper,async(req,res)=>{try{await removeEst(req.params.id);res.redirect('/superadmin/dashboard?msg='+encodeURIComponent('Cuenta eliminada correctamente.'));}catch(e){res.redirect('/superadmin/dashboard?err=1&msg='+encodeURIComponent(e.message));}});
app.get('/logout',(req,res)=>{res.clearCookie('idps_session');res.redirect('/');});
app.get('/health',(req,res)=>res.json({ok:true,database:pool?'postgres':'temporary',mail:!!process.env.RESEND_API_KEY}));

initDb().then(()=>mailer.init()).then(()=>paymentSettings.init()).then(()=>superRecovery.init()).then(()=>app.listen(PORT,()=>console.log(`IDPS portal on ${PORT}`))).catch(err=>{console.error(err);process.exit(1)});
