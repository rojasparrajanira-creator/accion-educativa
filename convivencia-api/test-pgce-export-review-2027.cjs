'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const Review=require('./pgce-export-review-2027.cjs');
test('revisión de privacidad vinculada a revisiones de borrador y seguimiento, sin autorización a otros colegios',async()=>{
 const db=new PGlite();
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'community-surveys.sql'),'utf8'));
  const s=await db.query("INSERT INTO establishments(name,rbd) VALUES('Colegio ficticio A','PGCE-REVIEW-A'),('Colegio ficticio B','PGCE-REVIEW-B') RETURNING id");
  const est=Number(s.rows[0].id),other=Number(s.rows[1].id);
  const u=await db.query("INSERT INTO users(establishment_id,email,name,role) VALUES($1,'privacy-a@test.invalid','Profesional ficticio','coordinador_convivencia') RETURNING id",[est]);
  const actorId=Number(u.rows[0].id);
  const pool={query:(...a)=>db.query(...a),connect:async()=>({query:(...a)=>db.query(...a),release(){}})};
  let status=await Review.reviewStatus(pool,est);
  assert.equal(status.can_export,false);assert.equal(status.status,'save_draft_first');
  const draft={school_year:2027,findings:[],actions:[{action_id:'ACT-c-001',clause:'c',title:'Acción ficticia'}]};
  await db.query("INSERT INTO community_pgce_drafts_2027(establishment_id,draft) VALUES($1,$2::jsonb)",[est,JSON.stringify(draft)]);
  status=await Review.reviewStatus(pool,est);
  assert.equal(status.can_export,false);
  assert.match(status.followup_fingerprint,/^[a-f0-9]{64}$/);
  const req={establishmentId:est,actorId,draftRevision:status.draft_revision,
   followupFingerprint:status.followup_fingerprint,confirmation:true};
  await assert.rejects(Review.recordReview(pool,{...req,confirmation:false}),/invalid_export_review/);
  const otherSchool=await db.query("INSERT INTO community_pgce_drafts_2027(establishment_id,draft) VALUES($1,$2::jsonb) RETURNING establishment_id",[other,JSON.stringify(draft)]);
  assert.equal(otherSchool.rowCount,1);
  const otherStatus=await Review.reviewStatus(pool,other);
  await assert.rejects(Review.recordReview(pool,{...req,establishmentId:other,
   draftRevision:otherStatus.draft_revision,followupFingerprint:otherStatus.followup_fingerprint}),/invalid_export_reviewer/);
  const approved=await Review.recordReview(pool,req);
  assert.equal(approved.can_export,true);
  status=await Review.reviewStatus(pool,est);
  assert.equal(status.can_export,true);
  await Review.recordDownload(pool,{establishmentId:est,actorId,snapshot:status});
  assert.equal((await Review.reviewStatus(pool,other)).can_export,false);
  await db.query("UPDATE community_pgce_drafts_2027 SET revision=2 WHERE establishment_id=$1",[est]);
  status=await Review.reviewStatus(pool,est);
  assert.equal(status.can_export,false);
  const stale=await Review.recordReview(pool,req);
  assert.equal(stale.conflict,true);
  await Review.recordReview(pool,{...req,draftRevision:status.draft_revision,followupFingerprint:status.followup_fingerprint});
  assert.equal((await Review.reviewStatus(pool,est)).can_export,true);
  await db.query("INSERT INTO community_pgce_action_followups_v2_2027(establishment_id,action_id,clause,measurement_code,status,progress_percent) VALUES($1,'ACT-c-001','c','M1','in_progress',40)",[est]);
  status=await Review.reviewStatus(pool,est);
  assert.equal(status.can_export,false);
  await Review.recordReview(pool,{...req,draftRevision:status.draft_revision,followupFingerprint:status.followup_fingerprint});
  assert.equal((await Review.reviewStatus(pool,est)).can_export,true);
  await db.query("UPDATE community_pgce_action_followups_v2_2027 SET revision=revision+1,progress_percent=50 WHERE establishment_id=$1",[est]);
  status=await Review.reviewStatus(pool,est);
  assert.equal(status.can_export,false);
  const audit=await db.query("SELECT action FROM community_pgce_export_audit_2027 WHERE establishment_id=$1 ORDER BY id",[est]);
  assert.deepEqual(audit.rows.map(x=>x.action),['privacy_reviewed','csv_downloaded','privacy_reviewed','privacy_reviewed']);
 }finally{await db.close()}
});
test('huella de revisión independiente del orden de los registros y sensible a versiones',()=>{
 const a=[{action_id:'ACT-c-001',measurement_code:'M2',revision:2},
  {action_id:'ACT-c-001',measurement_code:'M1',revision:1}];
 const b=a.slice().reverse();
 assert.equal(Review.signature(2,a),Review.signature(2,b));
 assert.notEqual(Review.signature(2,a),Review.signature(3,a));
 assert.notEqual(Review.signature(2,a),Review.signature(2,[{...a[0],revision:3},a[1]]));
});
