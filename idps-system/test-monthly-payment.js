'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const renderMonthlyPayment = require('./monthly-payment');
const billing = require('./subscription-billing');

function page() {
  let handler, result;
  renderMonthlyPayment({get(path, h) {
    assert.equal(path, '/pago-mensual'); handler=h;
  }},{layout(_title,body){return body;}});
  handler({}, {send(content){result=content;}});
  return result;
}

test('does not invite real charges when merchant credentials are missing', () => {
  const old=process.env.MERCADOPAGO_ACCESS_TOKEN;
  delete process.env.MERCADOPAGO_ACCESS_TOKEN;
  try{
    assert.equal(billing.ready(),false);
    const html=page();
    assert.match(html,/15\.000/);
    assert.match(html,/30 días/);
    assert.match(html,/aún no están habilitados/);
    assert.doesNotMatch(html,/action="\/suscripcion\/iniciar"/);
  }finally{
    if(old===undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN;
    else process.env.MERCADOPAGO_ACCESS_TOKEN=old;
  }
});

test('configured checkout explicitly requests consent to recurring 30-day card charges',()=>{
  const env={
    DATABASE_URL:'postgres://placeholder/placeholder',
    MERCADOPAGO_ACCESS_TOKEN:'dummy-test-token',
    MERCADOPAGO_WEBHOOK_SECRET:'dummy-secret',
    IDPS_BILLING_CRON_SECRET:'dummy-cron',
    RESEND_API_KEY:'dummy-email-key',
    RESEND_FROM:'pruebas@example.com',
    PUBLIC_URL:'https://idps.example.org'
  };
  const originals=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
  try{
    Object.assign(process.env,env);
    assert.equal(billing.ready(),true);
    const html=page();
    assert.match(html,/action="\/suscripcion\/iniciar"/);
    assert.match(html,/name="accept" value="yes" required/);
    assert.match(html,/15\.000 CLP cada 30 días/);
    assert.match(html,/\/suscripcion\/solicitar-cancelacion/);
    assert.match(html,/No almacenamos números ni códigos de tu tarjeta/);
  }finally{
    for(const [k,v] of Object.entries(originals)){
      if(v===undefined)delete process.env[k]; else process.env[k]=v;
    }
  }
});

test('the old subscription URL validator never accepts untrusted protocols or hosts',()=>{
  const safe=renderMonthlyPayment.trustedSubscriptionUrl;
  assert.equal(safe('https://mercadopago.cl/subscription'),'https://mercadopago.cl/subscription');
  assert.equal(safe('http://mercadopago.cl/test'),null);
  assert.equal(safe('https://mercadopago.cl.evil.example/test'),null);
  assert.equal(safe('javascript:alert(1)'),null);
});
