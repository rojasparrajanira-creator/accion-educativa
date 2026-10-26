'use strict';
// Persistencia opt-in del borrador anual PGCE, separada de respuestas individuales.
// No se aprueban planes ni se aceptan registros personales de estudiantes.
const {DIMENSIONS}=require('./pgce-dimensions-integrated-2027.cjs');
const {inspectPgceDraft}=require('./pgce-preflight-2027.cjs');
const ROOT_FIELDS=new Set([
 'establishment_name','rbd','director','responsible','version','school_year',
 'findings','actions','diagnostic_sources','participation','council_school',
 'policy_alignment','pei_alignment','rie_alignment','pme_alignment','diffusion',
 'follow_up','director_approval'
]);
const FINDING_FIELDS=new Set(['id','dimension_id','need','evidence_refs','priority','professional_validation_note']);
const ACTION_FIELDS=new Set([
 'action_id','clause','title','objective','strategy','responsible','indicator','baseline',
 'target','place','resources','expected_evidence','start_date','end_date',
 'finding_ids','target_courses','evaluation_method'
]);
const OBJECT_FIELDS=Object.freeze({
 council_school:new Set(['report_ref','feedback_or_justification']),
 diffusion:new Set(['channels','calendar','delivery_record_plan']),
 follow_up:new Set(['frequency','responsible','evaluation_method'])
});
const SOURCE_FIELDS=new Set(['audience','method','evidence_ref']);
const PARTICIPATION_FIELDS=new Set(['audience','summary','evidence_ref','date']);
const SOURCE_AUDIENCES=new Set(['estudiantes','familia','docente','asistente','directivo','institutional_records']);
const PARTICIPATION_AUDIENCES=new Set(['estudiantes','familia','docente','asistente','directivo']);
function validObjectShape(v,allowed){
 return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).every(k=>allowed.has(k));
}
const bannedKey=/^(?:__proto__|constructor|prototype|rut|run|student_id|student_name|answers|individual_responses)$/i;
const apparentRut=/(?:^|[^0-9])\d{1,2}\.?\d{3}\.?\d{3}-[\dkK](?:$|[^a-z0-9])/i;
function invalid(){throw Error('invalid_pgce_draft')}
function deepCheck(obj,depth=0){
 if(depth>7)invalid();
 if(typeof obj==='string'){
  if(obj.length>1800||apparentRut.test(obj))invalid();
 }else if(Array.isArray(obj)){
  if(obj.length>100)invalid();
  for(const x of obj)deepCheck(x,depth+1);
 }else if(obj&&typeof obj==='object'){
  if(Object.keys(obj).length>50)invalid();
  for(const [k,v] of Object.entries(obj)){if(bannedKey.test(k))invalid();deepCheck(v,depth+1)}
 }else if(obj!==null&&typeof obj!=='boolean'&&!(typeof obj==='number'&&Number.isFinite(obj)))invalid();
}
// Map the seven legacy one-action-per-clause records to deterministic stable IDs.
// Retains existing references and never renumbers an already identified action.
function normalizeLegacyActionIds(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return raw;
 const clean=JSON.parse(JSON.stringify(raw));
 if(!Array.isArray(clean.actions))return clean;
 // Reserve explicit IDs first, then fill only missing IDs. This handles
 // partially migrated drafts without ever reusing a sibling action's identity.
 const reserved=new Set(clean.actions.filter(a=>a&&typeof a==='object'&&
  !Array.isArray(a)&&typeof a.action_id==='string').map(a=>a.action_id));
 for(const action of clean.actions){
  if(!action||typeof action!=='object'||Array.isArray(action))continue;
  const clause=action.clause;
  if(typeof clause!=='string'||clause.length!==1||!'abcdefg'.includes(clause))continue;
  if(action.action_id!==undefined)continue;
  let seq=1;
  while(seq<=99999 && reserved.has('ACT-'+clause+'-'+String(seq).padStart(3,'0')))seq++;
  if(seq>99999)invalid();
  action.action_id='ACT-'+clause+'-'+String(seq).padStart(3,'0');
  reserved.add(action.action_id);
 }
 return clean;
}
function validatePgceDraft(raw){
 raw=normalizeLegacyActionIds(raw);
 if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid();
 if(Buffer.byteLength(JSON.stringify(raw),'utf8')>65536)invalid();
 if(Object.keys(raw).some(k=>!ROOT_FIELDS.has(k)))invalid();
 if(raw.school_year!==2027||raw.director_approval!==null)invalid();
 if(!Array.isArray(raw.findings)||raw.findings.length>40||!Array.isArray(raw.actions)||
  raw.actions.length>70)invalid();
 deepCheck(raw);
 for(const [name,allowed] of Object.entries(OBJECT_FIELDS)){
  if(raw[name]!==undefined&&!validObjectShape(raw[name],allowed))invalid();
 }
 for(const [key,allowed,audiences] of [
  ['diagnostic_sources',SOURCE_FIELDS,SOURCE_AUDIENCES],
  ['participation',PARTICIPATION_FIELDS,PARTICIPATION_AUDIENCES]
 ]){
  if(raw[key]===undefined)continue;
  if(!Array.isArray(raw[key])||raw[key].length>30)invalid();
  for(const entry of raw[key]){
   if(!validObjectShape(entry,allowed)||!audiences.has(entry.audience))invalid();
  }
 }
 const ids=new Set();
 for(const f of raw.findings){
  if(!f||typeof f!=='object'||Array.isArray(f)||Object.keys(f).some(k=>!FINDING_FIELDS.has(k))||
   typeof f.id!=='string'||!/^H-[a-zA-Z0-9_-]{2,40}$/.test(f.id)||
   ids.has(f.id)||!Object.hasOwn(DIMENSIONS,f.dimension_id)||
   typeof f.need!=='string'||!Array.isArray(f.evidence_refs)||f.evidence_refs.length>15||
   f.evidence_refs.some(x=>typeof x!=='string'||x.length>120)||
   (f.priority!==undefined&&!['','low','medium','high'].includes(f.priority)))invalid();
  ids.add(f.id);
 }
 const seenActionIds=new Set();
 for(const a of raw.actions){
  if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).some(k=>!ACTION_FIELDS.has(k))||
   (typeof a.clause!=='string'||a.clause.length!==1||!'abcdefg'.includes(a.clause))||
   typeof a.action_id!=='string'||!/^ACT-[a-g]-[0-9]{3,5}$/.test(a.action_id)||
   a.action_id.split('-')[1]!==a.clause||seenActionIds.has(a.action_id)||
   !Array.isArray(a.finding_ids)||a.finding_ids.some(x=>!ids.has(x))||
   (a.target_courses!==undefined&&(!Array.isArray(a.target_courses)||
    a.target_courses.length>40||a.target_courses.some(x=>typeof x!=='string'||x.length>80))))invalid();
  seenActionIds.add(a.action_id);
 }
 // Esta función solo valida la estructura de un BORRADOR; la aprobación es externa.
 return JSON.parse(JSON.stringify(raw));
}
async function loadPgceDraft(pool,establishmentId){
 const q=await pool.query(
  'SELECT draft,revision,updated_at FROM community_pgce_drafts_2027 WHERE establishment_id=$1 AND school_year=2027',
  [establishmentId]);
 const row=q.rows[0];
 return row?{draft:normalizeLegacyActionIds(row.draft),revision:Number(row.revision),updated_at:row.updated_at}:null;
}
async function savePgceDraft(pool,{establishmentId,actorId,expectedRevision,draft}){
 if(!Number.isSafeInteger(establishmentId)||establishmentId<=0||
  !Number.isSafeInteger(actorId)||actorId<=0||
  !Number.isSafeInteger(expectedRevision)||expectedRevision<0)invalid();
 const clean=validatePgceDraft(draft);
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const actor=await client.query('SELECT 1 FROM users WHERE id=$1 AND establishment_id=$2 AND active=true',[actorId,establishmentId]);
  if(!actor.rowCount)throw Error('invalid_pgce_actor');
  // Existing saved IDs remain immutable, so follow-up history never moves to another action.
  const previous=await client.query(
   'SELECT draft,revision FROM community_pgce_drafts_2027 WHERE establishment_id=$1 AND school_year=2027 FOR UPDATE',
   [establishmentId]);
  if(previous.rowCount){
   if(expectedRevision!==Number(previous.rows[0].revision)){
    await client.query('ROLLBACK');return {conflict:true};
   }
   const oldActions=normalizeLegacyActionIds(previous.rows[0].draft).actions||[];
   for(const a of oldActions){
    const matching=clean.actions.find(x=>x.action_id===a.action_id);
    if(!matching||matching.clause!==a.clause)throw Error('invalid_pgce_action_identity');
   }
  }else if(expectedRevision!==0){await client.query('ROLLBACK');return {conflict:true}}
  let q;
  if(expectedRevision===0){
   q=await client.query(
    'INSERT INTO community_pgce_drafts_2027(establishment_id,school_year,revision,draft,updated_by) VALUES($1,2027,1,$2::jsonb,$3) ON CONFLICT(establishment_id,school_year) DO NOTHING RETURNING revision,updated_at',
    [establishmentId,JSON.stringify(clean),actorId]);
  }else{
   q=await client.query(
    'UPDATE community_pgce_drafts_2027 SET draft=$1::jsonb,revision=revision+1,updated_by=$2,updated_at=now() WHERE establishment_id=$3 AND school_year=2027 AND revision=$4 RETURNING revision,updated_at',
    [JSON.stringify(clean),actorId,establishmentId,expectedRevision]);
  }
  if(!q.rowCount){
   await client.query('ROLLBACK');
   return {conflict:true};
  }
  const revision=Number(q.rows[0].revision);
  await client.query(
   "INSERT INTO community_pgce_draft_audit_2027(establishment_id,school_year,revision,performed_by,action) VALUES($1,2027,$2,$3,'draft_saved')",
   [establishmentId,revision,actorId]);
  await client.query('COMMIT');
  return {conflict:false,revision,updated_at:q.rows[0].updated_at,
   preflight:inspectPgceDraft(clean)};
 }catch(e){
  try{await client.query('ROLLBACK')}catch(_){}
  throw e;
 }finally{client.release()}
}
module.exports={validatePgceDraft,normalizeLegacyActionIds,loadPgceDraft,savePgceDraft};
