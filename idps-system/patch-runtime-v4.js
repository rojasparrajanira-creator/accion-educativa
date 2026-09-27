const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'server.js');
let s = fs.readFileSync(file, 'utf8');
if (s.includes('/* MEC_RUNTIME_PATCH_V4 */')) process.exit(0);

function mustReplace(from, to, label){
  if(!s.includes(from)) throw new Error(`No se pudo aplicar parche v4: ${label}`);
  s = s.replace(from, to);
}

mustReplace(
  "async function sendActivation(est,pin){\n  const pass = process.env.GMAIL_APP_PASSWORD;\n  if(!pass) return {sent:false, reason:'GMAIL_APP_PASSWORD pendiente'};\n  const transporter = nodemailer.createTransport({service:'gmail', auth:{user:'accioneducativaspa@gmail.com', pass}});\n  await transporter.sendMail({\n    from:'Acción Educativa SPA <accioneducativaspa@gmail.com>', to:est.email,\n    subject:'Cuenta activada · Diagnóstico IDPS Material Educativo Chile',\n    html:`<div style=\\"font-family:Arial,sans-serif;color:#0F2D52\\"><h2>Cuenta activada</h2><p>Estimado/a ${est.contact_name||'responsable'}:</p><p>La cuenta de <b>${est.name}</b> ha sido aprobada.</p><p><b>RBD:</b> ${est.rbd}<br><b>PIN de acceso:</b> ${pin}</p><p>Acceso: <a href=\\"${process.env.PUBLIC_URL||''}\\">${process.env.PUBLIC_URL||'Plataforma Diagnóstico IDPS'}</a></p><p>Por seguridad, conserve este PIN solo para el equipo autorizado.</p><p>Saludos cordiales,<br><b>Acción Educativa SPA</b></p></div>`\n  });\n  return {sent:true};\n}",
  `async function sendActivation(est,pin){
  const subject='Cuenta activada · Diagnóstico IDPS Material Educativo Chile';
  const accessUrl=process.env.PUBLIC_URL||'https://idps-gestion-material-educativo.onrender.com';
  const html=\`<div style="font-family:Arial,sans-serif;color:#0F2D52"><h2>Cuenta activada</h2><p>Estimado/a \${est.contact_name||'responsable'}:</p><p>La cuenta de <b>\${est.name}</b> ha sido aprobada.</p><p><b>RBD:</b> \${est.rbd}<br><b>PIN de acceso:</b> \${pin}<br><b>Vigencia:</b> hasta \${new Date(est.expires_at).toLocaleDateString('es-CL')}</p><p>Acceso: <a href="\${accessUrl}">\${accessUrl}</a></p><p>Por seguridad, conserve este PIN solo para el equipo autorizado.</p><p>Saludos cordiales,<br><b>Acción Educativa SPA</b></p></div>\`;
  const apiKey=(process.env.RESEND_API_KEY||'').trim();
  if(apiKey){
    const response=await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{'Authorization':\`Bearer \${apiKey}\`,'Content-Type':'application/json'},
      body:JSON.stringify({
        from:process.env.RESEND_FROM||'Acción Educativa SPA <onboarding@resend.dev>',
        to:[est.email], subject, html
      })
    });
    const body=await response.text();
    if(!response.ok){ const e=new Error(\`Resend HTTP \${response.status}: \${body.slice(0,240)}\`); e.code='RESEND_SEND_FAILED'; throw e; }
    return {sent:true, provider:'resend'};
  }
  const pass=(process.env.GMAIL_APP_PASSWORD||'').replace(/\\s+/g,'');
  if(!pass) return {sent:false, reason:'RESEND_API_KEY/GMAIL_APP_PASSWORD pendiente'};
  const transporter=nodemailer.createTransport({service:'gmail',auth:{user:'accioneducativaspa@gmail.com',pass},connectionTimeout:4000,greetingTimeout:4000,socketTimeout:6000});
  await transporter.sendMail({from:'Acción Educativa SPA <accioneducativaspa@gmail.com>',to:est.email,subject,html});
  return {sent:true,provider:'gmail'};
} /* MEC_RUNTIME_PATCH_V4 */`,
  'correo Resend con respaldo Gmail'
);

fs.writeFileSync(file, s);
console.log('MEC runtime patch v4 aplicado (Resend HTTPS)');
