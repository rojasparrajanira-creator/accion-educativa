'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('./pgce-dimensions-integrated-2027.cjs');
const bank=require('./community-surveys-bank-2027.json');
const ids=Object.keys(P.DIMENSIONS);
test('las 16 dimensiones D01-D16 estudiantiles se mapean una sola vez a 10 áreas temáticas',()=>{
 assert.equal(ids.length,10);
 const studentCodes=Object.values(P.DIMENSIONS).flatMap(x=>x.student);
 assert.equal(studentCodes.length,16);
 assert.equal(new Set(studentCodes).size,16);
 assert.deepEqual(studentCodes.slice().sort(),Array.from({length:16},(_,i)=>'D'+String(i+1).padStart(2,'0')));
 const adultCodes=Object.keys(bank.dimensions);
 assert.deepEqual(ids.slice().sort(),adultCodes.sort());
 for(const [audience,data] of Object.entries(bank.audiences)){
  for(const item of data.items) assert.ok(ids.includes(item.dimension),audience+' '+item.id);
 }
});
test('matriz de diez áreas vinculada a siete componentes 16D y acciones incompletas por defecto',()=>{
 assert.equal(P.CLAUSES.length,7);
 const clauses=new Set(P.CLAUSES.map(x=>x.clause));
 assert.deepEqual([...clauses].sort(),[...'abcdefg']);
 const matrix=new Set(Object.values(P.DIMENSIONS).flatMap(d=>d.clauses));
 assert.deepEqual([...matrix].sort(),[...'abcdefg']);
 const r=P.buildDimensionReport();
 assert.equal(r.dimensions.length,10);
 assert.ok(r.dimensions.every(x=>x.status==='missing_sufficient_evidence'));
 assert.equal(r.student_source_status,'not_integrated_yet');
 assert.equal(r.student_levels_pending.length,8);
 assert.equal(r.audience_availability.filter(x=>!x.available).length,4);
 const plan=P.buildPgceScaffold(r);
 assert.equal(plan.status,'structure_only_not_an_approved_plan');
 assert.equal(plan.preflight.status,'draft_incomplete');
 assert.equal(plan.sections.length,7);
 assert.equal(plan.draft.actions.length,7);
 assert.equal(plan.can_publish,false);
 assert.equal(plan.can_certify_compliance,false);
 assert.equal(plan.draft.director_approval,null);
 assert.ok(plan.draft.actions.every(a=>!a.start_date&&!a.end_date&&!a.objective&&!a.target));
 assert.ok(plan.preflight.missing.includes('participacion.estudiantes'));
 assert.ok(plan.preflight.missing.includes('diagnostico.hallazgos'));
});
test('la dimensión recibe solo resultados suficientes de adultos, sin respuesta individual ni nombres',()=>{
 const q=bank.audiences.docente.items.find(x=>x.dimension==='SEG');
 const inputs=Array.from({length:10},(_,i)=>({
  audience:'docente',answers:{[q.id]:i<3?1:5},name:'Nombre privado',rut:'12.345.678-9'
 }));
 const report=P.buildDimensionReport(inputs);
 const seg=report.dimensions.find(x=>x.id==='SEG');
 const t=seg.review_topics.find(x=>x.question_id===q.id);
 assert.equal(t.favorable_band,'50–74 %');
 assert.equal(t.review_category,'requires_contextual_interpretation');
 assert.ok(!JSON.stringify(report).includes('Nombre privado'));
 assert.ok(!JSON.stringify(report).includes('12.345.678'));
 assert.equal(report.audience_availability.find(x=>x.audience==='docente').available,true);
 const plan=P.buildPgceScaffold(report);
 assert.ok(plan.sections.some(x=>x.topics_to_review>0));
 assert.equal(plan.preflight.status,'draft_incomplete');
});
test('datos de estudiante sin auditoría del agregado o con menos de 10 no se integran',()=>{
 const valid={dimension:'SEG',level:'7-8',favorable_band:'50–74 %',aggregation_verified:true,
  participant_count:12,valid_response_count:11,evidence_ref:'REPORTE-TEST-2027-001',
  rut:'12.345.678-9',student_name:'Dato que jamás debe salir'};
 const result=P.verifiedStudentAggregate([
  {...valid,participant_count:9},
  {...valid,aggregation_verified:false},
  {...valid,valid_response_count:8},
  {...valid,level:'inexistente'},
  {...valid,evidence_ref:'RUT 12345678'},
  valid,
  {...valid,participant_count:13,evidence_ref:'REPORTE-TEST-2027-002'}
 ]);
 assert.equal(result.length,1);
 assert.equal(result[0].level,'7-8');
 assert.equal(result[0].participants_band,'10–14');
 assert.ok(!JSON.stringify(result).includes('student_name'));
 assert.ok(!JSON.stringify(result).includes('12.345.678'));
 const report=P.buildDimensionReport([],[valid]);
 assert.equal(report.student_source_status,'verified_aggregates_received');
 assert.equal(report.student_levels_present.length,1);
 assert.equal(report.dimensions.find(x=>x.id==='SEG').status,'review_with_professionals');
 const block=P.buildDimensionReport([],[{...valid,aggregation_verified:false}]);
 assert.equal(block.student_source_status,'not_integrated_yet');
});
test('no se puede aprobar automáticamente un plan por llenar resultados de encuestas',()=>{
 const q=bank.audiences.directivo.items[0];
 const rows=Array.from({length:20},()=>({audience:'directivo',answers:{[q.id]:4}}));
 const r=P.buildDimensionReport(rows);
 const plan=P.buildPgceScaffold(r,{establishment_name:'Colegio Ficticio',rbd:'TEST-2027'});
 assert.equal(plan.can_publish,false);
 assert.equal(plan.draft.findings.length,0);
 assert.ok(plan.preflight.missing.some(x=>x.startsWith('plan.contenido_minimo_16D_'))===false);
 assert.equal(plan.preflight.status,'draft_incomplete');
 assert.ok(plan.preflight.missing.some(x=>x.includes('.hallazgo_vinculado')));
});
