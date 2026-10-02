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
body{background:linear-gradient(180deg,#F7FAFC 0%,#EEF4F8 100%)!important;color:#17324d!important}
header{background:linear-gradient(135deg,#0F2D52 0%,#163C68 100%)!important;border-bottom:3px solid #19C2D1!important;box-shadow:0 8px 28px rgba(15,45,82,.14)!important;position:sticky;top:0;z-index:30}
.wrap{max-width:1220px!important}
.brand{min-height:68px!important;align-items:center!important}.brand-lockup{display:flex;align-items:center;gap:13px;min-width:0;max-width:100%}
.brand-logo{width:54px;height:54px;flex:0 0 54px;border-radius:50%;object-fit:cover;display:block;background:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.16)}
.brand-copy{min-width:0}.brand-copy b{display:block;color:#fff;font-size:18px;line-height:1.08;letter-spacing:-.015em}.brand-copy small{display:block;color:#C6EDF1;font-size:10.5px;margin-top:4px;line-height:1.25}.brand-kicker{display:inline-block;margin-top:4px;color:#FFD200;font-size:8.5px;font-weight:850;letter-spacing:.15em;text-transform:uppercase}
.topnav{display:flex!important;align-items:center;gap:6px!important;flex-wrap:wrap}.topnav a{color:#fff!important;text-decoration:none!important;margin-left:0!important;padding:8px 11px!important;border-radius:10px!important;font-weight:750!important;font-size:13px!important;transition:background .15s ease,transform .15s ease}.topnav a:hover{background:rgba(255,255,255,.11)!important;transform:translateY(-1px)}
main{padding-top:34px!important;padding-bottom:54px!important}
.grid{gap:18px!important}.card{position:relative;background:#fff!important;border:1px solid #DCE5EC!important;border-radius:16px!important;padding:22px!important;box-shadow:0 10px 28px rgba(15,45,82,.065)!important;transition:box-shadow .18s ease,transform .18s ease,border-color .18s ease}.card:hover{box-shadow:0 14px 34px rgba(15,45,82,.09)!important;border-color:#C7D8E6!important}
h1,h2,h3{letter-spacing:-.025em!important}h1{font-size:clamp(25px,3vw,34px)!important;line-height:1.12!important;margin-bottom:8px!important}h2{font-size:20px!important}h3{font-size:16px!important}
h1:after{content:'';display:block;width:42px;height:3px;border-radius:999px;background:#FFD200;margin-top:10px}
.muted{color:#6B7E90!important;line-height:1.55!important}
.kpi{font-size:34px!important;font-weight:900!important;letter-spacing:-.04em!important;color:#0F2D52!important;line-height:1!important;margin-bottom:7px}
.card>.kpi+ b{display:block;font-size:14px;color:#17324d;margin-bottom:5px}
.btn{border-radius:10px!important;min-height:42px!important;padding:10px 15px!important;transition:transform .15s ease,box-shadow .15s ease,background .15s ease!important;font-weight:800!important}.btn:hover{transform:translateY(-1px)}.btn:active{transform:translateY(0)}
.primary{background:#19C2D1!important;color:#0F2D52!important;box-shadow:0 7px 18px rgba(25,194,209,.20)!important}.primary:hover{background:#16B3C1!important}.secondary{background:#fff!important;color:#0F2D52!important;border:1px solid #1E7FBC!important}.dark{background:#0F2D52!important;color:#fff!important}.warn{background:#FFD200!important;color:#0F2D52!important}.danger{background:#fff!important;color:#B42318!important;border:1px solid #EAB2AD!important}.success{background:#198754!important;color:#fff!important}
.field{margin:13px 0!important}.field label{font-size:12.5px!important;color:#29465F!important}.field input,.field select,input,select,textarea{font-size:15px!important;border-radius:9px!important;border:1px solid #C8D5DF!important;min-height:43px!important;background:#fff!important;box-shadow:inset 0 1px 0 rgba(15,45,82,.02)!important;transition:border-color .15s ease,box-shadow .15s ease!important}.field input:focus,.field select:focus,input:focus,select:focus,textarea:focus{outline:none!important;border-color:#19C2D1!important;box-shadow:0 0 0 3px rgba(25,194,209,.13)!important}
table{background:#fff!important;border:1px solid #E2E9EF!important;border-radius:12px!important;overflow:hidden!important}th{background:#F1F6FA!important;color:#496175!important;font-size:11px!important;text-transform:uppercase!important;letter-spacing:.035em!important;font-weight:850!important}th,td{padding:11px 12px!important;border-bottom:1px solid #E5EBF0!important}tbody tr:nth-child(even){background:#FAFCFD!important}tbody tr:hover{background:#F3F9FB!important}
.badge,.tag{border-radius:999px!important;padding:5px 9px!important;font-weight:800!important}
.notice{border-radius:10px!important}.actions{gap:9px!important}
.mobile-item{border:1px solid #DCE5EC!important;border-radius:14px!important;box-shadow:0 7px 18px rgba(15,45,82,.05)!important}
.mec-footer{margin-top:44px;padding:24px 18px;background:#0F2D52;color:#fff;text-align:center;border-top:3px solid #19C2D1}.mec-footer-inner{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap}.mec-footer img{width:46px;height:46px;border-radius:50%;object-fit:cover;background:#fff}.mec-footer strong{display:block;font-size:14px}.mec-footer span{display:block;font-size:9.5px;color:#19C2D1;margin-top:4px;letter-spacing:.12em;font-weight:850}
.report-brand{display:flex!important;align-items:center!important;gap:10px!important}.report-brand .brand-logo{width:44px!important;height:44px!important;flex-basis:44px!important}.report-brand span{font-weight:900!important;color:#fff!important}
body:has(form[action="/login"]) main{display:flex!important;align-items:center!important;min-height:calc(100vh - 170px)!important}body:has(form[action="/login"]) main>.wrap{width:100%!important}body:has(form[action="/login"]) .grid{align-items:stretch!important}body:has(form[action="/login"]) .col6.card{min-height:360px!important;display:flex!important;flex-direction:column!important;justify-content:center!important}body:has(form[action="/login"]) .col6.card:first-of-type{border-top:4px solid #19C2D1!important}body:has(form[action="/login"]) .col6.card:last-of-type{background:linear-gradient(145deg,#F9FCFE 0%,#EEF7FA 100%)!important;border-top:4px solid #FFD200!important}
@media(max-width:780px){header{position:relative!important;padding:12px 14px!important}.brand{display:flex!important;flex-direction:column!important;align-items:flex-start!important;width:100%!important;gap:10px!important}.brand-lockup{gap:9px}.brand-logo{width:46px;height:46px;flex-basis:46px}.brand-copy b{font-size:15px}.brand-copy small{font-size:9.5px}.brand-kicker{font-size:7.8px;letter-spacing:.1em}.topnav{width:100%!important;overflow-x:auto!important;flex-wrap:nowrap!important;padding-bottom:2px}.topnav a{font-size:12px!important;padding:7px 9px!important;white-space:nowrap!important}.card{padding:18px!important;border-radius:14px!important}.grid{gap:14px!important}h1{font-size:26px!important}.mec-footer{margin-top:28px;padding:20px 14px}body:has(form[action="/login"]) main{min-height:auto!important;display:block!important}body:has(form[action="/login"]) .col6.card{min-height:0!important}}

/* Layout aprobado: acceso dividido + panel visual */
.login-shell{display:grid;grid-template-columns:minmax(0,1fr) minmax(380px,.9fr);max-width:1040px;margin:14px auto 0;background:#fff;border:1px solid #DCE5EC;border-radius:24px;overflow:hidden;box-shadow:0 24px 70px rgba(15,45,82,.13)}
.login-form-panel{padding:54px 58px 44px;background:#fff;position:relative}.login-form-panel h1{font-size:36px!important;max-width:520px}.login-kicker,.eyebrow{font-size:10px;font-weight:900;letter-spacing:.14em;color:#1E7FBC;text-transform:uppercase}.login-lead{max-width:520px;font-size:14px}.login-form-panel form{max-width:470px;margin-top:28px}.login-main-btn{width:100%;margin-top:8px;font-size:15px}.login-links{display:flex;align-items:center;gap:9px;justify-content:center;margin-top:18px;font-size:12px}.login-links a{color:#1E7FBC;font-weight:750;text-decoration:none}.login-note{margin-top:34px;padding:14px 16px;border-radius:12px;background:#F1F7FB;color:#0F2D52;font-size:12px}.login-note span{color:#19A8B5;font-weight:850;font-size:9px;letter-spacing:.08em}
.login-visual-panel{min-height:530px;position:relative;overflow:hidden;background:linear-gradient(145deg,#0F2D52 0%,#174F80 55%,#19AFC1 100%);display:flex;align-items:flex-end;padding:48px}.login-visual-panel:before{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent 0%,rgba(15,45,82,.12) 55%,rgba(15,45,82,.52) 100%)}.visual-orb{position:absolute;border-radius:50%}.visual-orb-a{width:310px;height:310px;right:-90px;top:-70px;background:rgba(255,210,0,.94)}.visual-orb-b{width:380px;height:380px;left:-170px;bottom:-170px;background:rgba(25,194,209,.45);border:55px solid rgba(255,255,255,.09)}.visual-content{position:relative;z-index:2;color:#fff;max-width:480px}.visual-badge{display:inline-block;padding:6px 10px;background:rgba(255,255,255,.13);border:1px solid rgba(255,255,255,.22);border-radius:999px;font-size:9px;font-weight:900;letter-spacing:.13em}.visual-content h2{color:#fff!important;font-size:34px!important;line-height:1.08;margin:17px 0 10px}.visual-content p{color:#D7ECF5;line-height:1.55;font-size:14px}.visual-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:28px}.visual-stats div{padding:12px 10px;border-radius:12px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.14)}.visual-stats strong{display:block;font-size:19px;color:#fff}.visual-stats span{display:block;font-size:9px;color:#D4EEF3;margin-top:3px}
.dashboard-shell{display:block}.dashboard-hero{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding:26px 28px;background:#fff;border:1px solid #DCE5EC;border-radius:18px;box-shadow:0 10px 28px rgba(15,45,82,.06);margin-bottom:18px}.dashboard-hero h1{font-size:29px!important;margin:7px 0}.dashboard-hero p{max-width:650px;margin:0;color:#65798A;line-height:1.5}.school-chip{display:flex;align-items:center;gap:12px;background:#F1F6FA;border:1px solid #DCE5EC;border-radius:14px;padding:14px 16px;min-width:260px}.school-chip-icon{width:42px;height:42px;border-radius:11px;display:grid;place-items:center;background:#1E7FBC;color:#fff;font-size:22px}.school-chip b,.school-chip span{display:block}.school-chip b{font-size:13px;color:#0F2D52;margin-bottom:3px}.school-chip span{font-size:10px;color:#6B7E90;line-height:1.4}
.dashboard-kpis{margin-bottom:18px}.kpi-card{min-height:130px!important}.kpi-card:nth-child(1){border-top:4px solid #19C2D1!important}.kpi-card:nth-child(2){border-top:4px solid #1E7FBC!important}.kpi-card:nth-child(3){border-top:4px solid #FFD200!important}
.quick-section{background:#fff;border:1px solid #DCE5EC;border-radius:18px;padding:26px;box-shadow:0 10px 28px rgba(15,45,82,.06)}.section-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:18px}.section-heading h2{margin:5px 0 0}.section-heading p{margin:0;color:#6B7E90;font-size:12px;max-width:420px;text-align:right}.quick-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.quick-card{display:grid;grid-template-columns:48px 1fr 24px;gap:12px;align-items:center;min-height:112px;padding:16px;border:1px solid #DCE5EC;border-radius:14px;text-decoration:none;background:#fff;color:#17324d;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}.quick-card:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(15,45,82,.09);border-color:#BFD2E1}.quick-icon{width:46px;height:46px;border-radius:12px;display:grid;place-items:center;font-size:22px;background:#EDF5FA;color:#0F2D52}.quick-card b{display:block;font-size:13px;color:#0F2D52;margin-bottom:5px}.quick-card small{display:block;font-size:10.5px;line-height:1.4;color:#6B7E90}.quick-arrow{font-size:25px;color:#1E7FBC;text-align:right}.qc-turq .quick-icon{background:#DFF8FA;color:#087E89}.qc-blue .quick-icon{background:#E6F1FB;color:#1E7FBC}.qc-yellow .quick-icon{background:#FFF6CF;color:#9A7600}.qc-navy .quick-icon{background:#E8EEF5;color:#0F2D52}
.dashboard-banner{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-top:18px;padding:24px 28px;border-radius:18px;background:linear-gradient(115deg,#F1F8FB 0%,#FFFFFF 55%,#E7F7F9 100%);border:1px solid #D8E6EE}.dashboard-banner h2{font-size:20px!important;margin:5px 0 6px}.dashboard-banner p{margin:0;color:#687C8C;max-width:720px;font-size:12px}.banner-mark{width:90px;height:90px;border-radius:50%;display:grid;place-items:center;flex:0 0 90px;background:#0F2D52;color:#FFD200;font-size:20px;font-weight:950;box-shadow:inset 0 0 0 7px #19C2D1}.legacy-controls{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important}
@media(max-width:980px){.login-shell{grid-template-columns:1fr}.login-visual-panel{min-height:340px}.quick-grid{grid-template-columns:1fr 1fr}.dashboard-hero{flex-direction:column}.school-chip{width:100%;min-width:0}.section-heading{align-items:flex-start;flex-direction:column}.section-heading p{text-align:left}}
@media(max-width:620px){.login-form-panel{padding:32px 22px 28px}.login-form-panel h1{font-size:29px!important}.login-visual-panel{min-height:300px;padding:28px 22px}.visual-content h2{font-size:27px!important}.visual-stats{grid-template-columns:1fr}.quick-grid{grid-template-columns:1fr}.dashboard-hero,.quick-section,.dashboard-banner{padding:20px}.dashboard-banner{align-items:flex-start}.banner-mark{width:64px;height:64px;flex-basis:64px;font-size:15px}}
`;

function injectBranding(html) {
  if (typeof html !== 'string' || !/<html[\s>]/i.test(html)) return html;
  if (!html.includes('data-mec-branding="3"')) {
    const favicon = logoData ? `<link rel="icon" type="image/jpeg" href="${logoData}">` : '';
    html = html.replace('</head>', `${favicon}<style data-mec-branding="3">${brandCss}</style></head>`);
  }

  const logo = logoData ? `<img class="brand-logo" src="${logoData}" alt="Material Educativo Chile">` : '';
  const newBrand = `<div class="brand-lockup">${logo}<div class="brand-copy"><b>Material Educativo Chile</b><small>Plataforma IDPS · Desarrollo Personal y Social</small><span class="brand-kicker">APRENDER · INCLUIR · TRANSFORMAR</span></div></div>`;
  html = html.replace(/<div><b>Material Educativo Chile<\/b><br><small>(?:Diagnóstico IDPS|Plataforma IDPS)[^<]*<\/small><\/div>/i, newBrand);

  // Navegación visual consistente en páginas internas; no modifica rutas ni acciones.
  html = html.replace(
    /<div class="topnav"><a href="\/panel">Panel<\/a><a href="\/logout">Cerrar sesión<\/a><\/div>/i,
    '<div class="topnav"><a href="/panel">Inicio</a><a href="/panel/estudiantes">Nómina</a><a href="/panel/aplicacion">Aplicación</a><a href="/panel/resultados">Resultados</a><a href="/logout">Cerrar sesión</a></div>'
  );

  // Membrete institucional: usa siempre el logo oficial también en informes.
  if (logoData) {
    html = html.replace(/<div class="brand">MATERIAL EDUCATIVO CHILE<\/div>/i, '<div class="brand report-brand"><img class="brand-logo" src="'+logoData+'" alt="Material Educativo Chile"><span>Material Educativo Chile</span></div>');
  }

  // Fuerza el botón Gmail al host correcto del portal de gestión para evitar
  // problemas por pestañas antiguas, rutas relativas o enlaces cacheados.
  html = html.replace(
    'href="/auth/google">Conectar Gmail</a>',
    'href="https://idps-gestion-material-educativo.onrender.com/auth/google">Conectar Gmail</a>'
  );

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
