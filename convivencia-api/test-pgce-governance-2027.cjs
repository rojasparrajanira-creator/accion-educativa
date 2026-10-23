'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const G=require('./pgce-governance-2027.cjs');
const P=require('./pgce-dimensions-integrated-2027.cjs');
const {inspectPgceDraft}=require('./pgce-preflight-2027.cjs');
function completePlan(){
 const p=P.buildPgceScaffold(P.buildDimensionReport()).draft;
 Object.assign(p,{establishment_name:'Escuela sintética',rbd:'RBD-TEST-27',
  director:'Dirección de prueba',responsible:'Convivencia',
  version:'BORRADOR PARA REVISIÓN',policy_alignment:'Referencia institucional',
  pei_alignment:'Articulación PEI',rie_alignment:'Articulación RIE'});
 p.findings=[{id:'H-SEG-2027',dimension_id:'SEG',
  need:'Necesidad colectiva sintética',evidence_refs:['ACTA-SINTETICA-2027']}];
 for(const a of p.actions)Object.assign(a,{
  title:'Acción ficticia '+a.clause,objective:'Objetivo sintético',
  strategy:'Trabajo colaborativo',responsible:'Equipo institucional',
  indicator:'Cumplimiento de actividades',baseline:'Diagnóstico inicial',
  target:'Meta institucional',place:'Sala de reunión',resources:'Recursos institucionales',
  expected_evidence:'ACTA-TEST-2027',start_date:'2027-03-01',
  end_date:'2027-11-30',finding_ids:['H-SEG-2027']
 });
 for(const audience of ['estudiantes','familia','docente','asistente','directivo']){
  p.participation.push({audience,summary:'Consulta colectiva simulada',
   evidence_ref:'ACTA-'+audience.toUpperCase()+'-2027',date:'2027-03-02'});
 }
 p.council_school={report_ref:'ACTA-CONSEJO-2027',feedback_or_justification:'Observaciones sintetizadas'};
 p.diffusion={channels:'Comunicaciones institucionales',calendar:'Primer trimestre',
  delivery_record_plan:'Registro institucional planificado'};
 p.follow_up={frequency:'Trimestral',responsible:'Equipo de convivencia',
  evaluation_method:'Análisis profesional de evidencias'};
 return p;
}
test('validador solo acepta referencias documentales seguras y fechas reales',()=>{
 assert.deepEqual(G.validateRecord({stage:'council_review',document_ref:'ACTA-CE-2027-001',
  document_date:'2027-05-01',confirmation:true}),
 {stage:'council_review',document_ref:'ACTA-CE-2027-001',document_date:'2027-05-01'});
 for(const document_date of ['2027-02-30','2027-13-01','2027-00-10','2037-04-31']){
  assert.throws(()=>G.validateRecord({stage:'council_review',document_ref:'ACTA-CE-2027',
   document_date,confirmation:true}),/invalid_pgce_governance/);
 }
 assert.throws(()=>G.validateRecord({stage:'direction_act',document_ref:'12.345.678-9',
  document_date:'2027-05-01',confirmation:true}),/invalid_pgce_governance/);
 assert.throws(()=>G.validateRecord({stage:'direction_act',document_ref:'ACTA-TEST-2027',
  document_date:'2027-05-01',confirmation:false}),/invalid_pgce_governance/);
 assert.throws(()=>G.validateRecord({stage:'direction_act',document_ref:'ACTA-TEST-2027',
  document_date:'2027-05-01',confirmation:true,student_id:1}),/invalid_pgce_governance/);
});
test('Consejo y Dirección: perfiles, estado del borrador, evidencias y aislamiento',async()=>{
 const db=new PGlite();
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'community-surveys.sql'),'utf8'));
  const ins=await db.query("INSERT INTO establishments(name,rbd) VALUES('Escuela A ficticia','PGCE-GOV-A'),('Escuela B ficticia','PGCE-GOV-B') RETURNING id");
  const est=Number(ins.rows[0].id),other=Number(ins.rows[1].id);
  const coord=Number((await db.query(
   "INSERT INTO users(establishment_id,email,name,role) VALUES($1,'govcoord@invalid.example','Coordinador sintético','coordinador_convivencia') RETURNING id",[est])).rows[0].id);
  const director=Number((await db.query(
   "INSERT INTO users(establishment_id,email,name,role) VALUES($1,'govdirector@invalid.example','Directora sintética','directora') RETURNING id",[est])).rows[0].id);
  const outsider=Number((await db.query(
   "INSERT INTO users(establishment_id,email,name,role) VALUES($1,'govother@invalid.example','Directora externa','directora') RETURNING id",[other])).rows[0].id);
  const pool={query:(...p)=>db.query(...p),connect:async()=>({query:(...p)=>db.query(...p),release(){}})};
  const initial=await G.governanceStatus(pool,est);
  assert.equal(initial.draft_revision,0);
  assert.equal(initial.stages.direction_act.current,false);
  const draft=completePlan();
  assert.equal(inspectPgceDraft(draft).status,'ready_for_human_review');
  // Un borrador incompleto no puede tener constancia de Dirección.
  await db.query('INSERT INTO community_pgce_drafts_2027(establishment_id,draft) VALUES($1,$2::jsonb)',[est,JSON.stringify({...draft,findings:[]})]);
  const council={stage:'council_review',document_ref:'ACTA-CE-2027-001',
   document_date:'2027-05-01',confirmation:true};
  const direction={stage:'direction_act',document_ref:'RES-DIR-2027-001',
   document_date:'2027-05-02',confirmation:true};
  let r=await G.recordGovernance(pool,{establishmentId:est,actorId:coord,expectedRevision:1,input:council});
  assert.equal(r.recorded,true);
  r=await G.recordGovernance(pool,{establishmentId:est,actorId:director,expectedRevision:1,input:direction});
  assert.equal(r.notReady,true);
  assert.ok(r.missing.includes('diagnostico.hallazgos'));
  await db.query('UPDATE community_pgce_drafts_2027 SET revision=2,draft=$1::jsonb WHERE establishment_id=$2',[JSON.stringify(draft),est]);
  r=await G.recordGovernance(pool,{establishmentId:est,actorId:director,expectedRevision:2,input:direction});
  assert.equal(r.notReady,true);assert.equal(r.council_recorded,false);
  await assert.rejects(G.recordGovernance(pool,{establishmentId:est,actorId:outsider,expectedRevision:2,input:council}),
   /pgce_governance_forbidden/);
  await assert.rejects(G.recordGovernance(pool,{establishmentId:est,actorId:coord,expectedRevision:2,input:direction}),
   /pgce_governance_forbidden/);
  r=await G.recordGovernance(pool,{establishmentId:est,actorId:coord,expectedRevision:2,input:council});
  assert.equal(r.recorded,true);assert.equal(r.can_publish,false);
  r=await G.recordGovernance(pool,{establishmentId:est,actorId:director,expectedRevision:2,input:direction});
  assert.equal(r.recorded,true);assert.equal(r.status,'document_reference_recorded_unverified');
  let state=await G.governanceStatus(pool,est);
  assert.equal(state.stages.council_review.current,true);
  assert.equal(state.stages.direction_act.current,true);
  assert.equal(state.can_certify_compliance,false);
  const duplicate=await G.recordGovernance(pool,{establishmentId:est,actorId:director,expectedRevision:2,input:direction});
  assert.equal(duplicate.conflict,true);
  assert.equal((await G.governanceStatus(pool,other)).stages.direction_act.current,false);
  await db.query('UPDATE community_pgce_drafts_2027 SET revision=3 WHERE establishment_id=$1',[est]);
  state=await G.governanceStatus(pool,est);
  assert.equal(state.stages.council_review.current,false);
  assert.equal(state.stages.direction_act.current,false);
  assert.equal(state.stages.direction_act.status,'document_reference_stale');
  const stale=await G.recordGovernance(pool,{establishmentId:est,actorId:director,expectedRevision:2,input:direction});
  assert.equal(stale.conflict,true);
  const count=await db.query('SELECT count(*)::int n FROM community_pgce_governance_2027 WHERE establishment_id=$1',[est]);
  assert.equal(count.rows[0].n,3); // consejo v1, consejo v2, Dirección v2
 }finally{await db.close()}
});
