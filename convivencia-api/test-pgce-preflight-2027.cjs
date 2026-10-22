'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspectPgceDraft,CLAUSES,AUDIENCES}=require('./pgce-preflight-2027.cjs');

function validDraft(){
 const findings=[{id:'H001',need:'Mejorar estrategias de prevención y participación institucional',evidence_refs:['ACTA-DIAG-001']}];
 const actions=CLAUSES.map((clause,i)=>({
  clause,title:'Acción '+clause,objective:'Desarrollar acciones formativas pertinentes',
  strategy:'Talleres y acompañamiento por estamento',
  responsible:'Equipo de convivencia',
  indicator:'Porcentaje de actividades ejecutadas',
  baseline:'0 actividades ejecutadas al inicio de 2027',
  target:'Al menos el 80 % de las actividades programadas',
  place:'Dependencias del establecimiento',
  resources:'Horas de coordinación y material educativo',
  expected_evidence:'Actas, listas de asistencia e instrumentos de evaluación',
  start_date:'2027-03-01',end_date:'2027-11-30',finding_ids:['H001']
 }));
 return {
  establishment_name:'Establecimiento de Ensayo',rbd:'PILOTO-FAKE-2027',
  director:'Director/a de Ensayo',responsible:'Coordinación de convivencia',version:'1.0',school_year:2027,
  findings,actions,diagnostic_sources:[
   ...AUDIENCES.map(a=>({audience:a,method:'Consulta participativa de ejemplo',evidence_ref:'EVI-'+a})),
   {audience:'institutional_records',method:'Registros agregados',evidence_ref:'REG-2026-001'}
  ],
  participation:AUDIENCES.map(a=>({audience:a,date:'2027-02-25',summary:'Se recopilaron sugerencias de ejemplo',evidence_ref:'ACTA-'+a})),
  council_school:{report_ref:'ACTA-CONSEJO-001',feedback_or_justification:'Informe con observaciones y respuesta fundada'},
  policy_alignment:'Política Nacional de Convivencia Educativa',
  pei_alignment:'Objetivos del PEI institucional',rie_alignment:'Protocolos institucionales',pme_alignment:'Acciones pertinentes del PME',
  diffusion:{channels:'Sitio web y reuniones',calendar:'Inicio del año y actualizaciones',delivery_record_plan:'Registro de recepción de familias'},
  follow_up:{frequency:'M1, M2 y M3',responsible:'Equipo de convivencia',evaluation_method:'Revisión de indicadores y actas'},
  director_approval:null
 };
}
test('el plan incompleto jamás figura listo',()=>{
 const check=inspectPgceDraft({});
 assert.equal(check.status,'draft_incomplete');
 assert.equal(check.coverage.clauses.length,7);
 assert.ok(check.missing.includes('plan.contenido_minimo_16D_g'));
 assert.ok(check.missing.includes('participacion.familia'));
 assert.equal(check.director_approval_recorded,false);
});
test('la verificación registra siete áreas y exige trazabilidad de necesidades a acciones',()=>{
 const p=validDraft();
 const report=inspectPgceDraft(p);
 assert.equal(report.status,'ready_for_human_review');
 assert.equal(report.missing.length,0);
 assert.equal(report.director_approval_recorded,false);
 assert.ok(report.warnings.some(x=>x.includes('Dirección')));
 assert.equal(report.coverage.total_actions,7);
 assert.ok(report.coverage.clauses.every(x=>x.has_action));
 p.actions[3].finding_ids=['H999'];
 const invalid=inspectPgceDraft(p);
 assert.equal(invalid.status,'draft_incomplete');
 assert.ok(invalid.missing.some(x=>x.includes('hallazgo_vinculado')));
});
test('un acto de Dirección solo se registra; la aplicación no afirma cumplimiento legal',()=>{
 const p=validDraft();p.director_approval={approval_document_ref:'ACTA-DIRECCION-001',date:'2027-03-01'};
 const r=inspectPgceDraft(p);
 assert.equal(r.director_approval_recorded,true);
 assert.equal(r.status,'ready_for_human_review');
 assert.ok(!String(r.status).includes('compliant'));
 assert.match(r.disclaimer,/no certificación normativa/);
});
test('sin participación de asistentes ni acciones para familias queda pendiente de revisión',()=>{
 const p=validDraft();p.participation=p.participation.filter(x=>x.audience!=='asistente');p.actions=p.actions.filter(x=>x.clause!=='g');
 const r=inspectPgceDraft(p);
 assert.equal(r.status,'draft_incomplete');
 assert.ok(r.missing.includes('participacion.asistente'));
 assert.ok(r.missing.includes('plan.contenido_minimo_16D_g'));
});
test('falta de una encuesta no equivale por sí sola a incumplimiento legal',()=>{
 const p=validDraft();p.diagnostic_sources=p.diagnostic_sources.filter(x=>x.audience!=='familia');
 const r=inspectPgceDraft(p);
 assert.equal(r.status,'ready_for_human_review');
 assert.ok(r.coverage.missing_diagnostic_audiences.includes('familia'));
 assert.ok(r.warnings.some(x=>x.includes('familia')));
});
