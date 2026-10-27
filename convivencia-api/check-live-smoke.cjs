'use strict';
// Comprobación de solo lectura de endpoints públicos y privados de Convivencia.
// No usa credenciales, no crea sesiones ni escribe en bases de datos.
const assert=require('node:assert/strict');
const app='https://convivencia-escolar-material-educativo.onrender.com';
const api='https://convivencia-escolar-api.onrender.com';
async function get(url){
  let error;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const r=await fetch(url,{method:'GET',redirect:'follow',signal:AbortSignal.timeout(22000),
        headers:{'Accept':'text/html,application/json'}});
      return {status:r.status,body:await r.text()};
    }catch(e){
      error=e;
      if(attempt<2)await new Promise(resolve=>setTimeout(resolve,3500));
    }
  }
  throw error;
}
(async()=>{
  const login=await get(app+'/ingreso.html');
  assert.equal(login.status,200,'Pantalla de ingreso no responde 200');
  assert.match(login.body,/Ingreso profesional|Convivencia Escolar/i,'Formulario de acceso ausente');
  console.log('SMOKE LIVE OK: ingreso público (200)');
  const home=await get(app+'/index.html');
  assert.equal(home.status,200,'Inicio público no responde 200');
  console.log('SMOKE LIVE OK: inicio público (200)');
  const anonymous=await get(api+'/api/auth/me');
  assert.equal(anonymous.status,401,'Una sesión anónima no debe poder leer identidad');
  console.log('SMOKE LIVE OK: identidad no accesible sin sesión (401)');
  const protectedRoutes=[
    '/api/platform/establishments',
    '/api/students?establishment_id=1',
    '/api/establishments/1/results'
  ];
  for(const route of protectedRoutes){
    const r=await get(api+route);
    assert.equal(r.status,401,'Acceso anónimo indebido a '+route+' ('+r.status+')');
    console.log('SMOKE LIVE OK: ruta restringida protegida (401)');
  }
  const plans=await get(api+'/api/subscriptions/plans');
  assert.equal(plans.status,200,'Planes no responden');
  const body=JSON.parse(plans.body);
  assert.equal(body.ok,true);
  assert.ok(Array.isArray(body.plans));
  console.log('SMOKE LIVE OK: planes públicos (200); cobro recurrente habilitado: '+(body.payment_ready?'sí':'no'));
  console.log('SMOKE_CONVIVENCIA_LIVE_PASSED: comprobaciones GET anónimas, sin datos reales');
})().catch(e=>{console.error('SMOKE_CONVIVENCIA_LIVE_FAILED: '+e.message);process.exitCode=1});
