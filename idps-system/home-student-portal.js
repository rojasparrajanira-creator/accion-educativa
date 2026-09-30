const express = require('express');

const SURVEY_URL = (process.env.SURVEY_URL || 'https://diagnostico-idps-material-educativo.onrender.com').replace(/\/$/, '');
const STUDENT_URL = `${SURVEY_URL}/encuesta-idps.html`;

const originalGet = express.application.get;
express.application.get = function patchedHomeGet(path, ...handlers) {
  if (path === '/' && handlers.length) {
    const last = handlers.length - 1;
    const originalHandler = handlers[last];
    handlers[last] = function homeWithStudentPortal(req, res, next) {
      const send = res.send.bind(res);
      res.send = function patchedSend(body) {
        if (typeof body === 'string') {
          const accountCard = '<div class="col6 card"><h2>¿Aún no tiene cuenta?</h2><p>Solicite la activación del establecimiento y adjunte su comprobante de pago.</p><a class="btn secondary" href="/solicitud">Solicitar cuenta</a><p style="margin-top:22px"><a href="/superadmin">Acceso superadministrador</a></p></div>';
          const replacement = `<div class="col6 card" style="border:2px solid var(--turq);background:linear-gradient(180deg,#ffffff 0%,#f2fcfd 100%)"><div style="display:inline-block;padding:5px 10px;border-radius:999px;background:#e5f9fb;color:var(--navy);font-size:12px;font-weight:900;margin-bottom:12px">ESTUDIANTES</div><h2>Portal del estudiante</h2><p class="muted">Ingresa con tu <b>RUT</b> y la <b>clave de 4 dígitos</b> entregada por tu establecimiento para responder tu encuesta IDPS.</p><a class="btn primary" href="${STUDENT_URL}" target="_blank" rel="noopener">Ingresar como estudiante</a><p class="muted" style="margin:16px 0 0;font-size:12px">Tu resultado individual se mostrará al finalizar la aplicación.</p></div><div class="col12 card"><h2>¿Aún no tiene cuenta?</h2><p>Solicite la activación del establecimiento y adjunte su comprobante de pago.</p><div class="actions"><a class="btn secondary" href="/solicitud">Solicitar cuenta</a><a class="btn secondary" href="/superadmin">Acceso superadministrador</a></div></div>`;
          if (body.includes(accountCard)) body = body.replace(accountCard, replacement);
        }
        return send(body);
      };
      return originalHandler(req, res, next);
    };
  }
  return originalGet.call(this, path, ...handlers);
};
