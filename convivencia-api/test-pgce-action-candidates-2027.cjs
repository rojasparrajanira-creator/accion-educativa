'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createActionCandidates,actionLibrary}=require('./pgce-action-candidates-2027.cjs');
const {buildDimensionReport,DIMENSIONS}=require('./pgce-dimensions-integrated-2027.cjs');
const bank=require('./community-surveys-bank-2027.json');

test('sin resultados agregados suficientes NO se sugieren acciones específicas',()=>{
 const result=createActionCandidates(buildDimensionReport());
 assert.equal(result.status,'suggestions_not_a_plan');
 assert.equal(result.actions.length,0);
 assert.equal(result.coverage.length,10);
 assert.ok(result.coverage.every(x=>x.has_suggestion===false));
 assert.equal(result.required_plan_clauses.length,7);
});

test('sugerencias solo para dimensiones con evidencia verificada y sin revelar personas',()=>{
 const q=bank.audiences.docente.items.find(x=>x.dimension==='SEG');
 const responses=Array.from({length:12},(_,i)=>({
  audience:'docente',answers:{[q.id]:i<7?1:5},
  rut:'RUT SENSIBLE',name:'NOMBRE SENSIBLE',student_id:222}));
 const report=buildDimensionReport(responses);
 const out=createActionCandidates(report);
 assert.equal(out.actions.length,1);
 const x=out.actions[0];
 assert.equal(x.dimension,'SEG');
 assert.equal(x.status,'idea_for_professional_review_only');
 assert.equal(x.review_reason,'hay_bandas_que_requieren_indagacion');
 assert.equal(x.can_be_added_without_review,false);
 assert.ok(x.related_clauses.includes('16D-d'));
 assert.ok(x.evidence_refs.includes(q.id));
 assert.ok(x.missing_before_plan.includes('consulta participativa'));
 assert.ok(!JSON.stringify(out).includes('RUT SENSIBLE'));
 assert.ok(!JSON.stringify(out).includes('NOMBRE SENSIBLE'));
 assert.ok(!JSON.stringify(out).includes('student_id'));
});

test('todos los enfoques de acción tienen guías y vínculos normativos, no fechas inventadas',()=>{
 assert.deepEqual(Object.keys(actionLibrary).sort(),Object.keys(DIMENSIONS).sort());
 for(const [id,def] of Object.entries(actionLibrary)){
  assert.ok(def.title.length>12,id);
  assert.ok(def.purpose.length>20,id);
  assert.ok(def.activity.length>25,id);
  assert.equal(def.questions.length,2);
  assert.ok(DIMENSIONS[id].clauses.length>0);
 }
 const example=Object.entries(DIMENSIONS).map(([id,definition])=>({
  id,review_topics:[{audience:'estudiantes',evidence_ref:'PGCE-EST-2027-M1-7-8-'+id,
   favorable_band:'50–74 %'}]}));
 const out=createActionCandidates({dimensions:example,student_measurement_code:'M1'});
 assert.equal(out.actions.length,10);
 assert.ok(out.actions.every(x=>x.measurement_code==='M1'&&x.can_be_added_without_review===false));
 assert.ok(out.actions.every(x=>!Object.hasOwn(x,'start_date')&&!Object.hasOwn(x,'responsible')));
});

test('una respuesta sin referencia segura, o incompleta, no genera acción',()=>{
 const bad=createActionCandidates({dimensions:[{id:'DIG',review_topics:[
  {audience:'estudiantes',evidence_ref:'RUT-12.345.678-9',favorable_band:'0–24 %'},
  {audience:'docente',question_id:'MALICIOSO',favorable_band:'0–24 %'},
  {audience:'estudiantes',evidence_ref:'PGCE-EST-2027-M1-7-8-DIG',favorable_band:'12345'}
 ]}]});
 assert.equal(bad.actions.length,0);
});
