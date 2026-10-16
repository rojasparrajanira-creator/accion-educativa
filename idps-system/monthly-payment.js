'use strict';

// Enlace de plan de suscripción mensual creado en la cuenta comercial de Mercado Pago.
// Nunca almacenar credenciales, tokens ni datos de tarjetas en el código o el navegador.
function trustedSubscriptionUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase();
    const trusted = host === 'mpago.la'
      || host === 'mercadopago.cl' || host.endsWith('.mercadopago.cl')
      || host === 'mercadopago.com' || host.endsWith('.mercadopago.com');
    return url.protocol === 'https:' && trusted && !url.username && !url.password
      ? url.href : null;
  } catch {
    return null;
  }
}

function registerMonthlyPayment(app, { layout }) {
  app.get('/pago-mensual', (req, res) => {
    const amount = Number(process.env.IDPS_MONTHLY_AMOUNT_CLP || '15000');
    const displayAmount = Number.isSafeInteger(amount) && amount > 0
      ? amount.toLocaleString('es-CL') : '15.000';
    const configured = require('./subscription-billing').ready();
    const action = configured
      ? '<form method="post" action="/suscripcion/iniciar" style="width:100%;max-width:560px">'+
        '<div class="field"><label for="sub-rbd">RBD del establecimiento</label><input id="sub-rbd" name="rbd" maxlength="15" required></div>'+
        '<div class="field"><label for="sub-email">Correo institucional para avisos y cancelación</label><input id="sub-email" type="email" name="email" maxlength="254" autocomplete="email" required></div>'+
        '<label style="display:block;margin:16px 0;line-height:1.6"><input type="checkbox" name="accept" value="yes" required> '+
        'Autorizo vincular una tarjeta en el sitio seguro de Mercado Pago para que se cobren <b>$15.000 CLP cada 30 días</b>. '+
        'Deseo recibir notificaciones de renovación por correo y sé que puedo cancelar la suscripción para detener futuros cargos.</label>'+
        '<button class="btn primary" type="submit">Vincular tarjeta y activar cobro recurrente ↗</button>'+
        '</form>'
      : '<div class="notice" role="status">La vinculación de tarjetas y el pago recurrente aún no están habilitados. Puedes solicitar acceso mientras se completa la configuración y las pruebas.</div>';
    res.send(layout('Pago mensual IDPS', `
      <section class="card" style="max-width:760px;margin:24px auto">
        <span style="font-weight:900;color:#168da9;letter-spacing:.1em;font-size:12px">MATERIAL EDUCATIVO CHILE · IDPS</span>
        <h1 style="margin:15px 0">Plan IDPS · 30 días</h1>
        <p class="muted">Plataforma institucional de Indicadores de Desarrollo Personal y Social.</p>
        <p style="font-size:36px;font-weight:900;color:#0f2d52;margin:20px 0 5px">$ ${displayAmount} <span style="font-size:16px">CLP / 30 días</span></p>
        <p class="muted">Cada pago confirmado otorga 30 días de acceso. Los cobros automáticos se tramitan en Mercado Pago, donde vincularás tu tarjeta. No almacenamos números ni códigos de tu tarjeta.</p>
        <p>El pago no activa el acceso inmediatamente: el equipo de Material Educativo Chile revisará la solicitud del establecimiento, verificará el pago y enviará las credenciales de acceso con vigencia de 30 días.</p>
        <div class="actions" style="margin-top:24px;align-items:center;flex-wrap:wrap">
          ${action}
          <a class="btn secondary" href="/solicitud">Solicitar acceso institucional</a>
          <a class="btn secondary" href="/">Volver al ingreso</a>
        </div>
        ${configured ? '<section style="margin-top:24px;padding-top:18px;border-top:1px solid #eee"><h3>¿Quieres cancelar una suscripción?</h3><p class="muted">Solicita un enlace seguro a tu correo registrado.</p><form method="post" action="/suscripcion/solicitar-cancelacion"><div class="field"><label>RBD del establecimiento</label><input name="rbd" required></div><div class="field"><label>Correo registrado</label><input type="email" name="email" required></div><button class="btn secondary">Enviar enlace de cancelación</button></form></section>' : ''}
        <p class="muted" style="font-size:13px;margin-top:20px">Si ya tienes acceso, identifica el RBD y correo institucional ante el equipo para que el pago se asocie correctamente. Antes del próximo cobro recibirás un aviso por correo con un enlace para cancelar los futuros cargos. También podrás solicitar un nuevo enlace de cancelación. Los datos del establecimiento y de sus estudiantes no se eliminan por suspensión del servicio.</p>
      </section>
    `, '<a href="/">Inicio</a><a href="/solicitud">Solicitar acceso</a>'));
  });
}

module.exports = registerMonthlyPayment;
module.exports.trustedSubscriptionUrl = trustedSubscriptionUrl;
