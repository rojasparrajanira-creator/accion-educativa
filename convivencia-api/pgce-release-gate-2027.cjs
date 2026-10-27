'use strict';
/**
 * PGCE 2027: control de preparación PARA REVISIÓN, no una certificación.
 * No lee datos institucionales ni credenciales. No crea copias de seguridad ni
 * despliega en Render. Nunca toma el resultado "Pasa" como permiso de publicar.
 */
const fs=require('node:fs');
const {validateReview}=require('./pgce-uat-evaluacion-local-2027.cjs');
const VALIDATIONS=Object.freeze([
 ['ci','Suite del mismo SHA candidata completada correctamente'],
 ['identity','Sesiones y acceso por rol probado con autenticación REAL en entorno aislado'],
 ['separation','Aislamiento entre establecimientos probado en entorno aislado'],
 ['privacy','Revisión humana de privacidad y retención documentada'],
 ['accessibility','Revisión con lector de pantalla y dispositivo físico'],
 ['pedagogical_scope','Alcance de niveles y limitaciones NT1/NT2 comunicado'],
 ['legal','Revisión normativa y documental por profesional competente'],
 ['migration','Migración validada en PostgreSQL de prueba independiente'],
 ['backup','Respaldo restaurable verificado antes de cualquier cambio productivo'],
 ['rollback','Procedimiento de reversión y prueba de restauración documentados'],
 ['billing','Suscripciones, roles y pantalla de acceso comprobados'],
 ['cohort','Establecimiento piloto, responsables, soporte y alcance acordados'],
 ['direction','Dictamen humano de Dirección / responsable de publicación registrado']
]);
const keys=VALIDATIONS.map(x=>x[0]);
function inspectRelease({uat=null,validations={},candidateSha='',approvedByHuman=false}={}){
 const issues=[];
 let count={pasa:0,falla:0,no_probado:20};
 if(!uat){issues.push('Falta evaluación profesional UAT-01 a UAT-20');}
 else{
  try{
   const parsed=validateReview(uat);
   count={
    pasa:parsed.results.filter(x=>x.estado==='Pasa').length,
    falla:parsed.results.filter(x=>x.estado==='Falla').length,
    no_probado:parsed.results.filter(x=>x.estado==='No probado').length
   };
   if(count.falla)issues.push('Hay '+count.falla+' casos UAT fallidos');
   if(count.no_probado)issues.push('Hay '+count.no_probado+' casos UAT sin probar');
  }catch(e){issues.push('Evaluación UAT inválida: '+String(e.message).slice(0,90));}
 }
 if(!/^[0-9a-f]{40}$/.test(String(candidateSha)))
  issues.push('No se especificó el SHA exacto del candidato');
 // Nunca se admiten autocertificaciones ni evidencia falsa: el resultado es
 // un listado de verificaciones declaradas, pendiente de revisión externa.
 const completed=Object.create(null);
 for(const [key,label] of VALIDATIONS){
  const item=validations&&Object.hasOwn(validations,key)?validations[key]:null;
  const documented=!!(item&&item.completed===true&&typeof item.evidence_ref==='string'&&
   /^[A-Z0-9_.\/-]{4,90}$/.test(item.evidence_ref));
  completed[key]=documented;
  if(!documented)issues.push(label+' — pendiente de evidencia revisable');
 }
 for(const key of Object.keys(validations||{}))
  if(!keys.includes(key))issues.push('Comprobación no reconocida');
 if(approvedByHuman!==true)
  issues.push('No existe dictamen humano explícito de autorización de publicación');
 // Sólo se ofrece un diagnóstico: ni "approvedByHuman" ni los controles de
 // seguimiento pueden ejecutar/desencadenar deployment o verificar firmas.
 return {
  type:'PGCE_2027_RELEASE_ASSESSMENT_ONLY',
  candidate_sha:/^[0-9a-f]{40}$/.test(candidateSha)?candidateSha:null,
  status:issues.length?'NOT_READY_FOR_RELEASE':'REQUIRES_INDEPENDENT_VERIFICATION',
  technical_claims_not_verified:true,
  release_authorized:false,
  auto_deploy_permitted:false,
  uat:count,completed,issues
 };
}
if(require.main===module){
 const candidate=String(process.env.PGCE_CANDIDATE_SHA||'');
 const data=inspectRelease({candidateSha:candidate});
 process.stdout.write(JSON.stringify(data,null,2)+'\n');
 process.exitCode=1; // compuerta de revisión siempre cerrada por defecto
}
module.exports={inspectRelease,VALIDATIONS};
