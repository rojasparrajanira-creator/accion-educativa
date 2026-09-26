const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'server.js');
let s = fs.readFileSync(file, 'utf8');

if (s.includes('/* MEC_ACCESS_PATCH_V2 */')) process.exit(0);

function mustReplace(from, to, label) {
  if (!s.includes(from)) throw new Error(`No se pudo aplicar parche: ${label}`);
  s = s.replace(from, to);
}

mustReplace(
  "const DATABASE_URL = process.env.DATABASE_URL || '';",
  "const DATABASE_URL = process.env.DATABASE_URL || '';\nconst ACCESS_DAYS = Math.max(1, parseInt(process.env.ACCESS_DAYS || '30', 10) || 30);\nconst PUBLIC_URL = process.env.PUBLIC_URL || 'https://idps-gestion-material-educativo.onrender.com';\n/* MEC_ACCESS_PATCH_V2 */",
  'configuración de acceso'
);

mustReplace(
  "expires_at:new Date(Date.now()+365*86400000).toISOString()",
  "expires_at:new Date(Date.now()+ACCESS_DAYS*86400000).toISOString()",
  'vigencia 30 días'
);

mustReplace(
  "async function findEstByRbd(norm){\n  if(pool) return (await pool.query(`SELECT * FROM idps_establishments WHERE rbd_norm=$1`,[norm])).rows[0];\n  return mem.establishments.find(x=>x.rbd_norm===norm);\n}\n",
  "async function findEstByRbd(norm){\n  if(pool) return (await pool.query(`SELECT * FROM idps_establishments WHERE rbd_norm=$1`,[norm])).rows[0];\n  return mem.establishments.find(x=>x.rbd_norm===norm);\n}\nasync function findEstById(eid){\n  if(pool) return (await pool.query(`SELECT * FROM idps_establishments WHERE id=$1`,[eid])).rows[0];\n  return mem.establishments.find(x=>x.id===eid);\n}\nasync function regenerateEstPin(eid){\n  const est=await findEstById(eid); if(!est) throw new Error('Establecimiento no encontrado');\n  const generatedPin=pin6(); const pinHash=await bcrypt.hash(generatedPin,10);\n  if(pool) await pool.query(`UPDATE idps_establishments SET pin_hash=$1 WHERE id=$2`,[pinHash,eid]);\n  else est.pin_hash=pinHash;\n  return {est,generatedPin};\n}\n",
  'regeneración de PIN'
);

mustReplace(
  "<p><b>RBD:</b> ${est.rbd}<br><b>PIN de acceso:</b> ${pin}</p><p>Acceso: <a href=\"${process.env.PUBLIC_URL||''}\">${process.env.PUBLIC_URL||'Plataforma Diagnóstico IDPS'}</a></p>",
  "<p><b>RBD:</b> ${est.rbd}<br><b>PIN de acceso:</b> ${pin}<br><b>Vigencia hasta:</b> ${est.expires_at?new Date(est.expires_at).toLocaleDateString('es-CL'):'—'}</p><p>Acceso: <a href=\"${PUBLIC_URL}\">${PUBLIC_URL}</a></p>",
  'correo con vigencia y enlace'
);

mustReplace(
  "if(!est || est.status!=='active' || !(await bcrypt.compare(clean(req.body.pin), est.pin_hash))) throw new Error('RBD o PIN incorrecto, o cuenta no activa.');",
  "if(!est || est.status!=='active') throw new Error('RBD o PIN incorrecto, o cuenta no activa.');\n   if(est.expires_at && new Date(est.expires_at).getTime() < Date.now()) throw new Error('La vigencia de esta cuenta ha finalizado. Solicite una nueva activación.');\n   if(!(await bcrypt.compare(clean(req.body.pin), est.pin_hash))) throw new Error('RBD o PIN incorrecto, o cuenta no activa.');",
  'bloqueo por vencimiento'
);

mustReplace(
  "<div class=\"col12 card\"><h2>Cuenta activa</h2><p>Desde aquí se administrarán matrícula, cursos, enlaces individuales y diagnósticos.</p>",
  "<div class=\"col12 card\"><h2>Cuenta activa</h2><p><b>Vigencia hasta:</b> ${est.expires_at?new Date(est.expires_at).toLocaleDateString('es-CL'):'—'}</p><p>Desde aquí se administrarán matrícula, cursos, enlaces individuales y diagnósticos.</p>",
  'vigencia en panel establecimiento'
);

mustReplace(
  "const estRows=ests.map(e=>`<tr><td>${e.rbd}</td><td><b>${e.name}</b><br><span class=\"muted\">${e.commune||''}</span></td><td>${e.email}</td><td><span class=\"badge ${e.status}\">${e.status}</span></td><td>${e.expires_at?new Date(e.expires_at).toLocaleDateString('es-CL'):'—'}</td></tr>`).join('');",
  "const estRows=ests.map(e=>{const expired=e.expires_at&&new Date(e.expires_at).getTime()<Date.now();return `<tr><td>${e.rbd}</td><td><b>${e.name}</b><br><span class=\"muted\">${e.commune||''}</span></td><td>${e.email}</td><td><span class=\"badge ${expired?'rejected':e.status}\">${expired?'vencida':e.status}</span></td><td>${e.expires_at?new Date(e.expires_at).toLocaleDateString('es-CL'):'—'}</td><td><form method=\"post\" action=\"/superadmin/regenerate/${e.id}\"><button class=\"btn secondary\">Regenerar PIN</button></form></td></tr>`}).join('');",
  'acciones de establecimientos'
);

mustReplace(
  "<div class=\"col12 card\"><h2>Establecimientos</h2><table><thead><tr><th>RBD</th><th>Establecimiento</th><th>Correo</th><th>Estado</th><th>Vigencia</th></tr></thead><tbody>${estRows||'<tr><td colspan=\"5\">Aún no hay cuentas activas.</td></tr>'}</tbody></table></div>",
  "<div class=\"col12 card\"><h2>Establecimientos</h2><p class=\"muted\">Cada activación tiene ${ACCESS_DAYS} días de vigencia. Al vencer, el acceso queda bloqueado automáticamente.</p><table><thead><tr><th>RBD</th><th>Establecimiento</th><th>Correo</th><th>Estado</th><th>Vigencia</th><th>Acciones</th></tr></thead><tbody>${estRows||'<tr><td colspan=\"6\">Aún no hay cuentas activas.</td></tr>'}</tbody></table></div>",
  'tabla superadministrador'
);

mustReplace(
  "const suffix=mail.sent?' Correo de activación enviado.':' Cuenta activada; el correo automático quedará habilitado al configurar Gmail.';\n   res.redirect('/superadmin/dashboard?msg='+encodeURIComponent(`Cuenta aprobada para ${est.name}. PIN generado: ${generatedPin}.${suffix}`));",
  "const expiry=est.expires_at?new Date(est.expires_at).toLocaleDateString('es-CL'):'—';\n   const suffix=mail.sent?' Correo de activación enviado.':` Correo no enviado: ${mail.reason}. Copie el PIN y entréguelo al establecimiento.`;\n   res.redirect('/superadmin/dashboard?msg='+encodeURIComponent(`Cuenta aprobada para ${est.name}. PIN: ${generatedPin}. Vigencia hasta: ${expiry}.${suffix}`));",
  'mensaje de aprobación'
);

mustReplace(
  "app.post('/superadmin/reject/:id',requireSuper,async(req,res)=>{await rejectRequest(req.params.id); res.redirect('/superadmin/dashboard?msg='+encodeURIComponent('Solicitud rechazada.'));});",
  "app.post('/superadmin/regenerate/:id',requireSuper,async(req,res)=>{\n try{\n   const {est,generatedPin}=await regenerateEstPin(req.params.id);\n   const mail=await sendActivation(est,generatedPin);\n   const expiry=est.expires_at?new Date(est.expires_at).toLocaleDateString('es-CL'):'—';\n   const suffix=mail.sent?' Correo enviado.':` Correo no enviado: ${mail.reason}.`;\n   res.redirect('/superadmin/dashboard?msg='+encodeURIComponent(`Nuevo PIN para ${est.name}: ${generatedPin}. Vigencia actual hasta: ${expiry}.${suffix}`));\n }catch(e){res.redirect('/superadmin/dashboard?err=1&msg='+encodeURIComponent(e.message));}\n});\napp.post('/superadmin/reject/:id',requireSuper,async(req,res)=>{await rejectRequest(req.params.id); res.redirect('/superadmin/dashboard?msg='+encodeURIComponent('Solicitud rechazada.'));});",
  'ruta regenerar PIN'
);

fs.writeFileSync(file, s);
console.log('MEC access patch v2 aplicado');
