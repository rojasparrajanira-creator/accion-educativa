'use strict';
const crypto=require('node:crypto');

// Requiere opt-in doble y llave efímera de pruebas: no exponer el acceso piloto por error.
// La función no modifica configuración, usuarios ni sesiones.
function configured(env=process.env){
  const secret=String(env.MEC_PILOT_TEST_KEY||'');
  return String(env.MEC_ENABLE_PILOT||'').toLowerCase()==='true'&&
    String(env.RUN_PILOT_SELFTEST||'')==='1'&&
    Buffer.byteLength(secret,'utf8')>=32;
}
function authorized(env=process.env,presented=''){
  if(!configured(env))return false;
  const expected=Buffer.from(String(env.MEC_PILOT_TEST_KEY),'utf8');
  const provided=Buffer.from(typeof presented==='string'?presented:'','utf8');
  if(provided.length!==expected.length)return false;
  return crypto.timingSafeEqual(provided,expected);
}
module.exports={configured,authorized};
