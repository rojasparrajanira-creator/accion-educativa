'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const Pilot=require('./pgce-pilot-readiness-2027.cjs');
const Review=require('./pgce-export-review-2027.cjs');
test('la lista piloto distingue evidencias documentales y no certifica aprobación',async()=>{
 const db=new PGlite();
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'community-surveys.sql'),'utf8'));
  const schools=await db.query(
   "INSERT INTO establishments(name,rbd) VALUES('Colegio sintético A','PILOT-READY-A'),('Colegio sintético B','PILOT-READY-B') RETURNING id");
  const est=Number(schools.rows[0].id),other=Number(schools.rows[1].id);
  const user=await db.query(
   "INSERT INTO users(establishment_id,name,email,role) VALUES($1,'Profesional ficticio','pilot@invalid.example','coordinador_convivencia') RETURNING id",[est]);
  const actorId=Number(user.rows[0].id);
  const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
  const initial=await Pilot.assessPilotReadiness(pool,est);
  assert.equal(initial.completed_checks,0);
  assert.equal(initial.total_checks,5);
  assert.equal(initial.can_publish,false);
  assert.equal(initial.can_certify_compliance,false);
  assert.equal(initial.status,'manual_review_pending');
  const draft={school_year:2027,director_approval:null,findings:[],actions:[]};
  await db.query('INSERT INTO community_pgce_drafts_2027(establishment_id,draft) VALUES($1,$2::jsonb)',[est,JSON.stringify(draft)]);
  let checklist=await Pilot.assessPilotReadiness(pool,est);
  assert.equal(checklist.completed_checks,1);
  assert.equal(checklist.checks.find(x=>x.code==='editorial_complete').complete,false);
  await db.query(
   "INSERT INTO community_pgce_governance_2027(establishment_id,stage,draft_revision,document_ref,document_date,recorded_by) VALUES($1,'council_review',1,'ACTA-TEST-2027','2027-05-01',$2)",
   [est,actorId]);
  checklist=await Pilot.assessPilotReadiness(pool,est);
  assert.equal(checklist.completed_checks,2);
  const status=await Review.reviewStatus(pool,est);
  await Review.recordReview(pool,{establishmentId:est,actorId,confirmation:true,
   draftRevision:status.draft_revision,followupFingerprint:status.followup_fingerprint});
  checklist=await Pilot.assessPilotReadiness(pool,est);
  assert.equal(checklist.completed_checks,3);
  assert.equal(checklist.checks.find(x=>x.code==='privacy_review').complete,true);
  assert.equal((await Pilot.assessPilotReadiness(pool,other)).completed_checks,0);
  await db.query("UPDATE community_pgce_drafts_2027 SET revision=2 WHERE establishment_id=$1",[est]);
  checklist=await Pilot.assessPilotReadiness(pool,est);
  assert.equal(checklist.completed_checks,1);
  assert.equal(checklist.checks.find(x=>x.code==='privacy_review').complete,false);
  assert.equal(checklist.checks.find(x=>x.code==='council_reference').complete,false);
  assert.equal(checklist.can_publish,false);
 }finally{await db.close()}
});
