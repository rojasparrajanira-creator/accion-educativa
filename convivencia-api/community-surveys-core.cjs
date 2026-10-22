'use strict';
const crypto=require('node:crypto');
const bank=require('./community-surveys-bank-2027.json');
const audienceKeys=new Set(Object.keys(bank.audiences));
const MIN_GROUP=10;
const sha=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const randomCode=()=>crypto.randomBytes(24).toString('base64url');
const randomPin=()=>String(crypto.randomInt(0,100000000)).padStart(8,'0');
const hashPin=(pin,salt)=>new Promise((resolve,reject)=>crypto.scrypt(String(pin),salt,64,(e,b)=>e?reject(e):resolve(b.toString('hex'))));
const safePositiveInt=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null;
function validateAnswers(audience,answers){
 if(!audienceKeys.has(audience)||!answers||typeof answers!=='object'||Array.isArray(answers))throw Error('invalid_answers');
 const items=bank.audiences[audience].items;
 const keys=Object.keys(answers),allowed=new Set(items.map(x=>x.id));
 if(!keys.length||keys.length>items.length||JSON.stringify(answers).length>13000)throw Error('invalid_answers');
 for(const [key,value] of Object.entries(answers)){
  if(!allowed.has(key)||![1,2,3,4,5,'unknown','not_applicable','skipped'].includes(value))throw Error('invalid_answer');
 }
 return true;
}
function makeAggregate(rows,audience){
 if(!audienceKeys.has(audience))throw Error('invalid_audience');
 const n=rows.length;
 if(n<MIN_GROUP)return {audience,available:false,reason:'insufficient_group_size',minimum_group_size:MIN_GROUP,items:[]};
 const items=bank.audiences[audience].items.map(item=>{
  const numeric=rows.map(r=>r.answers[item.id]).filter(v=>Number.isInteger(v)&&v>=1&&v<=5);
  if(numeric.length<MIN_GROUP)return {id:item.id,dimension:item.dimension,available:false,reason:'insufficient_item_responses'};
  const favorable=numeric.filter(v=>v>=4).length/numeric.length*100;
  const band=favorable<25?'0–24 %':favorable<50?'25–49 %':favorable<75?'50–74 %':'75–100 %';
  return {id:item.id,dimension:item.dimension,available:true,favorable_band:band};
 });
 return {audience,available:true,participant_band:(Math.floor(n/5)*5)+'–'+(Math.floor(n/5)*5+4),
  minimum_group_size:MIN_GROUP,items,
  warning:'Resultados exploratorios y orientativos; no equivalentes a mediciones oficiales. Omitidos, no aplicables y respuestas sin información no se puntúan.'};
}
const roles={
 docente:new Set(['profesor','docente','educadora','educador']),
 asistente:new Set(['asistente_educacion','asistente','auxiliar','paradocente','psicologo','trabajador_social']),
 directivo:new Set(['director','directora','jefe_utp','utp','equipo_directivo','coordinador_convivencia'])
};
const assignedRole=(role,audience)=>audience==='familia'||!!roles[audience]?.has(String(role||'').toLowerCase());

/**
 * Pre-borrador DIAGNÓSTICO: no genera acciones automáticas ni certifica un PGCE.
 * El universo se limita a las cuatro encuestas de adultos del banco propio.
 * Sólo recibe salidas agregadas, nunca filas individuales.
 */
function makeDiagnosticDraft(groupReports){
 const names={familia:'Familias',docente:'Docentes',asistente:'Asistentes de la educación',directivo:'Equipo directivo/UTP'};
 const audiences=Array.from(audienceKeys);
 const included=[],pending=[],topics=[],clauseCoverage=Object.create(null);
 for(const k of 'abcdefg')clauseCoverage['16D-'+k]=new Set();
 for(const audience of audiences){
  const r=groupReports?.[audience];
  if(!r?.available){pending.push({audience,label:names[audience],reason:'insufficient_group_size_or_no_data'});continue}
  included.push({audience,label:names[audience],participant_band:r.participant_band});
  const questions=new Map(bank.audiences[audience].items.map(x=>[x.id,x]));
  for(const item of r.items||[]){
   if(!item.available)continue;
   const q=questions.get(item.id);
   if(!q)continue;
   clauseCoverage[q.legal_clause]?.add(audience);
   const possible={
    '0–24 %':'needs_professional_review',
    '25–49 %':'needs_professional_review',
    '50–74 %':'monitor_with_more_evidence',
    '75–100 %':'potential_strength'
   }[item.favorable_band];
   if(!possible)continue;
   topics.push({
    item_id:q.id,audience,dimension:q.dimension,clause:q.legal_clause,
    indicator_band:item.favorable_band,
    review_category:possible,
    interpretation:'Orientativa. Contrastar con otras fuentes, contexto, participación y datos del establecimiento.'
   });
  }
 }
 return {
  status:'preliminary_adult_diagnostic_only',
  year:2027,bank_version:bank.version,
  sources_used:included,insufficient_or_missing_sources:pending,
  pending_other_sources:[
   'Encuestas estudiantiles por nivel y NT1/NT2 cuando se valide su comprensión',
   'Consejo Escolar y procesos participativos con todos los estamentos',
   'Observación pedagógica, actas, protocolos, registros agregados y contexto PEI/PME'
  ],
  legal_links:Object.keys(clauseCoverage).map(clause=>({
   clause,audiences_with_aggregated_items:[...clauseCoverage[clause]].sort(),
   supports_diagnostic_only:true
  })),
  review_topics:topics,
  can_approve_pgce:false,
  warning:'Preinforme de encuestas propias de adultos, sin validez oficial o clínica; no determina incumplimientos legales, no es el PGCE ni puede reemplazar diagnóstico participativo, Consejo Escolar, Dirección o revisión profesional. No contiene respuestas individuales.'
 };
}

module.exports={bank,audienceKeys,MIN_GROUP,sha,randomCode,randomPin,hashPin,safePositiveInt,validateAnswers,makeAggregate,makeDiagnosticDraft,assignedRole};
