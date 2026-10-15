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
    const url = trustedSubscriptionUrl(process.env.IDPS_MONTHLY_SUBSCRIPTION_URL);
    const action = url
      ? `<a class="btn primary" href="${url}" target="_blank" rel="noopener noreferrer">Suscribirme y pagar en Mercado Pago ↗</a>`
      : '<div class="notice" role="status">El pago en línea todavía no está habilitado. Por ahora puedes solicitar acceso y recibir instrucciones del equipo.</div>';
    res.send(layout('Pago mensual IDPS', `
      <section class="card" style="max-width:760px;margin:24px auto">
        <span style="font-weight:900;color:#168da9;letter-spacing:.1em;font-size:12px">MATERIAL EDUCATIVO CHILE · IDPS</span>
        <h1 style="margin:15px 0">Plan IDPS · 30 días</h1>
        <p class="muted">Plataforma institucional de Indicadores de Desarrollo Personal y Social.</p>
        <p style="font-size:36px;font-weight:900;color:#0f2d52;margin:20px 0 5px">$ ${displayAmount} <span style="font-size:16px">CLP / 30 días</span></p>
        <p class="muted">Cada pago confirmado otorga 30 días de acceso. El cobro recurrente mensual se gestiona a través de Mercado Pago según el plan contratado.</p>
        <p>El pago no activa el acceso inmediatamente: el equipo de Material Educativo Chile revisará la solicitud del establecimiento, verificará el pago y enviará las credenciales de acceso con vigencia de 30 días.</p>
        <div class="actions" style="margin-top:24px;align-items:center;flex-wrap:wrap">
          ${action}
          <a class="btn secondary" href="/solicitud">Solicitar acceso institucional</a>
          <a class="btn secondary" href="/">Volver al ingreso</a>
        </div>
        <p class="muted" style="font-size:13px;margin-top:20px">Si ya tienes acceso, identifica el RBD y correo institucional ante el equipo para que el pago se asocie correctamente. La cancelación de los cargos recurrentes se gestiona desde Mercado Pago. Los datos del establecimiento y de sus estudiantes no se eliminan por suspensión del servicio.</p>
      </section>
    `, '<a href="/">Inicio</a><a href="/solicitud">Solicitar acceso</a>'));
  });
}

module.exports = registerMonthlyPayment;
module.exports.trustedSubscriptionUrl = trustedSubscriptionUrl;
