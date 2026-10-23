'use strict';
// Constancias documentales del PGCE. Nunca valida firmas, autentica actas,
// determina cumplimiento normativo ni publica planes.
const {inspectPgceDraft}=require('./pgce-preflight-2027.cjs');
const STAGES=Object.freeze(['council_review','direction_act']);
const EDITORS=new Set(['coordinador_convivencia','dupla_psicosocial','director','directora']);
const DIRECTORS=new Set(['director','directora']);
const positive=n=>Number.isSafeInteger(n)&&n>0;
function invalid(){throw Error('invalid_pgce_governance')}
function dateValid(value){
 if(typeof value!=='string'||!/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value))return false;
 const t=new Date(value+'T12:00:00Z');
 return !Number.isNaN(t.getTime())&&t.toISOString().slice(0,10)===value;
}
function validateRecord(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||
  Object.keys(value).some(k=>!['stage','document_ref','document_date','confirmation'].includes(k))||
  !STAGES.includes(value.stage)||value.confirmation!==true||
  typeof value.document_ref!=='string'||
  !/^[A-Za-z0-9_./-]{6,120}$/.test(value.document_ref)||
  /(?:^|[^\d])\d{1,2}\.?\d{3}\.?\d{3}-[\dkK](?:$|[^a-z0-9])/i.test(value.document_ref)||
  !dateValid(value.document_date))invalid();
 return {stage:value.stage,document_ref:value.document_ref,document_date:value.document_date};
}
async function governanceStatus(pool,establishmentId){
 if(!positive(establishmentId))invalid();
 const p=await pool.query('SELECT revision FROM community_pgce_drafts_2027 WHERE establishment_id=$1 AND school_year=2027',[establishmentId]);
 const revision=p.rowCount?Number(p.rows[0].revision):0;
 const rows=await pool.query(
  'SELECT stage,draft_revision,document_ref,document_date,recorded_at FROM community_pgce_governance_2027 WHERE establishment_id=$1 AND school_year=2027 ORDER BY draft_revision DESC, recorded_at DESC',
  [establishmentId]);
 const stages=Object.create(null);
 for(const stage of STAGES){
  const entry=rows.rows.find(x=>x.stage===stage);
  const current=!!entry&&revision>0&&Number(entry.draft_revision)===revision;
  stages[stage]={status:current?'document_reference_current':entry?'document_reference_stale':'not_recorded',
   current,document_ref:current?entry.document_ref:null,
   document_date:current?entry.document_date:null};
 }
 return {draft_revision:revision,stages,can_publish:false,
  can_certify_compliance:false,
  warning:'Solo registro de referencias documentales; el sistema no verifica firmas, autenticidad ni aprobación jurídica.'};
}
async function recordGovernance(pool,{establishmentId,actorId,expectedRevision,input}){
 if(!positive(establishmentId)||!positive(actorId)||!positive(expectedRevision))invalid();
 const data=validateRecord(input);
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const actor=await client.query(
   'SELECT role FROM users WHERE id=$1 AND establishment_id=$2 AND active=true',
   [actorId,establishmentId]);
  if(!actor.rowCount)throw Error('pgce_governance_forbidden');
  const role=String(actor.rows[0].role||'');
  if(!EDITORS.has(role)||(data.stage==='direction_act'&&!DIRECTORS.has(role)))
   throw Error('pgce_governance_forbidden');
  const dr=await client.query(
   'SELECT draft,revision FROM community_pgce_drafts_2027 WHERE establishment_id=$1 AND school_year=2027 FOR UPDATE',
   [establishmentId]);
  if(!dr.rowCount||Number(dr.rows[0].revision)!==expectedRevision){
   await client.query('ROLLBACK');return {conflict:true};
  }
  if(data.stage==='direction_act'){
   // Se requiere evidencia de revisión del Consejo para esta misma versión y
   // un borrador completo, pero esto no convierte el plan en aprobado.
   const council=await client.query(
    "SELECT 1 FROM community_pgce_governance_2027 WHERE establishment_id=$1 AND school_year=2027 AND stage='council_review' AND draft_revision=$2",
    [establishmentId,expectedRevision]);
   const preflight=inspectPgceDraft(dr.rows[0].draft);
   if(!council.rowCount||preflight.status!=='ready_for_human_review'){
    await client.query('ROLLBACK');
    return {notReady:true,missing:preflight.missing.slice(0,30),council_recorded:!!council.rowCount};
   }
  }
  const inserted=await client.query(
   'INSERT INTO community_pgce_governance_2027(establishment_id,school_year,stage,draft_revision,document_ref,document_date,recorded_by) VALUES($1,2027,$2,$3,$4,$5,$6) ON CONFLICT(establishment_id,school_year,stage,draft_revision) DO NOTHING RETURNING recorded_at',
   [establishmentId,data.stage,expectedRevision,data.document_ref,data.document_date,actorId]);
  if(!inserted.rowCount){await client.query('ROLLBACK');return {conflict:true}}
  await client.query('COMMIT');
  return {stage:data.stage,recorded:true,draft_revision:expectedRevision,
   document_ref:data.document_ref,recorded_at:inserted.rows[0].recorded_at,
   status:'document_reference_recorded_unverified',can_publish:false};
 }catch(e){try{await client.query('ROLLBACK')}catch(_){}throw e}
 finally{client.release()}
}
module.exports={validateRecord,dateValid,governanceStatus,recordGovernance};
