'use strict';
const crypto=require('node:crypto');
// La constancia caduca al cambiar el borrador o cualquier seguimiento.
// Es un control humano de resguardo, NO una aprobación de Dirección.
const good=n=>Number.isSafeInteger(n)&&n>0;
function reject(){throw Error('invalid_export_review')}
function signature(draftRevision,records){
 if(!good(draftRevision)||!Array.isArray(records))reject();
 const clean=records.map(r=>[
  String(r.action_id),String(r.measurement_code),Number(r.revision)
 ]).sort((a,b)=>a.join('|').localeCompare(b.join('|')));
 return crypto.createHash('sha256').update(JSON.stringify({draftRevision,records:clean})).digest('hex');
}
async function readSnapshot(pool,establishmentId){
 if(!good(establishmentId))reject();
 const dr=await pool.query(
  'SELECT revision FROM community_pgce_drafts_2027 WHERE establishment_id=$1 AND school_year=2027',
  [establishmentId]);
 if(!dr.rowCount)return null;
 const fr=await pool.query(
  'SELECT action_id,measurement_code,revision FROM community_pgce_action_followups_v2_2027 WHERE establishment_id=$1 AND school_year=2027 ORDER BY action_id,measurement_code',
  [establishmentId]);
 const draftRevision=Number(dr.rows[0].revision);
 return {draft_revision:draftRevision,followup_fingerprint:signature(draftRevision,fr.rows)};
}
async function reviewStatus(pool,establishmentId){
 const snapshot=await readSnapshot(pool,establishmentId);
 if(!snapshot)return {can_export:false,draft_revision:0,followup_fingerprint:null,
  status:'save_draft_first',reviewed_at:null};
 const r=await pool.query(
  'SELECT draft_revision,followup_fingerprint,reviewed_at FROM community_pgce_export_reviews_2027 WHERE establishment_id=$1 AND school_year=2027',
  [establishmentId]);
 const last=r.rows[0];
 const canExport=!!last&&Number(last.draft_revision)===snapshot.draft_revision&&
  last.followup_fingerprint===snapshot.followup_fingerprint;
 return {...snapshot,can_export:canExport,
  status:canExport?'privacy_review_current':'privacy_review_required',
  reviewed_at:canExport?last.reviewed_at:null};
}
async function recordReview(pool,{establishmentId,actorId,confirmation,draftRevision,followupFingerprint}){
 if(!good(establishmentId)||!good(actorId)||confirmation!==true||
  !good(draftRevision)||typeof followupFingerprint!=='string'||
  !/^[0-9a-f]{64}$/.test(followupFingerprint))reject();
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const actor=await client.query(
   'SELECT 1 FROM users WHERE id=$1 AND establishment_id=$2 AND active=true',
   [actorId,establishmentId]);
  if(!actor.rowCount)throw Error('invalid_export_reviewer');
  const current=await readSnapshot(client,establishmentId);
  if(!current||current.draft_revision!==draftRevision||
   current.followup_fingerprint!==followupFingerprint){
   await client.query('ROLLBACK');return {conflict:true};
  }
  await client.query(
   'INSERT INTO community_pgce_export_reviews_2027 (establishment_id,school_year,draft_revision,followup_fingerprint,reviewed_by,reviewed_at) VALUES($1,2027,$2,$3,$4,now()) ON CONFLICT(establishment_id,school_year) DO UPDATE SET draft_revision=excluded.draft_revision,followup_fingerprint=excluded.followup_fingerprint,reviewed_by=excluded.reviewed_by,reviewed_at=now()',
   [establishmentId,draftRevision,followupFingerprint,actorId]);
  await client.query(
   "INSERT INTO community_pgce_export_audit_2027 (establishment_id,school_year,action,draft_revision,followup_fingerprint,performed_by) VALUES($1,2027,'privacy_reviewed',$2,$3,$4)",
   [establishmentId,draftRevision,followupFingerprint,actorId]);
  await client.query('COMMIT');
  return {conflict:false,draft_revision:draftRevision,can_export:true};
 }catch(e){try{await client.query('ROLLBACK')}catch(_){}throw e}
 finally{client.release()}
}
async function recordDownload(pool,{establishmentId,actorId,snapshot}){
 if(!good(establishmentId)||!good(actorId)||!snapshot||
  !good(snapshot.draft_revision)||
  !/^[0-9a-f]{64}$/.test(String(snapshot.followup_fingerprint)))reject();
 await pool.query(
  "INSERT INTO community_pgce_export_audit_2027 (establishment_id,school_year,action,draft_revision,followup_fingerprint,performed_by) VALUES($1,2027,'csv_downloaded',$2,$3,$4)",
  [establishmentId,snapshot.draft_revision,snapshot.followup_fingerprint,actorId]);
}
module.exports={signature,readSnapshot,reviewStatus,recordReview,recordDownload};
