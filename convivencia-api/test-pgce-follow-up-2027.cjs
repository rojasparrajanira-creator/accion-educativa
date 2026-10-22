'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const Follow=require('./pgce-follow-up-2027.cjs');
const good=()=>({action_id:'ACT-c-001',clause:'c',measurement_code:'M1',status:'in_progress',
 progress_percent:35,professional_note:'Se efectuó sesión preventiva con respaldo de acta',
 adjustment_note:'Revisar cumplimiento durante M2',evidence_refs:['ACTA-CONVIVENCIA-2027-A']});
test('validaciones del seguimiento impiden aprobación implícita, datos sensibles y cortes inexistentes',()=>{
 assert.equal(Follow.validateFollowup(good()).progress_percent,35);
 assert.throws(()=>Follow.validateFollowup({...good(),measurement_code:'M4'}),/invalid_pgce_followup/);
 assert.throws(()=>Follow.validateFollowup({...good(),action_id:'ACT-z-001',clause:'z'}),/invalid_pgce_followup/);
 assert.throws(()=>Follow.validateFollowup({...good(),action_id:'ACT-b-001'}),/invalid_pgce_followup/);
 assert.throws(()=>Follow.validateFollowup({...good(),action_id:'ACT-c-999999'}),/invalid_pgce_followup/);
 assert.throws(()=>Follow.validateFollowup({...good(),progress_percent:101}),/invalid_pgce_followup/);
 assert.throws(()=>Follow.validateFollowup({...good(),progress_percent:23.2}),/invalid_pgce_followup/);
 assert.throws(()=>Follow.validateFollowup({...good(),status:'completed',progress_percent:90}),/invalid_pgce_followup/);
 assert.throws(()=>Follow.validateFollowup({...good(),professional_note:'Estudiante 12.345.678-9'}),/invalid_pgce_followup/);
 assert.throws(()=>Follow.validateFollowup({...good(),evidence_refs:['ACTA-2027','12.345.678-9']}),/invalid_pgce_followup/);
 assert.throws(()=>Follow.validateFollowup({...good(),director_approval:true}),/invalid_pgce_followup/);
});
test('seguimiento en PostgreSQL aislado: M1/M2/M3, versiones, permisos y separación entre colegios',async()=>{
 const db=new PGlite();
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'community-surveys.sql'),'utf8'));
  const school=await db.query("INSERT INTO establishments(name,rbd) VALUES('Colegio A de prueba','TEST-FOLLOW-A') RETURNING id");
  const other=await db.query("INSERT INTO establishments(name,rbd) VALUES('Colegio B de prueba','TEST-FOLLOW-B') RETURNING id");
  const est=Number(school.rows[0].id),outside=Number(other.rows[0].id);
  const actor=await db.query("INSERT INTO users(establishment_id,email,name,role) VALUES($1,'prof-a@test.invalid','Coordinación Sintética','coordinador_convivencia') RETURNING id",[est]);
  const actorId=Number(actor.rows[0].id);
  const pool={query:(...args)=>db.query(...args),
   connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
  const draft={school_year:2027,actions:[
   {action_id:'ACT-c-001',clause:'c',title:'Acción de buen trato'},
   {action_id:'ACT-c-002',clause:'c',title:'Segunda acción de prevención'}]};
  await pool.query("INSERT INTO community_pgce_drafts_2027(establishment_id,draft) VALUES($1,$2::jsonb)",[est,JSON.stringify(draft)]);
  let saved=await Follow.saveFollowup(pool,{establishmentId:est,actorId,expectedRevision:0,input:good()});
  assert.equal(saved.revision,1);
  assert.equal(saved.can_approve_pgce,false);
  assert.equal((await Follow.listFollowups(pool,est)).length,1);
  saved=await Follow.saveFollowup(pool,{establishmentId:est,actorId,expectedRevision:0,input:good()});
  assert.equal(saved.conflict,true);
  saved=await Follow.saveFollowup(pool,{establishmentId:est,actorId,expectedRevision:1,
   input:{...good(),progress_percent:45}});
  assert.equal(saved.revision,2);
  saved=await Follow.saveFollowup(pool,{establishmentId:est,actorId,expectedRevision:0,
   input:{...good(),measurement_code:'M2',status:'in_progress',progress_percent:70}});
  assert.equal(saved.revision,1);
  saved=await Follow.saveFollowup(pool,{establishmentId:est,actorId,expectedRevision:0,
   input:{...good(),measurement_code:'M3',status:'completed',progress_percent:100}});
  assert.equal(saved.revision,1);
  const secondAction=await Follow.saveFollowup(pool,{establishmentId:est,actorId,expectedRevision:0,
   input:{...good(),action_id:'ACT-c-002',progress_percent:15}});
  assert.equal(secondAction.revision,1);
  const records=await Follow.listFollowups(pool,est);
  assert.equal(records.length,4);
  assert.deepEqual(records.filter(x=>x.action_id==='ACT-c-001').map(x=>x.measurement_code),['M1','M2','M3']);
  assert.equal(records.find(x=>x.action_id==='ACT-c-002').progress_percent,15);
  assert.equal(records[0].progress_percent,45);
  assert.equal((await Follow.listFollowups(pool,outside)).length,0);
  let denied=await Follow.saveFollowup(pool,{establishmentId:outside,actorId,expectedRevision:0,input:good()});
  assert.equal(denied.notFound,true);
  // Aunque el otro colegio cree su borrador, el usuario ajeno no puede escribir.
  await pool.query("INSERT INTO community_pgce_drafts_2027(establishment_id,draft) VALUES($1,$2::jsonb)",[outside,JSON.stringify(draft)]);
  await assert.rejects(Follow.saveFollowup(pool,{establishmentId:outside,actorId,expectedRevision:0,input:good()}),/invalid_pgce_actor/);
  denied=await Follow.saveFollowup(pool,{establishmentId:est,actorId,expectedRevision:0,
   input:{...good(),action_id:'ACT-d-001',clause:'d'}});
  assert.equal(denied.notFound,true);
  const audit=await pool.query('SELECT count(*)::integer AS n FROM community_pgce_followup_audit_v2_2027 WHERE establishment_id=$1',[est]);
  assert.equal(Number(audit.rows[0].n),5);
  assert.ok(!JSON.stringify(records).includes('Coordinación Sintética'));
 }finally{await db.close()}
});
