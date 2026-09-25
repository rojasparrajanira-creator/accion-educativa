const fs = require('fs');
const path = require('path');
const express = require('express');
const nodemailer = require('nodemailer');

let logoBase64 = '';
try {
  logoBase64 = fs.readFileSync(path.join(__dirname, 'logo-base64.txt'), 'utf8').trim();
  if (!logoBase64 || logoBase64.length % 4 !== 0) throw new Error('base64 invalido');
} catch (e) {
  console.warn('Branding: logo-base64.txt no disponible o invalido');
  logoBase64 = '';
}

const logoData = logoBase64 ? `data:image/jpeg;base64,${logoBase64}` : '';
const brandCss = `
.brand-lockup{display:flex;align-items:center;gap:14px;min-width:0}
.brand-logo{width:64px;height:64px;border-radius:50%;object-fit:cover;display:block;box-shadow:0 0 0 3px rgba(255,255,255,.20)}
.brand-copy{min-width:0}.brand-copy b{display:block;line-height:1.1}.brand-copy small{display:block;margin-top:3px}
.mec-footer{margin-top:34px;padding:24px 18px;background:#0F2D52;color:#fff;text-align:center;border-radius:18px 18px 0 0}
.mec-footer-inner{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap}
.mec-footer img{width:48px;height:48px;border-radius:50%;object-fit:cover}
.mec-footer strong{display:block}.mec-footer span{display:block;font-size:12px;color:#C6EDF1;margin-top:3px;letter-spacing:.04em}
@media(max-width:780px){.brand-lockup{align-items:flex-start}.brand-logo{width:56px;height:56px}.mec-footer{margin-top:24px}}
`;

function injectBranding(html) {
  if (!logoData || typeof html !== 'string' || !/<html[\s>]/i.test(html)) return html;
  if (!html.includes('data-mec-branding="1"')) {
    html = html.replace('</head>', `<link rel="icon" type="image/jpeg" href="${logoData}"><style data-mec-branding="1">${brandCss}</style></head>`);
  }
  const oldBrand = '<div><b>Material Educativo Chile</b><br><small>Diagnóstico IDPS · Gestión de establecimientos</small></div>';
  const newBrand = `<div class="brand-lockup"><img class="brand-logo" src="${logoData}" alt="Logo oficial Material Educativo Chile"><div class="brand-copy"><b>Material Educativo Chile</b><small>Diagnóstico IDPS · Gestión de establecimientos</small></div></div>`;
  html = html.replace(oldBrand, newBrand);
  if (!html.includes('class="mec-footer"')) {
    html = html.replace('</body>', `<footer class="mec-footer"><div class="mec-footer-inner"><img src="${logoData}" alt="Material Educativo Chile"><div><strong>Material Educativo Chile</strong><span>APRENDER · INCLUIR · TRANSFORMAR</span></div></div></footer></body>`);
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
    if (logoBase64 && mail && typeof mail.html === 'string' && !mail.__mecBranding) {
      mail.html = `<div style="font-family:Arial,sans-serif;text-align:center;padding:18px 0 12px"><img src="cid:mec-logo" width="88" height="88" style="width:88px;height:88px;border-radius:50%;display:block;margin:0 auto 10px" alt="Material Educativo Chile"><div style="font-weight:700;color:#0F2D52;font-size:18px">Material Educativo Chile</div><div style="color:#19C2D1;font-size:12px;letter-spacing:.08em;margin-top:3px">APRENDER · INCLUIR · TRANSFORMAR</div></div>${mail.html}`;
      mail.attachments = [...(Array.isArray(mail.attachments) ? mail.attachments : []), { filename: 'material-educativo-chile.jpg', content: Buffer.from(logoBase64, 'base64'), cid: 'mec-logo' }];
      mail.__mecBranding = true;
    }
    return originalSendMail(mail, ...rest);
  };
  return transport;
};
