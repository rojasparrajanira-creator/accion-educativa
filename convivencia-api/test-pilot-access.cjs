'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const pilot=require('./pilot-access');
const secret='secure-only-for-local-test-0123456789-ABCDEFGHIJ';
const enabled={MEC_ENABLE_PILOT:'true',RUN_PILOT_SELFTEST:'1',MEC_PILOT_TEST_KEY:secret};
test('piloto cerrado sin configuración completa, por defecto y con una sola bandera',()=>{
  const cases=[
    {},{MEC_ENABLE_PILOT:'true'},
    {MEC_ENABLE_PILOT:'true',RUN_PILOT_SELFTEST:'0',MEC_PILOT_TEST_KEY:secret},
    {RUN_PILOT_SELFTEST:'1',MEC_PILOT_TEST_KEY:secret},
    {MEC_ENABLE_PILOT:'true',RUN_PILOT_SELFTEST:'1'},
    {...enabled,MEC_PILOT_TEST_KEY:'too-short'}
  ];
  for(const config of cases){
    assert.equal(pilot.configured(config),false);
    assert.equal(pilot.authorized(config,secret),false);
  }
});
test('piloto exige coincidencia exacta de clave solo en modo temporal autorizado',()=>{
  assert.equal(pilot.configured(enabled),true);
  assert.equal(pilot.authorized(enabled,''),false);
  assert.equal(pilot.authorized(enabled,secret+'a'),false);
  assert.equal(pilot.authorized(enabled,secret.slice(1)),false);
  assert.equal(pilot.authorized(enabled,secret.replace('A','Z')),false);
  assert.equal(pilot.authorized(enabled,secret),true);
});
