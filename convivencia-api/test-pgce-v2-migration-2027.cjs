'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('migración aditiva conserva los seguimientos anteriores y es idempotente',async()=>{
 const db=new PGlite();
 try{
  const schema=fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8');
  const pilot=fs.readFileSync(path.join(__dirname,'community-surveys.sql'),'utf8');
  await db.exec(schema);
  await db.exec(pilot);
  const school=await db.query(
   "INSERT INTO establishments(name,rbd) VALUES('Colegio legado ficticio','TEST-PGCE-LEGACY') RETURNING id");
  const est=Number(school.rows[0].id);
  const user=await db.query(
   "INSERT INTO users(establishment_id,email,name,role) VALUES($1,'test@invalid.example','Profesional ficticio','coordinador_convivencia') RETURNING id",[est]);
  const actor=Number(user.rows[0].id);
  const raw=JSON.stringify({school_year:2027,actions:[{
   clause:'c',title:'Seguimiento histórico de bienestar',finding_ids:[]}]});
  await db.query("INSERT INTO community_pgce_drafts_2027(establishment_id,draft,updated_by) VALUES($1,$2::jsonb,$3)",
   [est,raw,actor]);
  await db.query("INSERT INTO community_pgce_action_followups_2027(establishment_id,clause,measurement_code,status,progress_percent,evidence_refs,professional_note,updated_by) VALUES($1,'c','M1','in_progress',35,'[\"ACTA-LEGACY-2027\"]'::jsonb,'Evaluación histórica', $2)",
   [est,actor]);
  await db.query("INSERT INTO community_pgce_followup_audit_2027(establishment_id,clause,measurement_code,revision,performed_by) VALUES($1,'c','M1',1,$2)",
   [est,actor]);
  await db.exec(pilot);
  await db.exec(pilot);
  const rows=await db.query(
   "SELECT action_id,clause,measurement_code,revision,progress_percent,evidence_refs FROM community_pgce_action_followups_v2_2027 WHERE establishment_id=$1",
   [est]);
  assert.equal(rows.rowCount,1);
  assert.equal(rows.rows[0].action_id,'ACT-c-001');
  assert.equal(rows.rows[0].progress_percent,35);
  assert.equal(rows.rows[0].measurement_code,'M1');
  assert.deepEqual(rows.rows[0].evidence_refs,['ACTA-LEGACY-2027']);
  const audits=await db.query(
   'SELECT revision,action_id FROM community_pgce_followup_audit_v2_2027 WHERE establishment_id=$1',[est]);
  assert.equal(audits.rowCount,1);
  assert.equal(audits.rows[0].action_id,'ACT-c-001');
  const original=await db.query(
   'SELECT progress_percent FROM community_pgce_action_followups_2027 WHERE establishment_id=$1',[est]);
  assert.equal(original.rows[0].progress_percent,35);
  const draft=await db.query('SELECT draft FROM community_pgce_drafts_2027 WHERE establishment_id=$1',[est]);
  assert.equal(draft.rows[0].draft.actions[0].title,'Seguimiento histórico de bienestar');
 }finally{await db.close()}
});
