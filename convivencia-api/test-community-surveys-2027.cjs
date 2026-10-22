'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {registerCommunitySurveys}=require('./community-surveys');
const {bank,validateAnswers,makeAggregate}=require('./community-surveys-core.cjs');

test('Flujo adulto HTTP en PostgreSQL en memoria: acceso, confidencialidad y separación de establecimientos',async()=>{
 const db=new PGlite();
 let server=null;
 const allowedRoles=new Set(['coordinador_convivencia','dupla_psicosocial','director','directora']);
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'community-surveys.sql'),'utf8'));
  const pool={query:(...args)=>db.query(...args),connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
  async function insert(sql,params=[]){const q=await pool.query(sql,params);return q.rows[0]||{}}
  const school=await insert("insert into establishments(name,rbd) values('Piloto Adulto Ficticio','TEST-EST-A') returning id");
  const other=await insert("insert into establishments(name,rbd) values('Piloto Distinto Ficticio','TEST-EST-B') returning id");
  const est=Number(school.id),estB=Number(other.id);
  const admin=await insert("insert into users(establishment_id,email,name,role) values($1,'admin@test.invalid','Coordinación Ficticia','coordinador_convivencia') returning id",[est]);
  const staff=[];
  for(let i=1;i<=10;i++){
   const u=await insert("insert into users(establishment_id,email,name,role) values($1,$2,$3,'profesor') returning id",
   [est,'profesor'+i+'@test.invalid','Docente Ficticio '+i]);
   staff.push(Number(u.id));
  }
  const otherStaff=await insert("insert into users(establishment_id,email,name,role) values($1,'doc@test.invalid','Docente Externo Ficticio','profesor') returning id",[estB]);
  const course=await insert("insert into courses(establishment_id,name,school_year) values($1,'7° A',2027) returning id",[est]);
  const student=await insert("insert into students(establishment_id,course_id,rut,name) values($1,$2,'90000001-1','ESTUDIANTE DE PRUEBA') returning id",[est,course.id]);
  const otherCourse=await insert("insert into courses(establishment_id,name,school_year) values($1,'7° A',2027) returning id",[estB]);
  const otherStudent=await insert("insert into students(establishment_id,course_id,rut,name) values($1,$2,'90000002-2','ESTUDIANTE EXTERNO DE PRUEBA') returning id",[estB,otherCourse.id]);
  process.env.MEC_COMMUNITY_SURVEYS_ENABLED='1';
  const app=express();app.use(express.json());
  const roleMiddleware=(...allowed)=>[
   (req,res,next)=>{
    const id=Number(req.headers['x-test-establishment']||0);
    const role=String(req.headers['x-test-role']||'');
    if(!allowed.includes(role)||!allowedRoles.has(role))return res.status(403).json({ok:false,error:'role_forbidden'});
    req.auth={id:admin.id,establishment_id:id,canonical_role:role};
    next();
   }
  ];
  const rateLimit=()=>((req,res,next)=>next()); // la limitación pública real vive en server.js
  assert.equal(registerCommunitySurveys({app,pool,requireRole:roleMiddleware,rateLimit,accessStatus:async()=>true,allowedOrigins:new Set(['https://materialeducativochile.cl'])}),true);
  server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  const call=async(method,route,body,who={est,role:'coordinador_convivencia'},token)=>{
   const headers={'Content-Type':'application/json','Origin':who.origin||'https://materialeducativochile.cl','x-test-establishment':String(who.est),'x-test-role':who.role};
   if(token)headers['X-Community-Access']=token;
   const r=await fetch(url+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
   const data=await r.json();return {code:r.status,data,headers:r.headers};
  };
  const issue=(audience,opts={},who)=>call('POST','/api/community-surveys/invitations',{school_year:2027,audience,...opts},who);
  const familyPayload={student_id:Number(student.id),guardian_slot:1,verification_reference:'ACTA-ENSAYO-2027-01',relation_verified:true};
  let r=await issue('familia',familyPayload,{est,role:'profesor'});assert.equal(r.code,403);
  // Ninguna llamada profesional puede modificar invitaciones desde orígenes ajenos.
  r=await issue('familia',familyPayload,{est,role:'coordinador_convivencia',origin:'https://sitio-ajeno.example'});
  assert.equal(r.code,403);assert.equal(r.data.error,'origin_forbidden');
  // El listado institucional está disponible solo para el equipo y nunca revela RUN.
  r=await call('GET','/api/community-surveys/targets?audience=familia',undefined,{est,role:'profesor'});
  assert.equal(r.code,403);
  r=await call('GET','/api/community-surveys/targets?audience=familia');
  assert.equal(r.code,200);assert.equal(r.data.targets.length,1);
  assert.equal(Number(r.data.targets[0].id),Number(student.id));
  assert.ok(!JSON.stringify(r.data).includes('90000001'));
  r=await call('GET','/api/community-surveys/targets?audience=docente');
  assert.equal(r.code,200);assert.equal(r.data.targets.length,10);
  r=await call('GET','/api/community-surveys/targets?audience=familia',undefined,{est:estB,role:'coordinador_convivencia'});
  assert.equal(r.code,200);assert.equal(r.data.targets.length,1);
  assert.equal(Number(r.data.targets[0].id),Number(otherStudent.id));
  assert.ok(!JSON.stringify(r.data).includes('ESTUDIANTE DE PRUEBA'));

  r=await issue('familia',{...familyPayload,relation_verified:false});assert.equal(r.code,400);
  r=await issue('familia',{...familyPayload,student_id:Number(otherStudent.id)});assert.equal(r.code,404);
  r=await issue('docente',{staff_user_id:Number(otherStaff.id)});assert.equal(r.code,404);
  const family=await issue('familia',familyPayload);
  assert.equal(family.code,201);
  assert.match(family.data.invite_code,/^[A-Za-z0-9_-]{32}$/);
  assert.match(family.data.pin,/^\d{8}$/);
  const row=await insert('select code_hash,pin_hash,pin_salt,link_evidence_ref,student_id from community_survey_invitations where id=$1',[family.data.invitation_id]);
  assert.ok(!JSON.stringify(row).includes(family.data.invite_code));
  assert.ok(!JSON.stringify(row).includes(family.data.pin));
  assert.equal(Number(row.student_id),Number(student.id));
  r=await issue('familia',familyPayload);assert.equal(r.code,409);
  const secondFamily=await issue('familia',{...familyPayload,guardian_slot:2,verification_reference:'ACTA-ENSAYO-2027-02'});
  assert.equal(secondFamily.code,201);
  r=await call('POST','/api/community-surveys/redeem',{invite_code:family.data.invite_code,pin:'00000000'});
  assert.equal(r.code,401);
  const redeem=await call('POST','/api/community-surveys/redeem',{invite_code:family.data.invite_code,pin:family.data.pin});
  assert.equal(redeem.code,200);
  assert.equal(redeem.data.questions.length,bank.audiences.familia.items.length);
  assert.ok(!JSON.stringify(redeem.data).includes('90000001'));
  const token=redeem.data.session_token;
  const item=bank.audiences.familia.items[0].id;
  r=await call('POST','/api/community-surveys/submit',{answers:{[item]:7}},undefined,token);
  assert.equal(r.code,400);
  r=await call('POST','/api/community-surveys/submit',{answers:{INVALID_ITEM:5}},undefined,token);
  assert.equal(r.code,400);
  r=await call('POST','/api/community-surveys/submit',{answers:{[item]:4}},undefined,token);
  assert.equal(r.code,201);
  r=await call('POST','/api/community-surveys/submit',{answers:{[item]:1}},undefined,token);
  assert.equal(r.code,401);
  r=await call('POST','/api/community-surveys/redeem',{invite_code:family.data.invite_code,pin:family.data.pin});
  assert.equal(r.code,409);
  const familyReport=await call('GET','/api/community-surveys/report?school_year=2027&audience=familia');
  assert.equal(familyReport.code,200);
  assert.equal(familyReport.data.available,false);
  assert.equal(familyReport.data.items.length,0);
  assert.ok(!('count' in familyReport.data));
  assert.ok(!JSON.stringify(familyReport.data).includes('90000001'));
  r=await call('GET','/api/community-surveys/report?school_year=2027&audience=familia',undefined,{est:estB,role:'coordinador_convivencia'});
  assert.equal(r.code,200);assert.equal(r.data.available,false);
  r=await call('POST','/api/community-surveys/invitations/'+secondFamily.data.invitation_id+'/revoke');
  assert.equal(r.code,200);
  r=await call('POST','/api/community-surveys/redeem',{invite_code:secondFamily.data.invite_code,pin:secondFamily.data.pin});
  assert.equal(r.code,401);
  const validItem=bank.audiences.docente.items[0].id;
  for(const staffId of staff){
   const inv=await issue('docente',{staff_user_id:staffId});
   assert.equal(inv.code,201);
   const auth=await call('POST','/api/community-surveys/redeem',{invite_code:inv.data.invite_code,pin:inv.data.pin});
   assert.equal(auth.code,200);
   const submitted=await call('POST','/api/community-surveys/submit',{answers:{[validItem]:5}},undefined,auth.data.session_token);
   assert.equal(submitted.code,201);
  }
  const staffReport=await call('GET','/api/community-surveys/report?school_year=2027&audience=docente');
  assert.equal(staffReport.code,200);
  assert.equal(staffReport.data.available,true);
  assert.equal(staffReport.data.participant_band,'10–14');
  const one=staffReport.data.items.find(x=>x.id===validItem);
  assert.equal(one.favorable_band,'75–100 %');
  assert.equal(staffReport.data.items.find(x=>x.id===bank.audiences.docente.items[1].id).available,false);
  assert.ok(!JSON.stringify(staffReport.data).includes('Docente Ficticio'));
  const diagnostic=await call('GET','/api/community-surveys/diagnostic-draft?school_year=2027');
  assert.equal(diagnostic.code,200);
  assert.equal(diagnostic.data.diagnostic.status,'preliminary_adult_diagnostic_only');
  assert.equal(diagnostic.data.diagnostic.can_approve_pgce,false);
  assert.ok(diagnostic.data.diagnostic.insufficient_or_missing_sources.some(x=>x.audience==='familia'));
  assert.ok(diagnostic.data.diagnostic.sources_used.some(x=>x.audience==='docente'));
  assert.ok(diagnostic.data.diagnostic.legal_links.some(x=>x.audiences_with_aggregated_items.includes('docente')));
  assert.ok(!JSON.stringify(diagnostic.data).includes('90000001'));
  assert.ok(!JSON.stringify(diagnostic.data).includes('Docente Ficticio'));
  const unauthorizedDiagnostic=await call('GET','/api/community-surveys/diagnostic-draft?school_year=2027',undefined,{est,role:'profesor'});
  assert.equal(unauthorizedDiagnostic.code,403);
  const isolatedDiagnostic=await call('GET','/api/community-surveys/diagnostic-draft?school_year=2027',undefined,{est:estB,role:'coordinador_convivencia'});
  assert.equal(isolatedDiagnostic.code,200);
  assert.equal(isolatedDiagnostic.data.diagnostic.sources_used.length,0);
  assert.equal(isolatedDiagnostic.data.diagnostic.review_topics.length,0);
  const dimensions=await call('GET','/api/community-surveys/dimensions?school_year=2027');
  assert.equal(dimensions.code,200);
  assert.equal(dimensions.data.report.dimensions.length,10);
  assert.equal(dimensions.data.report.student_source_status,'not_integrated_yet');
  assert.ok(dimensions.data.report.dimensions.some(x=>x.review_topics.length>0));
  assert.ok(!JSON.stringify(dimensions.data).includes('90000001'));
  assert.ok(!JSON.stringify(dimensions.data).includes('Docente Ficticio'));
  const planStruct=await call('GET','/api/community-surveys/pgce-scaffold?school_year=2027');
  assert.equal(planStruct.code,200);
  assert.equal(planStruct.data.plan.sections.length,7);
  assert.equal(planStruct.data.plan.preflight.status,'draft_incomplete');
  assert.equal(planStruct.data.plan.can_publish,false);
  assert.equal(planStruct.data.plan.draft.director_approval,null);
  assert.ok(!JSON.stringify(planStruct.data).includes('90000001'));
  const forbiddenPlan=await call('GET','/api/community-surveys/pgce-scaffold?school_year=2027',undefined,{est,role:'profesor'});
  assert.equal(forbiddenPlan.code,403);
  const otherDimensions=await call('GET','/api/community-surveys/dimensions?school_year=2027',undefined,{est:estB,role:'coordinador_convivencia'});
  assert.equal(otherDimensions.code,200);
  assert.equal(otherDimensions.data.report.dimensions.filter(x=>x.review_topics.length>0).length,0);
  assert.equal(otherDimensions.data.report.audience_availability.filter(x=>x.available).length,0);
  const otherReport=await call('GET','/api/community-surveys/report?school_year=2027&audience=docente',undefined,{est:estB,role:'coordinador_convivencia'});
  assert.equal(otherReport.data.available,false);
  assert.ok(!('participant_band' in otherReport.data));
  const submittedCount=await insert('select count(*) n from community_survey_submissions where establishment_id=$1',[est]);
  assert.equal(Number(submittedCount.n),11);
  const auditCount=await insert('select count(*) n from community_survey_audit_events where establishment_id=$1',[est]);
  assert.ok(Number(auditCount.n)>=20);
  console.log('COMMUNITY_SURVEYS_SELFTEST PASSED '+JSON.stringify({families_verified:2,staff_completed:10,adult_submissions:11,other_tenant_excluded:true,small_groups_suppressed:true}));
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  delete process.env.MEC_COMMUNITY_SURVEYS_ENABLED;
  await db.close();
 }
});

test('El banco y validador impiden envíos que no sean opciones legales del instrumento',()=>{
 assert.equal(validateAnswers('familia',{[bank.audiences.familia.items[0].id]:'unknown'}),true);
 assert.throws(()=>validateAnswers('familia',{}));
 assert.throws(()=>validateAnswers('familia',{bogus:1}));
 assert.throws(()=>validateAnswers('familia',{[bank.audiences.familia.items[0].id]:0}));
 const a=makeAggregate([{answers:{[bank.audiences.docente.items[0].id]:4}}],'docente');
 assert.equal(a.available,false);
});

test('preinforme institucional nunca transforma respuestas aisladas en plan aprobado',()=>{
 const {makeDiagnosticDraft}=require('./community-surveys-core.cjs');
 const report=makeDiagnosticDraft({});
 assert.equal(report.can_approve_pgce,false);
 assert.equal(report.status,'preliminary_adult_diagnostic_only');
 assert.equal(report.sources_used.length,0);
 assert.equal(report.insufficient_or_missing_sources.length,4);
 assert.equal(report.legal_links.length,7);
 assert.equal(report.review_topics.length,0);
});
