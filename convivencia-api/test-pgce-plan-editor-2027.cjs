'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {registerPgcePlanEditor,validateDocument}=require('./pgce-plan-editor-2027.cjs');
const {CLAUSES,AUDIENCES}=require('./pgce-preflight-2027.cjs');
const origin='https://materialeducativochile.cl';
function completeDraft(){
 return {
  school_year:2027,version:'1',establishment_name:'Establecimiento Ficticio',
  rbd:'PILOTO-2027',director:'Dirección del Piloto',responsible:'Convivencia',
  findings:[{id:'H-01',need:'Fortalecer las instancias de buen trato',evidence_refs:['REPORTE-AGREGADO-001']}],
  diagnostic_sources:AUDIENCES.map(a=>({audience:a,method:'Consulta de ejemplo',evidence_ref:'ACTA-'+a}))
  .concat([{audience:'institutional_records',method:'Acta institucional',evidence_ref:'ACTA-CONTEXTO'}]),
  participation:AUDIENCES.map(a=>({audience:a,date:'2027-03-15',summary:'Participación ficticia del estamento',evidence_ref:'ACTA-'+a})),
  actions:CLAUSES.map(c=>({
   clause:c,title:'Acción '+c,objective:'Mejorar la convivencia',strategy:'Formación y actividades',
   responsible:'Equipo institucional',indicator:'Acciones realizadas',baseline:'0 acciones',
   target:'Al menos 80% ejecutadas',place:'Dependencias educativas',
   resources:'Horas y material',expected_evidence:'Acta y registro',start_date:'2027-03-01',
   end_date:'2027-11-30',finding_ids:['H-01']
  })),
  council_school:{report_ref:'ACTA-CONSEJO-001',feedback_or_justification:'Se respondió a las observaciones'},
  policy_alignment:'Política 2024-2030',pei_alignment:'Proyecto educativo',rie_alignment:'Reglamento interno',
  pme_alignment:'PME vigente',
  diffusion:{channels:'Reuniones y medios internos',calendar:'Marzo a diciembre 2027',delivery_record_plan:'Registro de entrega'},
  follow_up:{frequency:'M1 M2 M3',responsible:'Equipo de convivencia',evaluation_method:'Revisión de indicadores'},
  director_approval:null
 };
}
test('editor PGCE 2027: multi colegio, ediciones con revisión y sólo Dirección puede aprobar',async()=>{
 const db=new PGlite();let server;
 process.env.MEC_COMMUNITY_SURVEYS_ENABLED='1';
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'community-surveys.sql'),'utf8'));
  const query=(...a)=>db.query(...a);
  const pool={query,connect:async()=>({query,release(){}})};
  const est1=(await query("insert into establishments(name,rbd) values('Ficticio A','TEST-A') returning id")).rows[0].id;
  const est2=(await query("insert into establishments(name,rbd) values('Ficticio B','TEST-B') returning id")).rows[0].id;
  async function user(est,role,i){
   const x=await query("insert into users(establishment_id,email,name,role) values($1,$2,$3,$4) returning id",
    [est,'role'+i+'@test.invalid','Profesional Ficticio '+i,role]);
   return Number(x.rows[0].id);
  }
  const coord=await user(est1,'coordinador_convivencia',1),director=await user(est1,'director',2);
  const prof=await user(est1,'profesor',3),other=await user(est2,'director',4);
  const actors={
   coord:{id:coord,est:est1,role:'coordinador_convivencia'},
   director:{id:director,est:est1,role:'director'},
   prof:{id:prof,est:est1,role:'profesor'},
   other:{id:other,est:est2,role:'director'}
  };
  const app=express();app.use(express.json({limit:'120kb'}));
  const guard=(...roles)=>[(req,res,next)=>{
   const actor=Object.values(actors).find(x=>String(x.id)===req.headers['x-test-user']);
   if(!actor||!roles.includes(actor.role))return res.status(403).json({ok:false,error:'role_forbidden'});
   req.auth={id:actor.id,establishment_id:actor.est,role:actor.role};next();
  }];
  assert.equal(registerPgcePlanEditor({app,pool,requireRole:guard,allowedOrigins:new Set([origin])}),true);
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const url='http://127.0.0.1:'+server.address().port;
  const call=async(method,p,body,who=actors.coord,requestOrigin=origin)=>{
   const r=await fetch(url+p,{method,headers:{'Content-Type':'application/json',
    Origin:requestOrigin,'x-test-user':String(who.id)},body:body===undefined?undefined:JSON.stringify(body)});
   return {code:r.status,data:await r.json()};
  };
  const route='/api/community-surveys/pgce-plan';
  let r=await call('GET',route+'?school_year=2027');assert.equal(r.code,200);assert.equal(r.data.exists,false);
  r=await call('POST',route,{school_year:2027,expected_revision:0,document:completeDraft()},actors.prof);
  assert.equal(r.code,403);
  const incomplete=completeDraft();incomplete.actions[0].indicator='';
  r=await call('POST',route,{school_year:2027,expected_revision:0,document:incomplete});
  assert.equal(r.code,200);assert.equal(r.data.revision,1);assert.equal(r.data.status,'draft');
  r=await call('POST',route+'/approve',{school_year:2027,expected_revision:1,approval_document_ref:'ACTA-DIR-01'},actors.director);
  assert.equal(r.code,422);assert.equal(r.data.error,'incomplete_plan');
  r=await call('POST',route,{school_year:2027,expected_revision:1,document:completeDraft()},actors.coord,'https://maliciosa.invalid');
  assert.equal(r.code,403);
  r=await call('POST',route,{school_year:2027,expected_revision:0,document:completeDraft()});
  assert.equal(r.code,409);assert.equal(r.data.error,'revision_conflict');
  r=await call('POST',route,{school_year:2027,expected_revision:1,document:completeDraft()});
  assert.equal(r.code,200);assert.equal(r.data.revision,2);assert.equal(r.data.status,'ready_for_review');
  r=await call('GET',route+'?school_year=2027',undefined,actors.other);
  assert.equal(r.code,200);assert.equal(r.data.exists,false);
  r=await call('POST',route+'/approve',{school_year:2027,expected_revision:2,approval_document_ref:'ACTA-DIR-01'},actors.coord);
  assert.equal(r.code,403);
  r=await call('POST',route+'/approve',{school_year:2027,expected_revision:2,approval_document_ref:'ACTA-DIR-01'},actors.director);
  assert.equal(r.code,200);assert.equal(r.data.status,'approved');assert.equal(r.data.revision,3);
  r=await call('POST',route,{school_year:2027,expected_revision:3,document:completeDraft()});
  assert.equal(r.code,409);assert.equal(r.data.error,'approved_plan_immutable');
  r=await call('GET',route+'?school_year=2027',undefined,actors.coord);
  assert.equal(r.data.status,'approved');
  assert.equal(r.data.document.director_approval.approval_document_ref,'ACTA-DIR-01');
  assert.ok(!JSON.stringify(r.data).includes('Profesional Ficticio'));
  r=await call('GET',route+'/history?school_year=2027');
  assert.equal(r.code,200);
  assert.deepEqual(r.data.history.map(x=>x.action),['approved','edited','created']);
  r=await call('GET',route+'/history?school_year=2027',undefined,actors.other);
  assert.equal(r.code,200);assert.equal(r.data.history.length,0);
  console.log('PGCE_DRAFTS_2027 PASSED: versiones, roles, aprobación documental y aislamiento');
 }finally{
  delete process.env.MEC_COMMUNITY_SURVEYS_ENABLED;
  if(server)await new Promise(resolve=>server.close(resolve));
  await db.close();
 }
});
test('documentos 2027 no deben transportar RUN ni permisos de aprobación desde el cliente',()=>{
 const d=completeDraft();d.director_approval={approval_document_ref:'FALSIFICADO',date:'2027-01-01'};
 const clean=validateDocument(d);
 assert.equal(clean.director_approval,null);
 const bad=completeDraft();bad.student_id=99;
 assert.throws(()=>validateDocument(bad),/identifiable_data_forbidden/);
 assert.throws(()=>validateDocument({...d,school_year:2026}),/invalid_plan_structure/);
});
