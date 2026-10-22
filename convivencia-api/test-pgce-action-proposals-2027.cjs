'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {TEMPLATES,proposeEvidenceBasedActions}=require('./pgce-action-proposals-2027.cjs');
const {DIMENSIONS}=require('./pgce-dimensions-integrated-2027.cjs');
test('diez propuestas propias: objetivos, estrategias e indicadores, sin metas ficticias',()=>{
 assert.deepEqual(Object.keys(TEMPLATES).sort(),Object.keys(DIMENSIONS).sort());
 for(const t of Object.values(TEMPLATES)){
  assert.ok(t.title.length>15&&t.objective.length>20&&t.strategy.length>25&&t.indicator.length>25);
  assert.ok(t.evidence.length>15);
 }
 const none=proposeEvidenceBasedActions({dimensions:[]});
 assert.equal(none.proposals.length,0);
 assert.equal(none.status,'professional_review_required');
});
test('solo sugerir ante señales agregadas insuficientes de contexto, sin inventar fechas ni responsabilidades',()=>{
 const input={dimensions:[
  {id:'SEG',label:'Seguridad y protección',review_topics:[
   {audience:'estudiantes',level:'7-8',favorable_band:'25–49 %',name:'Dato confidencial'},
   {audience:'docente',favorable_band:'75–100 %'}
  ]},
  {id:'BIE',label:'Bienestar y desarrollo socioemocional',review_topics:[
   {audience:'familia',favorable_band:'0–24 %'}
  ]},
  {id:'ORG',label:'Normas y ambiente organizado',review_topics:[
   {audience:'docente',favorable_band:'75–100 %'}
  ]}
 ]};
 const result=proposeEvidenceBasedActions(input);
 assert.equal(result.proposals.length,2);
 assert.deepEqual(result.proposals.map(x=>x.dimension_id),['SEG','BIE']);
 assert.equal(result.proposals[0].status,'suggestion_requires_institutional_review');
 assert.deepEqual(result.proposals[0].level_types,['7-8']);
 for(const p of result.proposals){
  assert.equal(p.target,'');assert.equal(p.baseline,'');
  assert.equal(p.start_date,'');assert.equal(p.end_date,'');assert.equal(p.responsible,'');
 }
 assert.ok(!JSON.stringify(result).includes('Dato confidencial'));
});
