const fs = require('fs');
const path = require('path');
const express = require('express');
const nodemailer = require('nodemailer');

let logoBuffer = null;
let logoData = '';
try {
  logoBuffer = fs.readFileSync(path.join(__dirname, 'logo-oficial.jpg'));
  logoData = `data:image/jpeg;base64,${logoBuffer.toString('base64')}`;
} catch (e) {
  console.warn('Branding: logo-oficial.jpg no disponible');
}

const brandCss = `
body{background:linear-gradient(180deg,#f7f9fc 0%,#eef4f8 100%)!important}
header{background:linear-gradient(135deg,#0F2D52 0%,#143d69 100%)!important;border-bottom:3px solid #19C2D1;box-shadow:0 10px 30px rgba(15,45,82,.12)}
.brand{min-height:72px}.brand-lockup{display:flex;align-items:center;gap:14px;min-width:0;max-width:100%}
.brand-logo{width:62px;height:62px;flex:0 0 62px;border-radius:50%;object-fit:cover;display:block;background:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.18),0 8px 20px rgba(0,0,0,.18)}
.brand-copy{min-width:0}.brand-copy b{display:block;color:#fff;font-size:19px;line-height:1.05;letter-spacing:-.01em}.brand-copy small{display:block;color:#cfe8f2;font-size:11px;margin-top:5px;line-height:1.25}.brand-kicker{display:inline-block;margin-top:5px;color:#FFD200;font-size:9px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
.topnav a{color:#fff!important;text-decoration:none!important;margin-left:8px!important;padding:8px 11px;border-radius:10px;font-weight:700!important}.topnav a:hover{background:rgba(255,255,255,.10)}
main{padding-top:38px!important}.card{border:1px solid #dce5ec!important;border-radius:18px!important;box-shadow:0 14px 38px rgba(15,45,82,.08)!important}.card h1,.card h2,.card h3{letter-spacing:-.02em}
h1:after{content:'';display:block;width:44px;height:3px;border-radius:999px;background:#FFD200;margin-top:10px}
.btn{border-radius:12px!important;min-height:44px;transition:transform .15s ease,box-shadow .15s ease}.btn:hover{transform:translateY(-1px)}
.primary{background:#19C2D1!important;color:#0F2D52!important;box-shadow:0 8px 20px rgba(25,194,209,.22)}
.secondary{background:#fff!important;color:#0F2D52!important;border:1px solid #1E7FBC!important}.warn{background:#FFD200!important;color:#0F2D52!important}
.field input,.field select,input,select{font-size:16px!important;border-radius:10px!important;border-color:#cbd8e3!important;min-height:44px}.field input:focus,.field select:focus,input:focus,select:focus{outline:2px solid rgba(25,194,209,.25);border-color:#19C2D1!important}
.mec-footer{margin-top:42px;padding:26px 18px;background:#0F2D52;color:#fff;text-align:center;border-top:3px solid #19C2D1}.mec-footer-inner{display:flex;align-items:center;justify-content:center;gap:13px;flex-wrap:wrap}.mec-footer img{width:50px;height:50px;border-radius:50%;object-fit:cover;background:#fff}.mec-footer strong{display:block;font-size:14px}.mec-footer span{display:block;font-size:10px;color:#19C2D1;margin-top:4px;letter-spacing:.12em;font-weight:800}
@media(max-width:780px){header{padding:13px 15px!important}.brand{display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:space-between!important;width:100%;gap:8px!important}.brand-lockup{gap:9px;flex:1}.brand-logo{width:46px;height:46px;flex-basis:46px}.brand-copy b{font-size:15px}.brand-copy small{font-size:10px}.brand-kicker{font-size:8px;letter-spacing:.1em}.topnav{flex:0 0 auto}.topnav a{font-size:12px;padding:7px 8px!important}.mec-footer{margin-top:28px;padding:22px 14px}}
`;

function injectBranding(html) {
  if (typeof html !== 'string' || !/<html[\s>]/i.test(html)) return html;
  if (!html.includes('data-mec-branding="3"')) {
    const favicon = logoData ? `<link rel="icon" type="image/jpeg" href="${logoData}">` : '';
    html = html.replace('</head>', `${favicon}<style data-mec-branding="3">${brandCss}</style></head>`);
  }

  const oldBrand = '<div><b>Material Educativo Chile</b><br><small>Diagnóstico IDPS · Gestión de establecimientos</small></div>';
  const logo = logoData ? `<img class="brand-logo" src="${logoData}" alt="Material Educativo Chile">` : '';
  const newBrand = `<div class="brand-lockup">${logo}<div class="brand-copy"><b>Material Educativo Chile</b><small>Diagnóstico IDPS · Gestión de establecimientos</small><span class="brand-kicker">Plataforma institucional</span></div></div>`;
  html = html.replace(oldBrand, newBrand);

  if (!html.includes('class="mec-footer"')) {
    const footerLogo = logoData ? `<img src="${logoData}" alt="Material Educativo Chile">` : '';
    html = html.replace('</body>', `<footer class="mec-footer"><div class="mec-footer-inner">${footerLogo}<div><strong>Material Educativo Chile</strong><span>APRENDER · INCLUIR · TRANSFORMAR</span></div></div></footer></body>`);
  }
  return html;
}

const originalSend = express.response.send;
express.response.send = function patchedSend(body) {
  if (typeof body === 'string') body = injectBranding(body);
  return originalSend.call(this, body);
};

const originalCreateTransport = nodemailer.createTransport.bind(nodemailer);
nodemailer.createTransport = function patchedCreateTransport(...args) {
  const transport = originalCreateTransport(...args);
  const originalSendMail = transport.sendMail.bind(transport);
  transport.sendMail = function brandedSendMail(mail, ...rest) {
    if (logoBuffer && mail && typeof mail.html === 'string' && !mail.__mecBranding) {
      mail.html = `<div style="font-family:Arial,sans-serif;text-align:center;padding:18px 0 12px"><img src="cid:mec-logo" width="88" height="88" style="width:88px;height:88px;border-radius:50%;display:block;margin:0 auto 10px" alt="Material Educativo Chile"><div style="font-weight:700;color:#0F2D52;font-size:18px">Material Educativo Chile</div><div style="color:#19C2D1;font-size:11px;letter-spacing:.10em;margin-top:4px;font-weight:700">APRENDER · INCLUIR · TRANSFORMAR</div></div>${mail.html}`;
      mail.attachments = [...(Array.isArray(mail.attachments) ? mail.attachments : []), { filename:'material-educativo-chile.jpg', content:logoBuffer, cid:'mec-logo' }];
      mail.__mecBranding = true;
    }
    return originalSendMail(mail, ...rest);
  };
  return transport;
};
