const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'server.js');
let s = fs.readFileSync(file, 'utf8');
if (s.includes('/* MEC_RUNTIME_PATCH_V4 */')) process.exit(0);

function mustReplace(from, to, label){
  if(!s.includes(from)) throw new Error(`No se pudo aplicar parche v4: ${label}`);
  s = s.replace(from, to);
}

// Render Free bloquea tráfico SMTP (25/465/587). Reducimos el tiempo de espera para que
// aprobar o regenerar PIN nunca deje el panel aparentemente cargando por largo tiempo.
mustReplace(
  "const transporter = nodemailer.createTransport({service:'gmail', auth:{user:'accioneducativaspa@gmail.com', pass}});",
  "const transporter = nodemailer.createTransport({service:'gmail', auth:{user:'accioneducativaspa@gmail.com', pass}, connectionTimeout:4000, greetingTimeout:4000, socketTimeout:6000}); /* MEC_RUNTIME_PATCH_V4 */",
  'timeout corto de Gmail'
);

fs.writeFileSync(file, s);
console.log('MEC runtime patch v4 aplicado');
