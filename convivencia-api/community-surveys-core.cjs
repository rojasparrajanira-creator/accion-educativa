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
module.exports={bank,audienceKeys,MIN_GROUP,sha,randomCode,randomPin,hashPin,safePositiveInt,validateAnswers,makeAggregate,assignedRole};
