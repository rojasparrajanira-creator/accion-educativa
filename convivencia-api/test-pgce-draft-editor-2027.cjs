'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {registerPgceDraftEditor,normalizeDraft}=require('./pgce-draft-editor-2027.cjs');

test('Editor PGCE versionado: roles, colegios independientes, CSRF, datos y aprobación',async()=>{
 const db=new PGlite();let server=null;
 process.env.MEC_COMMUNITY_SURVEYS_ENABLED='1';
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'community-surveys.sql'),'utf8'));
  const school=await db.query("insert into establishments(name,rbd) values ('Colegio Ficticio A','TEST-A-2027') returning id");
  const other=await db.query("insert into establishments(name,rbd) values ('Colegio Ficticio B','TEST-B-2027') returning id");
  const est=Number(school.rows[0].id),estB=Number(other.rows[0].id);
  const users=[];
  for(const [id,name] of [[est,'PROFESIONAL A'],[estB,'PROFESIONAL B']]){
   const q=await db.query("insert into users(establishment_id,email,name,role) values($1,$2,$3,'coordinador_convivencia') returning id",[id,
    'pilot'+id+'@example.test',name]);
   users.push(Number(q.rows[0].id));
  }
  const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
  const app=express();app.use(express.json({limit:'800kb'}));
  const role=(...allowed)=>[(req,res,next)=>{
   if(!allowed.includes(String(req.headers['x-test-role']||'')))return res.status(403).json({ok:false,error:'unauthorized'});
   const schoolId=Number(req.headers['x-test-school']);
   req.auth={establishment_id:schoolId,id:schoolId===estB?users[1]:users[0]};
   next();
  }];
  const throttle=()=>((req,res,next)=>next());
  assert.equal(registerPgceDraftEditor({app,pool,requireRole:role,rateLimit:throttle,
   allowedOrigins:new Set(['https://materialeducativochile.cl'])}),true);
  server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  async function call(method,route,payload,actor={establishmentId:est,role:'coordinador_convivencia',
   origin:'https://materialeducativochile.cl'}){
   const r=await fetch(url+route,{method,headers:{
    'Content-Type':'application/json','Origin':actor.origin,
    'x-test-school':String(actor.establishmentId),'x-test-role':actor.role
   },body:payload===undefined?undefined:JSON.stringify(payload)});
   return {status:r.status,data:await r.json(),headers:r.headers};
  }
  let res=await call('GET','/api/community-surveys/pgce-draft?school_year=2027');
  assert.equal(res.status,200);assert.equal(res.data.revision,0);
  assert.equal(res.data.draft.establishment_name,'Colegio Ficticio A');
  assert.equal(res.data.draft.rbd,'TEST-A-2027');
  assert.equal(res.data.draft.actions.length,7);
  assert.equal(res.data.preflight.status,'draft_incomplete');
  assert.equal(res.data.can_publish,false);
  assert.equal(res.data.draft.director_approval,null);
  assert.equal(res.headers.get('cache-control'),'no-store, max-age=0');
  res=await call('GET','/api/community-surveys/pgce-draft?school_year=2027',undefined,
   {establishmentId:est,role:'docente',origin:'https://materialeducativochile.cl'});
  assert.equal(res.status,403);
  const get=await call('GET','/api/community-surveys/pgce-draft?school_year=2027');
  const draft=get.data.draft;
  draft.establishment_name='SUPLANTAR NOMBRE';
  draft.rbd='RBD FALSO';
  draft.findings=[{id:'H-001',need:'Se requieren acuerdos de buen trato',evidence_refs:['ACTA-DIAG-2027']}];
  draft.actions[0].title='Jornada de revisión de acuerdos';
  draft.actions[0].finding_ids=['H-001'];
  res=await call('POST','/api/community-surveys/pgce-draft',{school_year:2027,expected_revision:0,draft},
   {establishmentId:est,role:'coordinador_convivencia',origin:'https://ajeno.invalid'});
  assert.equal(res.status,403);
  res=await call('POST','/api/community-surveys/pgce-draft',{school_year:2027,expected_revision:0,draft});
  assert.equal(res.status,200);assert.equal(res.data.revision,1);
  assert.equal(res.data.status,'saved_working_draft');
  assert.equal(res.data.can_publish,false);
  assert.equal(res.data.preflight.status,'draft_incomplete');
  const saved=await call('GET','/api/community-surveys/pgce-draft?school_year=2027');
  assert.equal(saved.data.revision,1);
  assert.equal(saved.data.draft.establishment_name,'Colegio Ficticio A');
  assert.equal(saved.data.draft.rbd,'TEST-A-2027');
  assert.equal(saved.data.draft.actions[0].title,'Jornada de revisión de acuerdos');
  assert.equal(saved.data.draft.director_approval,null);
  res=await call('POST','/api/community-surveys/pgce-draft',{school_year:2027,expected_revision:0,draft});
  assert.equal(res.status,409);assert.equal(res.data.error,'revision_conflict');
  const forced={...saved.data.draft,director_approval:{approval_document_ref:'SUPUESTA-APROBACION',date:'2027-08-20'}};
  res=await call('POST','/api/community-surveys/pgce-draft',{school_year:2027,expected_revision:1,draft:forced});
  assert.equal(res.status,400);assert.equal(res.data.error,'approval_not_editable');
  const privateInput=JSON.parse(JSON.stringify(saved.data.draft));
  privateInput.actions[0].objective='Visitar a 12.345.678-9';
  res=await call('POST','/api/community-surveys/pgce-draft',{school_year:2027,expected_revision:1,draft:privateInput});
  assert.equal(res.status,400);assert.equal(res.data.error,'personal_identifiers_not_allowed');
  const extra=JSON.parse(JSON.stringify(saved.data.draft));extra.student_id=1234;
  res=await call('POST','/api/community-surveys/pgce-draft',{school_year:2027,expected_revision:1,draft:extra});
  assert.equal(res.status,400);assert.equal(res.data.error,'unsupported_field');
  const out=await call('GET','/api/community-surveys/pgce-draft?school_year=2027',undefined,
   {establishmentId:estB,role:'coordinador_convivencia',origin:'https://materialeducativochile.cl'});
  assert.equal(out.status,200);assert.equal(out.data.revision,0);
  assert.equal(out.data.draft.establishment_name,'Colegio Ficticio B');
  assert.ok(!JSON.stringify(out.data).includes('Jornada de revisión de acuerdos'));
  const history=await call('GET','/api/community-surveys/pgce-draft/revisions?school_year=2027');
  assert.equal(history.status,200);assert.equal(history.data.revisions.length,1);
  assert.equal(Number(history.data.revisions[0].revision),1);
  assert.ok(!JSON.stringify(history.data).includes('Jornada de revisión de acuerdos'));
  const revisionCount=await db.query('select count(*)::integer n from pgce_2027_draft_revisions where establishment_id=$1',[est]);
  assert.equal(Number(revisionCount.rows[0].n),1);
  const badYear=await call('GET','/api/community-surveys/pgce-draft?school_year=2026');
  assert.equal(badYear.status,400);
  console.log('PGCE_DRAFT_EDITOR_SELFTEST PASSED');
 }finally{
  delete process.env.MEC_COMMUNITY_SURVEYS_ENABLED;
  if(server)await new Promise(resolve=>server.close(resolve));
  await db.close();
 }
});

test('validador rechaza elementos fuera de la estructura y no acepta aprobación desde cliente',()=>{
 const example={
  school_year:2027,version:'borrador',
  findings:[],actions:[],participation:[],diagnostic_sources:[]
 };
 const school={name:'Ensayo',rbd:'ABC'};
 const normalized=normalizeDraft(example,school);
 assert.equal(normalized.establishment_name,'Ensayo');
 assert.equal(normalized.director_approval,null);
 assert.throws(()=>normalizeDraft({...example,school_year:2026},school),/invalid_year/);
 assert.throws(()=>normalizeDraft({...example,actions:[{clause:'z'}]},school),/invalid_clause/);
 assert.throws(()=>normalizeDraft({...example,findings:[{id:'H-001',need:'',evidence_refs:['RUT 12345']}]},school),/invalid_evidence_reference/);
});
