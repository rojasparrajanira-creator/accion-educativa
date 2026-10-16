'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createApp,checkStagingConfiguration}=require('./subscription-staging');

test('rejects production environment and any production database URL',()=>{
  assert.throws(()=>checkStagingConfiguration({NODE_ENV:'production'}),/NODE_ENV/);
  assert.throws(()=>checkStagingConfiguration({
    NODE_ENV:'staging',
    DATABASE_URL:'postgres://user:password@host/diagnostico_idps_db'
  }),/Refusing to connect/);
  assert.throws(()=>checkStagingConfiguration({
    NODE_ENV:'staging',
    DATABASE_URL:'postgres://user:password@host/idps_suscripciones_pruebas_db',
    MERCADOPAGO_ACCESS_TOKEN:'APP_USR-FAKE-PRODUCTION-TOKEN'
  }),/Refusing production/);
  assert.throws(()=>checkStagingConfiguration({
    NODE_ENV:'staging',IDPS_BILLING_ENABLED:'true'
  }),/TEST access token/);
  assert.doesNotThrow(()=>checkStagingConfiguration({
    NODE_ENV:'staging',MERCADOPAGO_ACCESS_TOKEN:'TEST-fake-only'
  }));
});

test('no DB, no merchant token and no access password: health works but sandbox UI rejects outsiders',async()=>{
  const env={NODE_ENV:'staging',IDPS_BILLING_ENABLED:'false',STAGING_ACCESS_PASSWORD:''};
  const {app,start}=createApp(env);
  await start();
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try{
    const base='http://127.0.0.1:'+server.address().port;
    const health=await fetch(base+'/health');
    assert.equal(health.status,200);
    const body=await health.json();
    assert.equal(body.ok,true);
    assert.equal(body.databaseConfigured,false);
    assert.equal(body.databaseConnected,false);
    assert.equal(body.productionTokensBlocked,true);
    assert.equal(body.paymentsEnabled,false);
    assert.equal((await fetch(base+'/')).status,401);
    assert.equal((await fetch(base+'/pago-mensual')).status,401);
    assert.equal((await fetch(base+'/suscripcion/iniciar',{method:'POST'})).status,401);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('staging access requires password; billing page remains disabled without merchant credentials',async()=>{
  const env={NODE_ENV:'staging',IDPS_BILLING_ENABLED:'false',STAGING_ACCESS_PASSWORD:'fake-password'};
  const {app,start}=createApp(env);await start();
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  try{
    const base='http://127.0.0.1:'+server.address().port;
    const bad='Basic '+Buffer.from('idps-pruebas:wrong').toString('base64');
    const good='Basic '+Buffer.from('idps-pruebas:fake-password').toString('base64');
    assert.equal((await fetch(base+'/pago-mensual',{headers:{Authorization:bad}})).status,401);
    const r=await fetch(base+'/pago-mensual',{headers:{Authorization:good}});
    assert.equal(r.status,200);
    const html=await r.text();
    assert.match(html,/aún no están habilitados/);
    assert.doesNotMatch(html,/action="\/suscripcion\/iniciar"/);
    assert.equal((await fetch(base+'/webhooks/mercadopago/subscriptions',{method:'POST'})).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
