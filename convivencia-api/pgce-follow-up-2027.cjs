'use strict';
// Seguimiento manual de acciones agregadas por corte M1/M2/M3.
// No leer respuestas de alumnos, sumar porcentajes entre niveles ni aprobar planes.
const PERIODS=new Set(['M1','M2','M3']);
const CLAUSES=new Set(['a','b','c','d','e','f','g']);
const STATES=new Set(['pending','in_progress','completed','reprogrammed','suspended']);
const INPUT_KEYS=new Set(['action_id','clause','measurement_code','status','progress_percent',
 'professional_note','adjustment_note','evidence_refs']);
const rutPattern=/(?:^|[^0-9])\d{1,2}\.?\d{3}\.?\d{3}-[\dkK](?:$|[^a-z0-9])/i;
const goodId=n=>Number.isSafeInteger(n)&&n>0;
function reject(){throw Error('invalid_pgce_followup')}
function validateFollowup(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
   Object.keys(input).some(k=>!INPUT_KEYS.has(k))||
   !CLAUSES.has(input.clause)||typeof input.action_id!=='string'||
   !/^ACT-[a-g]-[0-9]{3,5}$/.test(input.action_id)||
   input.action_id.split('-')[1]!==input.clause||
   !PERIODS.has(input.measurement_code)||
   !STATES.has(input.status)||!Number.isInteger(input.progress_percent)||
   input.progress_percent<0||input.progress_percent>100||
   (input.status==='completed'&&input.progress_percent!==100))reject();
 const professional_note=input.professional_note===undefined?'':input.professional_note;
 const adjustment_note=input.adjustment_note===undefined?'':input.adjustment_note;
 const evidence_refs=input.evidence_refs===undefined?[]:input.evidence_refs;
 if(typeof professional_note!=='string'||professional_note.length>1500||
  typeof adjustment_note!=='string'||adjustment_note.length>1500||
  !Array.isArray(evidence_refs)||evidence_refs.length>12||
  evidence_refs.some(v=>typeof v!=='string'||!v.trim()||v.length>120)||
  [professional_note,adjustment_note,...evidence_refs].some(v=>rutPattern.test(v)))reject();
 return {action_id:input.action_id,clause:input.clause,measurement_code:input.measurement_code,
  status:input.status,progress_percent:input.progress_percent,
  professional_note:professional_note.trim(),adjustment_note:adjustment_note.trim(),
  evidence_refs:evidence_refs.map(x=>x.trim())};
}
async function listFollowups(pool,establishmentId){
 if(!goodId(establishmentId))reject();
 const r=await pool.query(
  'SELECT action_id,clause,measurement_code,revision,status,progress_percent,evidence_refs,professional_note,adjustment_note,updated_at FROM community_pgce_action_followups_v2_2027 WHERE establishment_id=$1 AND school_year=2027 ORDER BY clause,action_id,measurement_code',
  [establishmentId]);
 return r.rows.map(x=>({...x,revision:Number(x.revision),
  progress_percent:Number(x.progress_percent)}));
}
async function saveFollowup(pool,{establishmentId,actorId,expectedRevision,input}){
 if(!goodId(establishmentId)||!goodId(actorId)||
   !Number.isSafeInteger(expectedRevision)||expectedRevision<0)reject();
 const data=validateFollowup(input);
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  // Bloquea el borrador anual para que la verificación no compita con una edición.
  const d=await client.query(
   'SELECT draft FROM community_pgce_drafts_2027 WHERE establishment_id=$1 AND school_year=2027 FOR UPDATE',
   [establishmentId]);
  if(!d.rowCount||!Array.isArray(d.rows[0].draft?.actions)||
   !d.rows[0].draft.actions.some(a=>
    (a.action_id||('ACT-'+a.clause+'-001'))===data.action_id&&
    a.clause===data.clause&&typeof a.title==='string'&&a.title.trim())){
   await client.query('ROLLBACK');return {notFound:true};
  }
  const actor=await client.query(
   'SELECT 1 FROM users WHERE id=$1 AND establishment_id=$2 AND active=true',
   [actorId,establishmentId]);
  if(!actor.rowCount)throw Error('invalid_pgce_actor');
  let q;
  const params=[establishmentId,data.action_id,data.clause,data.measurement_code,
   data.status,data.progress_percent,JSON.stringify(data.evidence_refs),
   data.professional_note,data.adjustment_note,actorId];
  if(expectedRevision===0){
   q=await client.query(
    "INSERT INTO community_pgce_action_followups_v2_2027(establishment_id,school_year,action_id,clause,measurement_code,revision,status,progress_percent,evidence_refs,professional_note,adjustment_note,updated_by) VALUES($1,2027,$2,$3,$4,1,$5,$6,$7::jsonb,$8,$9,$10) ON CONFLICT(establishment_id,school_year,action_id,measurement_code) DO NOTHING RETURNING revision,updated_at",
    params);
  }else{
   q=await client.query(
    "UPDATE community_pgce_action_followups_v2_2027 SET status=$5,progress_percent=$6,evidence_refs=$7::jsonb,professional_note=$8,adjustment_note=$9,updated_by=$10,revision=revision+1,updated_at=now() WHERE establishment_id=$1 AND school_year=2027 AND action_id=$2 AND clause=$3 AND measurement_code=$4 AND revision=$11 RETURNING revision,updated_at",
    [...params,expectedRevision]);
  }
  if(!q.rowCount){await client.query('ROLLBACK');return {conflict:true}}
  const revision=Number(q.rows[0].revision);
  await client.query(
   'INSERT INTO community_pgce_followup_audit_v2_2027(establishment_id,school_year,action_id,clause,measurement_code,revision,performed_by) VALUES($1,2027,$2,$3,$4,$5,$6)',
   [establishmentId,data.action_id,data.clause,data.measurement_code,revision,actorId]);
  await client.query('COMMIT');
  return {revision,updated_at:q.rows[0].updated_at,status:data.status,
   progress_percent:data.progress_percent,action_id:data.action_id,clause:data.clause,
   measurement_code:data.measurement_code,can_approve_pgce:false};
 }catch(e){try{await client.query('ROLLBACK')}catch(_){}throw e}
 finally{client.release()}
}
module.exports={validateFollowup,listFollowups,saveFollowup};
