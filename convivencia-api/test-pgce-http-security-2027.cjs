'use strict';
// UAT técnica HTTP completamente aislada: PostgreSQL PGlite, usuarios y actuaciones ficticias.
// Ningún acceso a Render, Google Drive, cuentas reales ni proveedores de pago.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {registerCommunitySurveys}=require('./community-surveys');
const PGCE=require('./pgce-dimensions-integrated-2027.cjs');
const {inspectPgceDraft}=require('./pgce-preflight-2027.cjs');

function completeSyntheticDraft(){
 const p=PGCE.buildPgceScaffold(PGCE.buildDimensionReport()).draft;
 Object.assign(p,{establishment_name:'Colegio sintético A',rbd:'TEST-RBD-A',
  director:'Dirección de prueba',responsible:'Coordinación sintética',
  version:'BORRADOR SIN APROBACIÓN',policy_alignment:'Política educativa ficticia',
  pei_alignment:'Alineación PEI de ensayo',rie_alignment:'Alineación RIE de ensayo'});
 p.findings=[{id:'H-SEG-2027',dimension_id:'SEG',
  need:'Necesidad agregada sintética',evidence_refs:['ACTA-ENSAYO-2027']}];
 for(const action of p.actions)Object.assign(action,{
  title:'Acción ficticia '+action.clause,objective:'Objetivo de ensayo',
  strategy:'Trabajo colaborativo',responsible:'Equipo de ensayo',
  indicator:'Porcentaje de acciones',baseline:'Línea base ficticia',
  target:'Meta referencial',place:'Espacio institucional',
  resources:'Recursos de ensayo',expected_evidence:'ACTA-ENSAYO-2027',
  start_date:'2027-03-01',end_date:'2027-11-30',
  finding_ids:['H-SEG-2027']});
 for(const audience of ['estudiantes','familia','docente','asistente','directivo'])
  p.participation.push({audience,summary:'Consulta grupal simulada',
   evidence_ref:'ACTA-'+audience.toUpperCase()+'-2027',date:'2027-03-02'});
 p.council_school={report_ref:'ACTA-CONSEJO-ENSAYO-2027',
  feedback_or_justification:'Observaciones ficticias'};
 p.diffusion={channels:'Comunicación institucional simulada',
  calendar:'Primer trimestre',delivery_record_plan:'Constancias de prueba'};
 p.follow_up={frequency:'Trimestral',responsible:'Coordinación sintética',
  evaluation_method:'Revisión de evidencias ficticias'};
 return p;
}

test('HTTP institucional: rol, origen, versiones, Consejo, Dirección, privacidad y aislamiento entre escuelas',async()=>{
 const db=new PGlite();
 let server=null;
 const originalFlag=process.env.MEC_COMMUNITY_SURVEYS_ENABLED;
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'community-surveys.sql'),'utf8'));
  const pool={query:(...args)=>db.query(...args),
   connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
  const schools=await db.query(
   "INSERT INTO establishments(name,rbd) VALUES('Escuela de prueba A','TEST-HTTP-A'),('Escuela de prueba B','TEST-HTTP-B') RETURNING id");
  const schoolA=Number(schools.rows[0].id),schoolB=Number(schools.rows[1].id);
  const people=[
   {key:'coordA',est:schoolA,role:'coordinador_convivencia'},
   {key:'directorA',est:schoolA,role:'directora'},
   {key:'profesorA',est:schoolA,role:'profesor'},
   {key:'directorB',est:schoolB,role:'directora'}];
  const sessionUsers=Object.create(null);
  for(const person of people){
   const q=await db.query(
    'INSERT INTO users(establishment_id,email,name,role) VALUES($1,$2,$3,$4) RETURNING id',
    [person.est,person.key+'@invalid.example','Usuario de ensayo '+person.key,person.role]);
   sessionUsers[person.key]={id:Number(q.rows[0].id),est:person.est,role:person.role};
  }
  process.env.MEC_COMMUNITY_SURVEYS_ENABLED='1';
  const app=express();
  app.use(express.json());
  // Estas sesiones se derivan de un registro ficticio del servidor, NO de una
  // cabecera establishment_id arbitraria enviada por el navegador.
  const roles=(...allowed)=>[(req,res,next)=>{
   const person=sessionUsers[String(req.headers['x-pilot-session']||'')];
   if(!person||!allowed.includes(person.role))
    return res.status(403).json({ok:false,error:'role_forbidden'});
   req.auth={id:person.id,establishment_id:person.est,
    canonical_role:person.role};
   next();
  }];
  const allowedOrigins=new Set(['https://materialeducativochile.cl']);
  assert.equal(registerCommunitySurveys({app,pool,requireRole:roles,
   rateLimit:()=>((req,res,next)=>next()),accessStatus:async()=>true,allowedOrigins}),true);
  server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const route=name=>'/api/community-surveys/'+name+'?school_year=2027';
  const request=async(method,name,body,who='coordA',origin='https://materialeducativochile.cl',overrideHeaders={})=>{
   const headers={'Content-Type':'application/json','x-pilot-session':who,...overrideHeaders};
   if(origin!==null)headers.Origin=origin;
   const response=await fetch(base+route(name),{method,headers,
    body:body===undefined?undefined:JSON.stringify(body)});
   const contentType=response.headers.get('content-type')||'';
   const data=/json/.test(contentType)?await response.json():await response.text();
   return {code:response.status,data,headers:response.headers};
  };
  const put=(name,body,who='coordA',origin)=>request('PUT',name,body,who,
   origin===undefined?'https://materialeducativochile.cl':origin);
  const get=(name,who='coordA',headers)=>request('GET',name,undefined,who,null,headers);
  const council={stage:'council_review',document_ref:'ACTA-CE-2027-HTTP',
   document_date:'2027-05-01',confirmation:true};
  const direction={stage:'direction_act',document_ref:'RES-DIR-2027-HTTP',
   document_date:'2027-05-02',confirmation:true};
  const draft=completeSyntheticDraft();
  assert.equal(inspectPgceDraft(draft).status,'ready_for_human_review');
  const initial=await get('pgce-pilot-checklist');
  assert.equal(initial.code,200);
  assert.equal(initial.data.completed_checks,0);
  assert.equal(initial.data.can_publish,false);
  assert.equal((await get('pgce-pilot-checklist','directorB')).data.completed_checks,0);
  assert.equal((await get('pgce-pilot-checklist','profesorA')).code,403);
  assert.equal((await request('GET','pgce-pilot-checklist?school_year=2026',undefined,'coordA',null)).code,400);
  assert.equal((await put('pgce-draft',{expected_revision:0,draft},'coordA',null)).code,403);
  assert.equal((await put('pgce-draft',{expected_revision:0,draft},'coordA','https://malicioso.example')).code,403);
  assert.equal((await put('pgce-draft',{expected_revision:0,draft},'profesorA')).code,403);
  let r=await put('pgce-draft',{expected_revision:0,draft});
  assert.equal(r.code,200,JSON.stringify(r.data));
  assert.equal(r.data.saved_revision,1);
  assert.equal(r.data.can_publish,false);
  assert.equal((await get('pgce-pilot-checklist')).data.completed_checks,2);
  r=await put('pgce-governance',{expected_revision:1,record:direction},'directorA');
  assert.equal(r.code,422);
  assert.equal(r.data.council_recorded,false);
  assert.equal((await put('pgce-governance',{expected_revision:1,record:council},'profesorA')).code,403);
  assert.equal((await put('pgce-governance',{expected_revision:1,record:council},'coordA',null)).code,403);
  assert.equal((await put('pgce-governance',{expected_revision:1,record:council},'coordA','https://evil.example')).code,403);
  assert.equal((await put('pgce-governance',{expected_revision:1,record:council},'directorB')).code,403);
  r=await put('pgce-governance',{expected_revision:1,record:council});
  assert.equal(r.code,200,JSON.stringify(r.data));
  assert.equal(r.data.can_publish,false);
  r=await put('pgce-governance',{expected_revision:1,record:direction});
  assert.equal(r.code,403);
  assert.equal(r.data.error,'pgce_governance_forbidden');
  r=await put('pgce-governance',{expected_revision:1,record:direction},'directorA');
  assert.equal(r.code,200,JSON.stringify(r.data));
  assert.equal(r.data.can_certify_compliance,false);
  assert.equal((await put('pgce-governance',{expected_revision:1,record:direction},'directorA')).code,409);
  const governanceA=await get('pgce-governance');
  assert.equal(governanceA.code,200);
  assert.equal(governanceA.data.stages.council_review.current,true);
  assert.equal(governanceA.data.stages.direction_act.current,true);
  assert.equal(governanceA.data.can_publish,false);
  assert.equal(governanceA.data.can_certify_compliance,false);
  const governanceB=await get('pgce-governance','directorB');
  assert.equal(governanceB.code,200);
  assert.equal(governanceB.data.stages.council_review.current,false);
  assert.equal(governanceB.data.stages.direction_act.current,false);
  assert.equal((await get('pgce-pilot-checklist')).data.completed_checks,4);
  assert.equal((await get('pgce-pilot-checklist','directorB')).data.completed_checks,0);
  // La revisión de privacidad sólo autoriza la exportación de la revisión actual.
  const status=await get('pgce-export-review');
  assert.equal(status.code,200);
  assert.equal(status.data.can_export,false);
  const privacy={draft_revision:status.data.draft_revision,
   followup_fingerprint:status.data.followup_fingerprint,confirmation:true};
  assert.equal((await put('pgce-export-review',privacy,'coordA',null)).code,403);
  r=await put('pgce-export-review',privacy);
  assert.equal(r.code,200,JSON.stringify(r.data));
  assert.equal(r.data.can_export,true);
  const complete=await get('pgce-pilot-checklist');
  assert.equal(complete.data.completed_checks,5);
  assert.equal(complete.data.total_checks,5);
  assert.equal(complete.data.status,'manual_review_pending');
  assert.equal(complete.data.can_publish,false);
  assert.equal(complete.data.can_certify_compliance,false);
  assert.ok(!JSON.stringify(complete.data).includes('ACTA-CE-2027-HTTP'));
  // Al editar el borrador se invalidan las constancias anteriores y privacidad.
  const updated=JSON.parse(JSON.stringify(draft));
  updated.actions[0].title+=' ajustada';
  r=await put('pgce-draft',{expected_revision:1,draft:updated});
  assert.equal(r.code,200);
  assert.equal(r.data.saved_revision,2);
  assert.equal((await put('pgce-draft',{expected_revision:1,draft:updated})).code,409);
  const stale=await get('pgce-governance');
  assert.equal(stale.code,200);
  assert.equal(stale.data.stages.council_review.status,'document_reference_stale');
  assert.equal(stale.data.stages.direction_act.status,'document_reference_stale');
  assert.equal(stale.data.stages.council_review.document_ref,null);
  assert.equal(stale.data.stages.direction_act.document_ref,null);
  assert.equal((await get('pgce-export-review')).data.can_export,false);
  const postChange=await get('pgce-pilot-checklist');
  assert.equal(postChange.data.completed_checks,2);
  assert.equal(postChange.data.can_publish,false);
  assert.equal((await put('pgce-governance',{expected_revision:1,record:direction},'directorA')).code,409);
  assert.equal((await get('pgce-pilot-checklist','directorB')).data.completed_checks,0);
  const persisted=await db.query('SELECT stage,draft_revision FROM community_pgce_governance_2027 WHERE establishment_id=$1',[schoolA]);
  assert.equal(persisted.rowCount,2);
  const others=await db.query('SELECT count(*)::int n FROM community_pgce_governance_2027 WHERE establishment_id=$1',[schoolB]);
  assert.equal(others.rows[0].n,0);
  console.log('PGCE 2027 HTTP UAT SAFE: authentic synthetic sessions, RBAC, school isolation, origin checks, Council/Direction/Privacy and stale revisions.');
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  if(originalFlag===undefined)delete process.env.MEC_COMMUNITY_SURVEYS_ENABLED;
  else process.env.MEC_COMMUNITY_SURVEYS_ENABLED=originalFlag;
  await db.close();
 }
});
