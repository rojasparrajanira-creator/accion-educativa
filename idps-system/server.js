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
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const SUPERADMIN_EMAIL = (process.env.SUPERADMIN_EMAIL || 'accioneducativaspa@gmail.com').toLowerCase();
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || '';
const SURVEY_URL = process.env.SURVEY_URL || 'https://diagnostico-idps-material-educativo.onrender.com';
const DATABASE_URL = process.env.DATABASE_URL || '';
const upload = multer({storage: multer.memoryStorage(), limits:{fileSize: 5 * 1024 * 1024}});
const pool = DATABASE_URL ? new Pool({connectionString:DATABASE_URL, ssl:{rejectUnauthorized:false}}) : null;

app.use(helmet({contentSecurityPolicy:false}));
app.use(express.urlencoded({extended:true}));
app.use(express.json({limit:'1mb'}));
app.use(cookieParser());

const loginLimiter = rateLimit({windowMs:15*60*1000, limit:10, standardHeaders:true, legacyHeaders:false});

const mem = { requests: [], establishments: [] };

function normalizeRbd(v=''){ return String(v).toUpperCase().replace(/[^0-9K]/g,''); }
function clean(v=''){ return String(v).trim(); }
function pin6(){ return String(crypto.randomInt(100000, 1000000)); }
function id(){ return crypto.randomUUID(); }
function token(payload){ return jwt.sign(payload, JWT_SECRET, {expiresIn:'8h'}); }
function getAuth(req){ try { return jwt.verify(req.cookies.idps_session || '', JWT_SECRET); } catch { return null; } }
function requireSuper(req,res,next){ const a=getAuth(req); if(!a || a.role!=='superadmin') return res.redirect('/superadmin'); req.auth=a; next(); }
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
}

async function createRequest(data){
  const row = {id:id(), ...data, status:'pending', created_at:new Date().toISOString()};
  if(pool){
    await pool.query(`INSERT INTO idps_account_requests(id,rbd,rbd_norm,establishment_name,commune,contact_name,email,voucher_name,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending')`,[row.id,row.rbd,row.rbd_norm,row.establishment_name,row.commune,row.contact_name,row.email,row.voucher_name]);
  } else mem.requests.unshift(row);
  return row;
}
async function listRequests(){
  if(pool) return (await pool.query(`SELECT * FROM idps_account_requests ORDER BY created_at DESC`)).rows;
  return mem.requests;
}
async function findRequest(rid){
  if(pool) return (await pool.query(`SELECT * FROM idps_account_requests WHERE id=$1`,[rid])).rows[0];
  return mem.requests.find(x=>x.id===rid);
}
async function approveRequest(rid){
  const r = await findRequest(rid); if(!r) throw new Error('Solicitud no encontrada');
  const generatedPin = pin6(); const pinHash = await bcrypt.hash(generatedPin, 10);
  const est = {id:id(), rbd:r.rbd, rbd_norm:r.rbd_norm, name:r.establishment_name, commune:r.commune, contact_name:r.contact_name, email:r.email, pin_hash:pinHash, status:'active', created_at:new Date().toISOString(), expires_at:new Date(Date.now()+365*86400000).toISOString()};
  if(pool){
    await pool.query('BEGIN');
    try{
      await pool.query(`INSERT INTO idps_establishments(id,rbd,rbd_norm,name,commune,contact_name,email,pin_hash,status,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active',$9)
        ON CONFLICT (rbd_norm) DO UPDATE SET name=EXCLUDED.name, commune=EXCLUDED.commune, contact_name=EXCLUDED.contact_name, email=EXCLUDED.email, pin_hash=EXCLUDED.pin_hash, status='active', expires_at=EXCLUDED.expires_at`,
        [est.id,est.rbd,est.rbd_norm,est.name,est.commune,est.contact_name,est.email,est.pin_hash,est.expires_at]);
      await pool.query(`UPDATE idps_account_requests SET status='approved', reviewed_at=now() WHERE id=$1`,[rid]);
      await pool.query('COMMIT');
    } catch(e){ await pool.query('ROLLBACK'); throw e; }
  } else {
    const idx=mem.establishments.findIndex(x=>x.rbd_norm===est.rbd_norm); if(idx>=0) mem.establishments[idx]=est; else mem.establishments.unshift(est);
    r.status='approved'; r.reviewed_at=new Date().toISOString();
  }
  return {est, generatedPin};
}
async function rejectRequest(rid){
  if(pool) await pool.query(`UPDATE idps_account_requests SET status='rejected', reviewed_at=now() WHERE id=$1`,[rid]);
  else { const r=mem.requests.find(x=>x.id===rid); if(r){r.status='rejected'; r.reviewed_at=new Date().toISOString();} }
}
async function findEstByRbd(norm){
  if(pool) return (await pool.query(`SELECT * FROM idps_establishments WHERE rbd_norm=$1`,[norm])).rows[0];
  return mem.establishments.find(x=>x.rbd_norm===norm);
}
async function listEstablishments(){
  if(pool) return (await pool.query(`SELECT id,rbd,rbd_norm,name,commune,contact_name,email,status,created_at,expires_at FROM idps_establishments ORDER BY created_at DESC`)).rows;
  return mem.establishments.map(({pin_hash,...x})=>x);
}

async function sendActivation(est,pin){
  const pass = process.env.GMAIL_APP_PASSWORD;
  if(!pass) return {sent:false, reason:'GMAIL_APP_PASSWORD pendiente'};
  const transporter = nodemailer.createTransport({service:'gmail', auth:{user:'accioneducativaspa@gmail.com', pass}});
  await transporter.sendMail({
    from:'Acción Educativa SPA <accioneducativaspa@gmail.com>', to:est.email,
    subject:'Cuenta activada · Diagnóstico IDPS Material Educativo Chile',
    html:`<div style="font-family:Arial,sans-serif;color:#0F2D52"><h2>Cuenta activada</h2><p>Estimado/a ${est.contact_name||'responsable'}:</p><p>La cuenta de <b>${est.name}</b> ha sido aprobada.</p><p><b>RBD:</b> ${est.rbd}<br><b>PIN de acceso:</b> ${pin}</p><p>Acceso: <a href="${process.env.PUBLIC_URL||''}">${process.env.PUBLIC_URL||'Plataforma Diagnóstico IDPS'}</a></p><p>Por seguridad, conserve este PIN solo para el equipo autorizado.</p><p>Saludos cordiales,<br><b>Acción Educativa SPA</b></p></div>`
  });
  return {sent:true};
}

const css = `
:root{--navy:#0F2D52;--blue:#1E7FBC;--turq:#19C2D1;--yellow:#FFD200;--bg:#F4F7FA;--line:#E6E8EB;--text:#17324d;--red:#c0392b;--green:#198754}
*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;background:var(--bg);color:var(--text)}
header{background:var(--navy);color:#fff;padding:18px 24px}.wrap{max-width:1180px;margin:auto}.brand{display:flex;align-items:center;justify-content:space-between;gap:16px}.brand b{font-size:20px}.brand small{opacity:.8}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:0 8px 28px rgba(15,45,82,.07)}
main{padding:34px 18px}.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:20px}.col6{grid-column:span 6}.col12{grid-column:span 12}.col4{grid-column:span 4}
h1,h2,h3{color:var(--navy);margin-top:0}.muted{color:#637083}.field{margin:14px 0}.field label{display:block;font-size:13px;font-weight:800;margin-bottom:6px}.field input,.field select{width:100%;padding:12px 13px;border:1px solid #cfd8e3;border-radius:10px;background:#fff}.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:999px;padding:11px 20px;font-weight:800;cursor:pointer;text-decoration:none}.primary{background:var(--blue);color:#fff}.secondary{background:#fff;color:var(--blue);border:1px solid var(--blue)}.warn{background:var(--yellow);color:var(--navy)}.danger{background:#fff;color:var(--red);border:1px solid #efb4ae}.success{background:var(--green);color:#fff}.actions{display:flex;gap:10px;flex-wrap:wrap}.notice{padding:12px 14px;border-radius:10px;margin:12px 0;background:#ecf8fb;border:1px solid #b6edf2}.error{background:#fff0ef;border-color:#f0b8b3}.ok{background:#eef9f3;border-color:#bfe7cf}.badge{display:inline-block;padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800}.pending{background:#fff7d1}.approved,.active{background:#e7f6ec;color:#166534}.rejected,.suspended{background:#fde8e7;color:#991b1b}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:11px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;color:#637083}.kpi{font-size:30px;font-weight:900;color:var(--navy)}.topnav a{color:#fff;text-decoration:none;margin-left:14px;font-weight:700}.mode{font-size:12px;color:#637083;margin-top:8px}@media(max-width:780px){.col6,.col4{grid-column:span 12}.brand{align-items:flex-start;flex-direction:column}.topnav a{margin:0 12px 0 0}table{display:block;overflow:auto}}
`;
function layout(title, body, nav=''){
 return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0F2D52"><title>${title}</title><style>${css}</style></head><body><header><div class="wrap brand"><div><b>Material Educativo Chile</b><br><small>Diagnóstico IDPS · Gestión de establecimientos</small></div><div class="topnav">${nav}</div></div></header><main><div class="wrap">${body}<div class="mode">Sistema: ${pool?'base de datos central':'modo de configuración temporal'}.</div></div></main></body></html>`;
}

app.get('/', (req,res)=>{
 const msg=req.query.msg?`<div class="notice ${req.query.err?'error':'ok'}">${clean(req.query.msg)}</div>`:'';
 res.send(layout('Acceso establecimiento', `${msg}<div class="grid"><div class="col6 card"><h1>Acceso establecimiento</h1><p class="muted">Ingrese con el RBD del establecimiento y su PIN de 4 a 6 dígitos.</p><form method="post" action="/login"><div class="field"><label>RBD</label><input name="rbd" placeholder="Ej.: 6586-2" required></div><div class="field"><label>PIN</label><input name="pin" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" type="password" required></div><button class="btn primary">Ingresar</button></form></div><div class="col6 card"><h2>¿Aún no tiene cuenta?</h2><p>Solicite la activación del establecimiento y adjunte su comprobante de pago.</p><a class="btn secondary" href="/solicitud">Solicitar cuenta</a><p style="margin-top:22px"><a href="/superadmin">Acceso superadministrador</a></p></div></div>`));
});

app.get('/solicitud',(req,res)=>res.send(layout('Solicitud de cuenta',`<div class="card" style="max-width:760px;margin:auto"><h1>Solicitud de cuenta</h1><p class="muted">La cuenta quedará pendiente hasta que Acción Educativa SPA revise y apruebe la solicitud.</p><form method="post" action="/solicitud" enctype="multipart/form-data"><div class="grid"><div class="col6 field"><label>RBD *</label><input name="rbd" required></div><div class="col6 field"><label>Nombre del establecimiento *</label><input name="establishment_name" required></div><div class="col6 field"><label>Comuna</label><input name="commune"></div><div class="col6 field"><label>Nombre responsable *</label><input name="contact_name" required></div><div class="col6 field"><label>Correo de contacto *</label><input name="email" type="email" required></div><div class="col6 field"><label>Voucher / comprobante de pago</label><input name="voucher" type="file" accept=".pdf,.jpg,.jpeg,.png"></div></div><button class="btn primary">Enviar solicitud</button></form></div>`,`<a href="/">Volver</a>`)));

app.post('/solicitud', upload.single('voucher'), async(req,res)=>{
 try{
  const rbd=clean(req.body.rbd), rbd_norm=normalizeRbd(rbd); if(rbd_norm.length<2) throw new Error('RBD inválido.');
  await createRequest({rbd,rbd_norm,establishment_name:clean(req.body.establishment_name),commune:clean(req.body.commune),contact_name:clean(req.body.contact_name),email:clean(req.body.email).toLowerCase(),voucher_name:req.file?req.file.originalname:''});
  res.redirect('/?msg='+encodeURIComponent('Solicitud recibida. Quedó pendiente de aprobación.'));
 } catch(e){ res.redirect('/?err=1&msg='+encodeURIComponent(e.message)); }
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
 res.send(layout('Panel establecimiento',`<div class="grid"><div class="col12"><h1>${est.name}</h1><p class="muted">RBD ${est.rbd} · ${est.commune||''}</p></div><div class="col4 card"><div class="kpi">0</div><b>Estudiantes cargados</b><p class="muted">La carga de nómina se habilitará en el siguiente módulo.</p></div><div class="col4 card"><div class="kpi">0%</div><b>Aplicación</b><p class="muted">Seguimiento por curso y nivel.</p></div><div class="col4 card"><div class="kpi">—</div><b>Diagnóstico</b><p class="muted">Se activará al recibir respuestas.</p></div><div class="col12 card"><h2>Cuenta activa</h2><p>Desde aquí se administrarán matrícula, cursos, enlaces individuales y diagnósticos.</p><div class="actions"><a class="btn primary" href="${SURVEY_URL}" target="_blank">Abrir encuesta publicada</a><button class="btn secondary" disabled>Cargar nómina Excel · próximo módulo</button></div></div></div>`,`<a href="/logout">Cerrar sesión</a>`));
});

app.get('/superadmin',(req,res)=>{
 const msg=req.query.msg?`<div class="notice ${req.query.err?'error':'ok'}">${clean(req.query.msg)}</div>`:'';
 res.send(layout('Superadministrador',`${msg}<div class="card" style="max-width:560px;margin:auto"><h1>Superadministrador</h1><p class="muted">Acceso exclusivo de Acción Educativa SPA.</p><form method="post" action="/superadmin/login"><div class="field"><label>Correo</label><input name="email" type="email" value="accioneducativaspa@gmail.com" required></div><div class="field"><label>Contraseña</label><input name="password" type="password" required></div><button class="btn primary">Ingresar</button></form></div>`,`<a href="/">Inicio</a>`));
});
app.post('/superadmin/login',loginLimiter,(req,res)=>{
 const okEmail=clean(req.body.email).toLowerCase()===SUPERADMIN_EMAIL; const a=Buffer.from(clean(req.body.password)); const b=Buffer.from(SUPERADMIN_PASSWORD);
 const okPass=SUPERADMIN_PASSWORD && a.length===b.length && crypto.timingSafeEqual(a,b);
 if(!okEmail||!okPass) return res.redirect('/superadmin?err=1&msg='+encodeURIComponent('Credenciales incorrectas.'));
 res.cookie('idps_session',token({role:'superadmin'}),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:8*60*60*1000}); res.redirect('/superadmin/dashboard');
});

app.get('/superadmin/dashboard',requireSuper,async(req,res)=>{
 const [requests,ests]=await Promise.all([listRequests(),listEstablishments()]);
 const pending=requests.filter(x=>x.status==='pending').length;
 const reqRows=requests.map(r=>`<tr><td>${r.rbd}</td><td><b>${r.establishment_name}</b><br><span class="muted">${r.commune||''}</span></td><td>${r.contact_name}<br>${r.email}</td><td>${r.voucher_name||'Sin archivo'}</td><td><span class="badge ${r.status}">${r.status}</span></td><td>${r.status==='pending'?`<div class="actions"><form method="post" action="/superadmin/approve/${r.id}"><button class="btn success">Aprobar</button></form><form method="post" action="/superadmin/reject/${r.id}"><button class="btn danger">Rechazar</button></form></div>`:''}</td></tr>`).join('');
 const estRows=ests.map(e=>`<tr><td>${e.rbd}</td><td><b>${e.name}</b><br><span class="muted">${e.commune||''}</span></td><td>${e.email}</td><td><span class="badge ${e.status}">${e.status}</span></td><td>${e.expires_at?new Date(e.expires_at).toLocaleDateString('es-CL'):'—'}</td></tr>`).join('');
 res.send(layout('Panel superadministrador',`<div class="grid"><div class="col4 card"><div class="kpi">${pending}</div><b>Solicitudes pendientes</b></div><div class="col4 card"><div class="kpi">${ests.filter(x=>x.status==='active').length}</div><b>Establecimientos activos</b></div><div class="col4 card"><div class="kpi">${requests.length}</div><b>Solicitudes totales</b></div><div class="col12 card"><h2>Solicitudes de cuenta</h2><table><thead><tr><th>RBD</th><th>Establecimiento</th><th>Contacto</th><th>Voucher</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${reqRows||'<tr><td colspan="6">Aún no hay solicitudes.</td></tr>'}</tbody></table></div><div class="col12 card"><h2>Establecimientos</h2><table><thead><tr><th>RBD</th><th>Establecimiento</th><th>Correo</th><th>Estado</th><th>Vigencia</th></tr></thead><tbody>${estRows||'<tr><td colspan="5">Aún no hay cuentas activas.</td></tr>'}</tbody></table></div></div>`,`<a href="/superadmin/dashboard">Panel</a><a href="/logout">Cerrar sesión</a>`));
});

app.post('/superadmin/approve/:id',requireSuper,async(req,res)=>{
 try{
   const {est,generatedPin}=await approveRequest(req.params.id); const mail=await sendActivation(est,generatedPin);
   const suffix=mail.sent?' Correo de activación enviado.':' Cuenta activada; el correo automático quedará habilitado al configurar Gmail.';
   res.redirect('/superadmin/dashboard?msg='+encodeURIComponent(`Cuenta aprobada para ${est.name}. PIN generado: ${generatedPin}.${suffix}`));
 }catch(e){res.redirect('/superadmin/dashboard?err=1&msg='+encodeURIComponent(e.message));}
});
app.post('/superadmin/reject/:id',requireSuper,async(req,res)=>{await rejectRequest(req.params.id); res.redirect('/superadmin/dashboard?msg='+encodeURIComponent('Solicitud rechazada.'));});
app.get('/logout',(req,res)=>{res.clearCookie('idps_session');res.redirect('/');});
app.get('/health',(req,res)=>res.json({ok:true,database:pool?'postgres':'temporary',mail:!!process.env.GMAIL_APP_PASSWORD}));

initDb().then(()=>app.listen(PORT,()=>console.log(`IDPS portal on ${PORT}`))).catch(err=>{console.error(err);process.exit(1)});
