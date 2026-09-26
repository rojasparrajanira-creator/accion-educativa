const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'server.js');
let s = fs.readFileSync(file, 'utf8');
if (s.includes('/* MEC_RUNTIME_PATCH_V4 */')) process.exit(0);

function mustReplace(from, to, label){
  if(!s.includes(from)) throw new Error(`No se pudo aplicar parche v4: ${label}`);
  s = s.replace(from, to);
}

// Render Free bloquea tráfico SMTP (25/465/587). Evitamos que la aprobación quede esperando
// un timeout largo: si Gmail no conecta, el panel vuelve en pocos segundos y conserva el PIN.
mustReplace(
  "const transporter = nodemailer.createTransport({service:'gmail', auth:{user:'accioneducativaspa@gmail.com', pass}});",
  "const transporter = nodemailer.createTransport({service:'gmail', auth:{user:'accioneducativaspa@gmail.com', pass}, connectionTimeout:4000, greetingTimeout:4000, socketTimeout:6000}); /* MEC_RUNTIME_PATCH_V4 */",
  'timeout corto de Gmail'
);

// Mejora visual al tocar Aprobar/Rechazar/Regenerar: evita doble toque y muestra progreso.
const oldClose = "</body></html>`;";
const newClose = `<script>(function(){document.addEventListener('submit',function(e){const f=e.target;if(!f||!f.matches('form'))return;const b=f.querySelector('button');if(!b)return;if(b.dataset.busy==='1'){e.preventDefault();return;}b.dataset.busy='1';b.disabled=true;const t=(b.textContent||'').trim();if(/Aprobar/i.test(t))b.textContent='Aprobando…';else if(/Regenerar/i.test(t))b.textContent='Generando…';else if(/Rechazar/i.test(t))b.textContent='Procesando…';});})();</script></body></html>`;`;
mustReplace(oldClose, newClose, 'estado visual botones');

fs.writeFileSync(file, s);
console.log('MEC runtime patch v4 aplicado');
