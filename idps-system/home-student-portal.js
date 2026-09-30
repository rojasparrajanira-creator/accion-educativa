const express = require('express');

const SURVEY_URL = (process.env.SURVEY_URL || 'https://diagnostico-idps-material-educativo.onrender.com').replace(/\/$/, '');
const STUDENT_URL = `${SURVEY_URL}/encuesta-idps.html`;

function wrapHtml(handler, transform) {
  return function wrappedHtmlHandler(req, res, next) {
    const send = res.send.bind(res);
    res.send = function patchedSend(body) {
      if (typeof body === 'string') {
        try { body = transform(body, req) || body; }
        catch (e) { console.error('[HOME_PORTAL_PATCH]', e.message); }
      }
      return send(body);
    };
    return handler(req, res, next);
  };
}

const originalGet = express.application.get;
express.application.get = function patchedHomeGet(path, ...handlers) {
  if ((path === '/' || path === '/panel') && handlers.length) {
    const last = handlers.length - 1;
    const originalHandler = handlers[last];

    if (path === '/') {
      handlers[last] = wrapHtml(originalHandler, body => {
        const accountCard = '<div class="col6 card"><h2>¿Aún no tiene cuenta?</h2><p>Solicite la activación del establecimiento y adjunte su comprobante de pago.</p><a class="btn secondary" href="/solicitud">Solicitar cuenta</a><p style="margin-top:22px"><a href="/superadmin">Acceso superadministrador</a></p></div>';
        const replacement = `<div class="col6 card" style="border:2px solid var(--turq);background:linear-gradient(180deg,#ffffff 0%,#f2fcfd 100%)"><div style="display:inline-block;padding:5px 10px;border-radius:999px;background:#e5f9fb;color:var(--navy);font-size:12px;font-weight:900;margin-bottom:12px">ESTUDIANTES</div><h2>Portal del estudiante</h2><p class="muted">Ingresa con tu <b>RUT</b> y la <b>clave de 4 dígitos</b> entregada por tu establecimiento para responder tu encuesta IDPS.</p><a class="btn primary" href="${STUDENT_URL}" target="_blank" rel="noopener">Ingresar como estudiante</a><p class="muted" style="margin:16px 0 0;font-size:12px">Tu resultado individual se mostrará al finalizar la aplicación.</p></div><div class="col12 card"><h2>¿Aún no tiene cuenta?</h2><p>Solicite la activación del establecimiento y adjunte su comprobante de pago.</p><div class="actions"><a class="btn secondary" href="/solicitud">Solicitar cuenta</a><a class="btn secondary" href="/superadmin">Acceso superadministrador</a></div></div>`;
        return body.includes(accountCard) ? body.replace(accountCard, replacement) : body;
      });
    }

    if (path === '/panel') {
      handlers[last] = wrapHtml(originalHandler, body => {
        body = body.replace(
          'Desde aquí se administrarán matrícula, cursos, enlaces individuales y diagnósticos.',
          'Administra la nómina SIGE, las claves de acceso de estudiantes, la aplicación IDPS, el seguimiento, los resultados y los informes.'
        );
        body = body.replace(
          '<div class="topnav"><a href="/logout">Cerrar sesión</a></div>',
          '<div class="topnav"><a href="/panel/aplicacion">Aplicación y claves</a><a href="/panel/resultados">Resultados</a><a href="/panel/estudiantes">Nómina</a><a href="/logout">Cerrar sesión</a></div>'
        );
        body = body.replace(
          /<a class="btn primary" href="[^"]+" target="_blank">Abrir encuesta publicada<\/a>/,
          `<a class="btn primary" href="/panel/aplicacion">Aplicación y claves</a><a class="btn secondary" href="/panel/resultados">Resultados</a><a class="btn secondary" href="${STUDENT_URL}" target="_blank" rel="noopener">Portal del estudiante</a>`
        );
        return body;
      });
    }
  }
  return originalGet.call(this, path, ...handlers);
};
