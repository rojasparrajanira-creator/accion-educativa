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


// Imagen educativa proporcionada para el fondo EXCLUSIVO de la portada IDPS.
// Versión AVIF optimizada y almacenada como texto para no exponer ningún archivo privado.
let idpsHomeBackground = '';
try {
  const encoded = fs.readFileSync(path.join(__dirname, 'fondo-portada-idps.avif.base64'),'utf8').trim();
  if (/^[a-zA-Z0-9+/=]+$/.test(encoded) && encoded.length > 1000) {
    idpsHomeBackground = 'data:image/avif;base64,' + encoded;
  }
} catch (e) {
  console.warn('Branding: fondo-portada-idps no disponible; se conserva fondo previo');
}
const idpsHomeBackgroundCss = idpsHomeBackground ? `
body:has(form[action="/login"]) {
 background-image:linear-gradient(180deg,rgba(255,255,255,.05),rgba(245,253,255,.12)),url("${idpsHomeBackground}")!important;
 background-size:cover!important;
 background-position:center center!important;
 background-repeat:no-repeat!important;
 background-attachment:fixed!important;
}
body:has(form[action="/login"]) .home-intro {
 background:linear-gradient(90deg,rgba(255,255,255,.83) 0%,rgba(255,255,255,.71) 55%,rgba(255,255,255,.32) 100%)!important;
 border-bottom:1px solid rgba(255,255,255,.5)!important;
}
body:has(form[action="/login"]) .login-shell {
 box-shadow:0 18px 45px rgba(15,45,82,.14)!important;
}
body:has(form[action="/login"]) .home-action-card {
 background:rgba(255,255,255,.96)!important;
 backdrop-filter:blur(5px);
}
@media(max-width:760px){
 body:has(form[action="/login"]) {background-attachment:scroll!important;background-position:33% center!important;}
 body:has(form[action="/login"]) .home-intro {background:rgba(255,255,255,.86)!important;}
}
` : '';

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

/* Portada principal: jerarquía editorial, sin bloque amarillo/turquesa dominante */
body:has(form[action="/login"]) main{display:block!important;min-height:calc(100vh - 170px)!important;padding-top:0!important}
body:has(form[action="/login"]) main>.wrap{max-width:none!important;width:100%!important;padding:0!important}
.home-intro{background:#fff;border-bottom:1px solid #DCE5EC;padding:34px max(24px,calc((100vw - 1040px)/2)) 30px}
.home-kicker{display:block;color:#1E7FBC;font-size:10px;font-weight:900;letter-spacing:.16em;margin-bottom:8px}
.home-intro h1{font-family:Inter,Arial,sans-serif!important;font-size:clamp(42px,5vw,66px)!important;line-height:.98!important;letter-spacing:-.055em!important;margin:0!important;max-width:850px;color:#0F2D52!important;font-weight:900!important}
.home-intro h1:after{width:58px!important;height:4px!important;margin-top:16px!important}
.home-intro>p{font-size:15px;line-height:1.55;color:#5D7284;max-width:760px;margin:18px 0 0}
.home-points{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.home-points span{padding:8px 13px;border:1px solid rgba(0,99,221,.20);border-radius:999px;background:linear-gradient(100deg,#00E5E0 0%,#00B8FF 50%,#004DFF 100%);color:#FFFFFF;font-size:11px;font-weight:750;text-shadow:0 1px 3px rgba(0,33,78,.76);box-shadow:0 4px 13px rgba(0,99,221,.18)}.home-points b{color:#FFFFFF;font-weight:900;text-shadow:0 1px 3px rgba(0,33,78,.76)}
body:has(form[action="/login"]) .login-shell{grid-template-columns:minmax(0,1.35fr) minmax(270px,.65fr)!important;max-width:1040px!important;margin:28px auto 0!important;border-radius:18px!important;box-shadow:0 14px 38px rgba(15,45,82,.08)!important}
body:has(form[action="/login"]) .login-form-panel{padding:36px 42px!important}.login-form-panel h2{font-size:24px!important;margin-bottom:7px!important}
.login-side{position:relative;overflow:hidden;background:#0F2D52;padding:38px 32px;color:#fff;display:flex;flex-direction:column;justify-content:center}
.login-side:after{content:'';position:absolute;width:170px;height:170px;border-radius:50%;right:-90px;bottom:-90px;border:34px solid rgba(25,194,209,.22)}
.side-kicker{position:relative;z-index:1;font-size:9px;font-weight:900;letter-spacing:.15em;color:#19C2D1}.login-side h3{position:relative;z-index:1;color:#fff!important;font-size:27px!important;line-height:1.08;margin:10px 0 10px}.login-side p{position:relative;z-index:1;color:#C8DAE7;font-size:12px;line-height:1.55;margin:0}
body:has(form[action="/login"]) .mode{max-width:1040px;margin:18px auto 0;padding:0 2px}
@media(max-width:980px){body:has(form[action="/login"]) .login-shell{grid-template-columns:1fr!important;margin:22px 18px 0!important}.login-side{min-height:190px}.home-intro{padding:28px 24px 26px}}
@media(max-width:620px){.home-intro{padding:25px 20px 24px}.home-intro h1{font-size:43px!important;line-height:1!important}.home-intro>p{font-size:13px}.home-points{gap:7px}.home-points span{font-size:10px;padding:7px 9px}body:has(form[action="/login"]) .login-shell{margin:18px 14px 0!important}body:has(form[action="/login"]) .login-form-panel{padding:26px 22px!important}.login-side{padding:28px 22px;min-height:170px}.login-side h3{font-size:24px!important}body:has(form[action="/login"]) .mode{padding:0 16px}}


/* PORTADA IDPS · corrección editorial: blanco sin invasión gráfica.
   Texturas ÚNICAMENTE en el encabezado y en la tarjeta derecha de ingreso.
   No cambiar rutas, formularios, resultados ni instrumentos. */
header{
  position:relative!important;
  background:linear-gradient(100deg,#00E5E0 0%,#00B8FF 50%,#004DFF 100%)!important;
  color:#092E4F!important;
  border-bottom:0!important;
  box-shadow:0 7px 22px rgba(12,86,178,.16)!important;
  isolation:isolate;
}
header::before{
  content:"";
  position:absolute;
  inset:0;
  pointer-events:none;
  z-index:0;
  background-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221100%22%20height%3D%22420%22%20viewBox%3D%220%200%201100%20420%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M-80%20240C180%2075%20270%20140%20470%20215S770%20345%201180%20115%22%20stroke%3D%22white%22%20stroke-width%3D%224%22%20stroke-opacity%3D%22.52%22%2F%3E%3Cpath%20d%3D%22M-80%20282C145%20115%20295%20160%20465%20239S792%20365%201180%20158%22%20stroke%3D%22white%22%20stroke-width%3D%223%22%20stroke-opacity%3D%22.39%22%2F%3E%3Cpath%20d%3D%22M-80%20324C155%20154%20312%20200%20476%20270S830%20388%201180%20207%22%20stroke%3D%22white%22%20stroke-width%3D%223%22%20stroke-opacity%3D%22.32%22%2F%3E%3Cpath%20d%3D%22M-80%20188C120%2050%20276%2084%20460%20182S775%20302%201180%2076%22%20stroke%3D%22%23C8FFFF%22%20stroke-width%3D%224%22%20stroke-opacity%3D%22.62%22%2F%3E%3C%2Fsvg%3E");
  background-repeat:no-repeat;
  background-size:750px auto;
  background-position:right center;
  opacity:.50;
}
header::after{
  content:"";
  position:absolute;
  left:0;right:0;bottom:0;
  height:4px;
  background:linear-gradient(90deg,#00E5E0 0%,#00B8FF 50%,#004DFF 100%);
  z-index:2;
  pointer-events:none;
}
header>.wrap{position:relative;z-index:1}
header .brand-copy b{color:#082C48!important;text-shadow:0 1px 0 rgba(255,255,255,.12)}
header .brand-copy small{color:#123E5D!important}
header .brand-kicker{color:#083B66!important;letter-spacing:.12em!important}
header .brand-logo{box-shadow:0 0 0 3px rgba(255,255,255,.55)!important}
header .topnav a{color:#FFF!important;background:rgba(8,43,93,.38)!important;text-shadow:0 1px 2px rgba(0,27,76,.35)}
header .topnav a:hover{background:rgba(8,43,93,.55)!important}
body:has(form[action="/login"]) header{
  position:relative!important;
  top:auto!important;
  transform:none!important;
}
/* Título 100 % visible, en su propio bloque blanco; sin ondas */
body:has(form[action="/login"]) main{
  display:block!important;
  padding-top:0!important;
}
body:has(form[action="/login"]) .home-intro{
  display:block!important;
  position:relative!important;
  isolation:auto!important;
  background:#fff!important;
  background-image:none!important;
  overflow:visible!important;
  padding-top:42px!important;
  padding-bottom:33px!important;
  height:auto!important;
  max-height:none!important;
}
body:has(form[action="/login"]) .home-intro::before,
body:has(form[action="/login"]) .home-intro::after{
  content:none!important;
  display:none!important;
}
body:has(form[action="/login"]) .home-intro h1{
  display:block!important;
  position:relative!important;
  visibility:visible!important;
  opacity:1!important;
  overflow:visible!important;
  height:auto!important;
  max-height:none!important;
  max-width:970px!important;
  font-size:clamp(35px,4.45vw,62px)!important;
  line-height:1.10!important;
  letter-spacing:-.045em!important;
  color:#123e67!important;
  margin:0!important;
  padding:0!important;
  white-space:normal!important;
  text-wrap:balance;
}
body:has(form[action="/login"]) .home-intro h1::after{
  background:linear-gradient(90deg,#17D4D0 0%,#0AA7FF 60%,#005DFF 100%)!important;
  margin-top:17px!important;
}
body:has(form[action="/login"]) .home-intro > p{
  position:relative!important;
  clear:both!important;
  margin-top:18px!important;
}
body:has(form[action="/login"]) .home-points{position:relative!important}
body:has(form[action="/login"]) .login-shell{
  position:relative!important;
  margin-top:26px!important;
  overflow:hidden!important;
}
body:has(form[action="/login"]) .login-side{
  position:relative!important;
  overflow:hidden!important;
  isolation:isolate;
  background:linear-gradient(155deg,rgba(4,36,84,.14) 0%,rgba(3,36,103,.31) 100%),linear-gradient(145deg,#00E5E0 0%,#00B8FF 48%,#004DFF 100%)!important;
  color:#FFFFFF!important;
  border-left:0!important;
}
body:has(form[action="/login"]) .login-side::before{
  content:"";
  position:absolute;
  inset:0;
  z-index:0;
  pointer-events:none;
  background-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%221100%22%20height%3D%22420%22%20viewBox%3D%220%200%201100%20420%22%20fill%3D%22none%22%3E%3Cpath%20d%3D%22M-80%20240C180%2075%20270%20140%20470%20215S770%20345%201180%20115%22%20stroke%3D%22white%22%20stroke-width%3D%224%22%20stroke-opacity%3D%22.52%22%2F%3E%3Cpath%20d%3D%22M-80%20282C145%20115%20295%20160%20465%20239S792%20365%201180%20158%22%20stroke%3D%22white%22%20stroke-width%3D%223%22%20stroke-opacity%3D%22.39%22%2F%3E%3Cpath%20d%3D%22M-80%20324C155%20154%20312%20200%20476%20270S830%20388%201180%20207%22%20stroke%3D%22white%22%20stroke-width%3D%223%22%20stroke-opacity%3D%22.32%22%2F%3E%3Cpath%20d%3D%22M-80%20188C120%2050%20276%2084%20460%20182S775%20302%201180%2076%22%20stroke%3D%22%23C8FFFF%22%20stroke-width%3D%224%22%20stroke-opacity%3D%22.62%22%2F%3E%3C%2Fsvg%3E");
  background-repeat:no-repeat;
  background-size:100% auto;
  background-position:center bottom;
  opacity:.63;
}
body:has(form[action="/login"]) .login-side::after{
  content:"";
  position:absolute;
  inset:auto 0 0;
  width:auto;height:2px;
  border:0;border-radius:0;
  background:rgba(255,255,255,.34);
  pointer-events:none;
  z-index:0;
}
body:has(form[action="/login"]) .login-side > *{
  position:relative!important;
  z-index:1!important;
}
body:has(form[action="/login"]) .side-kicker{
  color:#DAFFFF!important;
  font-size:10px!important;
  text-shadow:0 1px 3px rgba(2,33,86,.45);
}
body:has(form[action="/login"]) .login-side h3{
  color:#FFFFFF!important;
  line-height:1.14!important;
  font-weight:850!important;
  text-shadow:0 2px 7px rgba(2,33,86,.38);
}
body:has(form[action="/login"]) .login-side p{
  color:#FFFFFF!important;
  line-height:1.62!important;
  font-weight:500!important;
  text-shadow:0 1px 4px rgba(2,33,86,.42);
}
@media(max-width:980px){
  body:has(form[action="/login"]) .login-side{border-left:0!important;border-top:1px solid rgba(255,255,255,.25)!important}
  body:has(form[action="/login"]) .home-intro{padding-top:28px!important}
}
@media(max-width:620px){
  body:has(form[action="/login"]) .home-intro h1{font-size:clamp(32px,9vw,44px)!important;line-height:1.12!important}
  body:has(form[action="/login"]) .login-side::before{background-size:auto 100%;background-position:right bottom}
}
@media(prefers-reduced-motion:reduce){header .topnav a{transition:none!important}}


/* Portada IDPS: tarjetas de demo y acceso estudiantil. */
.home-action-cards{width:min(1040px,calc(100% - 36px));margin:22px auto 35px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.home-action-card{display:flex;align-items:center;gap:17px;min-width:0;min-height:148px;padding:22px 24px;border-radius:18px;border:1px solid #DCE7F0;background:#fff;text-decoration:none!important;color:#0F2D52!important;box-shadow:0 9px 28px rgba(15,45,82,.065);transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
.home-action-card:hover{transform:translateY(-2px);box-shadow:0 14px 32px rgba(15,45,82,.11);border-color:#00B8FF}
.home-action-card:focus-visible{outline:3px solid #00B8FF;outline-offset:3px}
.home-action-icon{flex:0 0 54px;width:54px;height:54px;display:grid;place-items:center;border-radius:15px;background:linear-gradient(135deg,#00E5E0,#00B8FF 55%,#004DFF);color:#fff}
.home-action-icon svg{width:27px;height:27px}
.home-action-copy{display:flex;flex-direction:column;gap:5px;min-width:0}
.home-action-eyebrow{font-size:10px;font-weight:850;letter-spacing:.1em;color:#0078A9}
.home-action-copy strong{font-size:20px;line-height:1.18;color:#0F2D52}
.home-action-copy>span:last-child{font-size:12px;line-height:1.55;color:#5B7183}
.home-action-arrow{margin-left:auto;align-self:center;color:#0079C9;font-size:22px;font-weight:800}
.home-action-students .home-action-icon{background:linear-gradient(135deg,#00CDBB,#008DC8 60%,#005DDB)}
.idps-demo-page{max-width:920px;margin:26px auto 50px;background:#fff;border:1px solid #DFE8EF;border-radius:22px;padding:clamp(22px,4vw,44px);box-shadow:0 14px 38px rgba(15,45,82,.06)}
.idps-demo-page h1{font-size:clamp(28px,4vw,44px);line-height:1.12;margin:9px 0 10px;color:#0F2D52}
.idps-demo-page>p{color:#5D7284;line-height:1.65;margin:0 0 24px}
.idps-demo-back{display:inline-block;color:#0078C7;font-size:13px;font-weight:750;text-decoration:none;margin-bottom:26px}
.demo-awaiting{min-height:270px;border-radius:15px;background:linear-gradient(140deg,#00D8DA,#00AFFF 48%,#004DFF);display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;color:#fff;padding:25px;gap:10px}
.demo-awaiting>span{display:grid;place-items:center;width:62px;height:62px;border:2px solid rgba(255,255,255,.65);border-radius:50%;font-size:24px;padding-left:4px}
.demo-awaiting strong{font-size:21px;line-height:1.2}
.demo-awaiting p{max-width:430px;font-size:13px;line-height:1.6;color:#fff;margin:0}
@media(max-width:740px){.home-action-cards{grid-template-columns:1fr;gap:12px;margin-top:16px}.home-action-card{min-height:126px;padding:18px}.home-action-copy strong{font-size:18px}}
@media(max-width:420px){.home-action-card{gap:12px;padding:15px}.home-action-icon{width:46px;height:46px;flex-basis:46px}.home-action-arrow{font-size:18px}}
@media(prefers-reduced-motion:reduce){.home-action-card{transition:none}}

/* IDPS: botón de mostrar u ocultar la clave, sin exponerla por servidor. */
.idps-credential-control{display:block;position:relative;width:100%;min-width:0}
.idps-credential-control>input{display:block;width:100%!important;padding-right:56px!important}
.idps-password-toggle{position:absolute;right:5px;top:50%;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;width:44px;height:42px;padding:0!important;margin:0!important;border:0!important;border-radius:9px!important;background:transparent!important;color:#16618A!important;cursor:pointer;z-index:2;box-shadow:none!important}
.idps-password-toggle:hover{background:#E8F9FC!important;color:#005DCC!important}
.idps-password-toggle:focus-visible{outline:3px solid #00B8FF!important;outline-offset:1px}
.idps-password-toggle svg{width:22px;height:22px;display:block;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}

`;

const idpsPasswordToggleScript = "<script data-idps-password-toggle=\"1\">\n(function(){\n'use strict';\nvar eye='<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></svg>';\nvar eyeOff='<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a15 15 0 0 1-3.2 4.1M6.6 6.6C3.7 8.3 2 12 2 12s3.6 7 10 7c1.5 0 2.8-.4 4-1\"/></svg>';\nfunction install(input){\n if(input.dataset.idpsPasswordToggle==='1')return;\n input.dataset.idpsPasswordToggle='1';\n var wrap=document.createElement('span');wrap.className='idps-credential-control';\n input.parentNode.insertBefore(wrap,input);wrap.appendChild(input);\n var button=document.createElement('button');button.type='button';button.className='idps-password-toggle';\n var term=(input.name==='pin'||input.id==='pin')?'PIN':'contraseña';\n function update(){var visible=input.type==='text';button.innerHTML=visible?eyeOff:eye;button.setAttribute('aria-label',(visible?'Ocultar ':'Mostrar ')+term);button.setAttribute('title',(visible?'Ocultar ':'Mostrar ')+term);button.setAttribute('aria-pressed',visible?'true':'false');}\n button.addEventListener('click',function(){input.type=input.type==='password'?'text':'password';update();});\n var form=input.closest('form');if(form)form.addEventListener('submit',function(){if(input.type==='text'){input.type='password';update();}});\n wrap.appendChild(button);update();\n}\ndocument.querySelectorAll('input[type=\"password\"]').forEach(install);\n})();\n</script>";

function injectBranding(html) {
  if (typeof html !== 'string' || !/<html[\s>]/i.test(html)) return html;
  if (!html.includes('data-mec-branding="3"')) {
    const favicon = logoData ? `<link rel="icon" type="image/jpeg" href="${logoData}">` : '';
    html = html.replace('</head>', `${favicon}<style data-mec-branding="3">${brandCss}${html.includes('action="/login"') ? idpsHomeBackgroundCss : ''}</style></head>`);
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

  if (!html.includes('data-idps-password-toggle="1"')) {
    html = html.replace('</body>', idpsPasswordToggleScript + '</body>');
  }

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
