const express = require('express');
const nodemailer = require('nodemailer');

const emblem = `
<svg class="mec-emblem" viewBox="0 0 64 64" role="img" aria-label="Identidad Material Educativo Chile" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="30" fill="#0F2D52" stroke="#1E7FBC" stroke-width="2"/>
  <path d="M24 18c0-5 3.8-9 8.5-9s8.5 4 8.5 9c0 3-1.4 5.6-3.7 7.4-1.2.9-1.8 2.2-1.8 3.6v1.2h-6V29c0-1.4-.6-2.7-1.8-3.6C25.4 23.6 24 21 24 18Z" fill="#FFD200" stroke="#FFFFFF" stroke-width="1.7"/>
  <path d="M29.5 18.5c1.3-2 4.9-2 6.2 0M30.2 21.2c1.2 1.5 3.4 1.5 4.6 0" fill="none" stroke="#0F2D52" stroke-width="1.4" stroke-linecap="round"/>
  <rect x="28.7" y="30.1" width="7.6" height="5" rx="2" fill="#FFFFFF"/>
  <rect x="39" y="25" width="11" height="15" rx="1.8" fill="#1E7FBC" stroke="#FFFFFF" stroke-width="1.6"/>
  <path d="M40.7 36.8h7.6" stroke="#E6E8EB" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M46.5 14.5 56 10.8l-3.5 9.8-2.2-3.1-3.8-3Z" fill="#19C2D1" stroke="#FFFFFF" stroke-width="1" stroke-linejoin="round"/>
  <path d="M11 36c7.2 4.8 14.5 5.4 21.5 2" fill="none" stroke="#19C2D1" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="3.5 3.5"/>
  <text x="32" y="52" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="9.8" fill="#FFFFFF">MEC</text>
</svg>`;

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="31" fill="#0F2D52"/><circle cx="32" cy="21" r="10" fill="#FFD200"/><rect x="25" y="31" width="14" height="8" rx="3" fill="#fff"/><text x="32" y="54" text-anchor="middle" font-family="Arial" font-weight="800" font-size="13" fill="#19C2D1">MEC</text></svg>`;
const favicon = 'data:image/svg+xml,' + encodeURIComponent(faviconSvg);

const brandCss = `
.brand-lockup{display:flex;align-items:center;gap:12px;min-width:0;max-width:100%}
.mec-emblem{width:58px;height:58px;flex:0 0 58px;display:block;filter:drop-shadow(0 2px 5px rgba(0,0,0,.12))}
.brand-copy{min-width:0}.brand-copy b{display:block;line-height:1.12;color:#fff}.brand-copy small{display:block;margin-top:3px;line-height:1.25;color:#dbeaf7}
.mec-footer{margin-top:34px;padding:20px 16px;background:#0F2D52;color:#fff;text-align:center;border-radius:18px 18px 0 0;border-top:4px solid #19C2D1}
.mec-footer-inner{display:flex;align-items:center;justify-content:center;gap:11px;flex-wrap:wrap}.mec-footer .mec-emblem{width:46px;height:46px;flex-basis:46px}
.mec-footer strong{display:block}.mec-footer span{display:block;font-size:11px;color:#19C2D1;margin-top:3px;letter-spacing:.08em;font-weight:700}
.mec-signature{display:inline-flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;color:#E6E8EB}.mec-dot{width:7px;height:7px;border-radius:50%;background:#FFD200;box-shadow:11px 0 0 #19C2D1,22px 0 0 #1E7FBC;margin-right:22px}
.field input,.field select,input,select{font-size:16px!important}
@media(max-width:780px){header{padding:14px 16px!important}.brand{display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:space-between!important;width:100%;gap:10px!important}.brand-lockup{align-items:center;gap:10px;min-width:0;flex:1}.mec-emblem{width:48px;height:48px;flex-basis:48px}.brand-copy b{font-size:16px;white-space:normal}.brand-copy small{font-size:11px;white-space:normal}.topnav{flex:0 0 auto}.topnav a{margin-left:8px!important;font-size:13px}.mec-footer{margin-top:24px;border-radius:14px 14px 0 0}}
`;

function injectBranding(html) {
  if (typeof html !== 'string' || !/<html[\s>]/i.test(html)) return html;
  if (!html.includes('data-mec-branding="2"')) {
    html = html.replace('</head>', `<link rel="icon" href="${favicon}"><style data-mec-branding="2">${brandCss}</style></head>`);
  }
  const oldBrand = '<div><b>Material Educativo Chile</b><br><small>Diagnóstico IDPS · Gestión de establecimientos</small></div>';
  const newBrand = `<div class="brand-lockup">${emblem}<div class="brand-copy"><b>Material Educativo Chile</b><small>Diagnóstico IDPS · Gestión de establecimientos</small></div></div>`;
  html = html.replace(oldBrand, newBrand);
  if (!html.includes('class="mec-footer"')) {
    html = html.replace('</body>', `<footer class="mec-footer"><div class="mec-footer-inner">${emblem}<div><strong>Material Educativo Chile</strong><span>APRENDER · INCLUIR · TRANSFORMAR</span><div class="mec-signature"><span class="mec-dot"></span>Diagnóstico IDPS</div></div></div></footer></body>`);
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
    if (mail && typeof mail.html === 'string' && !mail.__mecBranding) {
      mail.html = `<div style="font-family:Arial,sans-serif;text-align:center;padding:18px 0 12px"><div style="width:70px;height:70px;border-radius:50%;background:#0F2D52;color:#fff;display:flex;align-items:center;justify-content:center;margin:0 auto 10px;border:3px solid #19C2D1;font-size:22px;font-weight:800">MEC</div><div style="font-weight:700;color:#0F2D52;font-size:18px">Material Educativo Chile</div><div style="color:#19C2D1;font-size:12px;letter-spacing:.08em;margin-top:3px;font-weight:700">APRENDER · INCLUIR · TRANSFORMAR</div></div>${mail.html}`;
      mail.__mecBranding = true;
    }
    return originalSendMail(mail, ...rest);
  };
  return transport;
};
