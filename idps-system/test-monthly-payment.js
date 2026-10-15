'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const register = require('./monthly-payment');

test('only trusted HTTPS Mercado Pago subscription domains are allowed', () => {
  const { trustedSubscriptionUrl: safe } = register;
  assert.equal(safe('https://www.mercadopago.cl/subscriptions/checkout'), 'https://www.mercadopago.cl/subscriptions/checkout');
  assert.equal(safe('https://mpago.la/AbC123'), 'https://mpago.la/AbC123');
  assert.equal(safe('http://mercadopago.cl/test'), null);
  assert.equal(safe('https://mercadopago.cl.evil.example/x'), null);
  assert.equal(safe('javascript:alert(1)'), null);
  assert.equal(safe('https://user:pass@mercadopago.cl/checkout'), null);
  assert.equal(safe(undefined), null);
});

test('landing stays informative and never exposes a broken payment link when unconfigured', () => {
  const saved = process.env.IDPS_MONTHLY_SUBSCRIPTION_URL;
  delete process.env.IDPS_MONTHLY_SUBSCRIPTION_URL;
  try {
    let path, handler;
    register({get(p, h) {path=p; handler=h;}}, {layout(_title, html) {return html;}});
    assert.equal(path, '/pago-mensual');
    let html;
    handler({}, {send(body) {html=body;}});
    assert.match(html, /todavía no está habilitado/);
    assert.doesNotMatch(html, /href="undefined"|href="null"/);
    assert.match(html, /Solicitar acceso institucional/);
  } finally {
    if (saved === undefined) delete process.env.IDPS_MONTHLY_SUBSCRIPTION_URL;
    else process.env.IDPS_MONTHLY_SUBSCRIPTION_URL=saved;
  }
});

test('configured merchant plan enables checkout without capturing card data', () => {
  const saved=process.env.IDPS_MONTHLY_SUBSCRIPTION_URL;
  process.env.IDPS_MONTHLY_SUBSCRIPTION_URL='https://www.mercadopago.cl/subscriptions/checkout?id=sample';
  try {
    let handler;
    register({get(_path, h){handler=h;}}, {layout(_title, html){return html;}});
    let html;
    handler({}, {send(body){html=body;}});
    assert.match(html,/href="https:\/\/www\.mercadopago\.cl\/subscriptions\/checkout\?id=sample"/);
    assert.match(html,/Suscribirme y pagar en Mercado Pago/);
    assert.match(html,/15\.000/);
    assert.match(html,/CLP \/ 30 días/);
  } finally {
    if (saved === undefined) delete process.env.IDPS_MONTHLY_SUBSCRIPTION_URL;
    else process.env.IDPS_MONTHLY_SUBSCRIPTION_URL=saved;
  }
});
