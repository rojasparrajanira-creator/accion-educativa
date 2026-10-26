'use strict';
// Segmentación por establecimiento para un piloto en producción Render.
// No sustituye autenticación/rol/suscripción. Denegar si falta lista en LIVE.
function isPositiveSafeInt(v){return Number.isSafeInteger(v)&&v>0}
function createCohortGate(env=process.env){
 const production=String(env.NODE_ENV||'')==='production' ||
  !!String(env.RENDER_SERVICE_ID||'').trim() ||
  String(env.RENDER||'').toLowerCase()==='true';
 const raw=String(env.MEC_PGCE_PILOT_ESTABLISHMENT_IDS||'').trim();
 const allowed=new Set();
 for(const item of raw.split(',')){
  if(!/^\d+$/.test(item.trim()))continue;
  const id=Number(item.trim());
  if(isPositiveSafeInt(id))allowed.add(id);
 }
 return {
  production,
  // En los laboratorios sintéticos se prueban dos instituciones libremente.
  // Render LIVE requiere lista explícita de IDs, nunca habilitación global.
  permits(establishmentId){
   const id=Number(establishmentId);
   return isPositiveSafeInt(id)&&(!production||allowed.has(id));
  },
  cohortConfigured:allowed.size>0,
  cohortSize:allowed.size
 };
}
module.exports={createCohortGate};
