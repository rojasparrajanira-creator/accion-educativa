const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'server.js');
let s = fs.readFileSync(file, 'utf8');
if (s.includes('/* MEC_RUNTIME_PATCH_V3 */')) process.exit(0);

function mustReplace(from, to, label){
  if(!s.includes(from)) throw new Error(`No se pudo aplicar parche v3: ${label}`);
  s = s.replace(from, to);
}

mustReplace(
  "app.use(cookieParser());",
  "app.use(cookieParser());\napp.set('trust proxy', 1); // Render usa proxy inverso\n/* MEC_RUNTIME_PATCH_V3 */",
  'trust proxy'
);

mustReplace(
  "const pass = process.env.GMAIL_APP_PASSWORD;",
  "const pass = String(process.env.GMAIL_APP_PASSWORD || '').replace(/\\s+/g,'');",
  'normalización contraseña Gmail'
);

// Si Gmail rechaza el envío, la cuenta sigue activa y el panel muestra el motivo.
const sendLine = "const {est,generatedPin}=await approveRequest(req.params.id); const mail=await sendActivation(est,generatedPin);";
mustReplace(
  sendLine,
  "const {est,generatedPin}=await approveRequest(req.params.id); let mail; try{ mail=await sendActivation(est,generatedPin); }catch(mailErr){ console.error('IDPS_MAIL_ERROR_APPROVE', mailErr && mailErr.message ? mailErr.message : mailErr); mail={sent:false,reason:(mailErr&&mailErr.message)||'Error de envío'}; }",
  'manejo de correo en aprobación'
);

const regenLine = "const {est,generatedPin}=await regenerateEstPin(req.params.id);\n   const mail=await sendActivation(est,generatedPin);";
mustReplace(
  regenLine,
  "const {est,generatedPin}=await regenerateEstPin(req.params.id);\n   let mail; try{ mail=await sendActivation(est,generatedPin); }catch(mailErr){ console.error('IDPS_MAIL_ERROR_REGENERATE', mailErr && mailErr.message ? mailErr.message : mailErr); mail={sent:false,reason:(mailErr&&mailErr.message)||'Error de envío'}; }",
  'manejo de correo en regeneración'
);

// Evita que una solicitud ya aprobada pueda quedar posteriormente marcada como rechazada por doble toque/página antigua.
mustReplace(
  "app.post('/superadmin/reject/:id',requireSuper,async(req,res)=>{await rejectRequest(req.params.id); res.redirect('/superadmin/dashboard?msg='+encodeURIComponent('Solicitud rechazada.'));});",
  "app.post('/superadmin/reject/:id',requireSuper,async(req,res)=>{ try{ const r=await findRequest(req.params.id); if(!r) throw new Error('Solicitud no encontrada.'); if(r.status!=='pending') return res.redirect('/superadmin/dashboard?err=1&msg='+encodeURIComponent('La solicitud ya fue revisada y no puede cambiarse a rechazada.')); await rejectRequest(req.params.id); res.redirect('/superadmin/dashboard?msg='+encodeURIComponent('Solicitud rechazada.')); }catch(e){ res.redirect('/superadmin/dashboard?err=1&msg='+encodeURIComponent(e.message)); } });",
  'protección de estado solicitud'
);

fs.writeFileSync(file, s);
console.log('MEC runtime patch v3 aplicado');
