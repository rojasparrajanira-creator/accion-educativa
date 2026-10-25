'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {catalog,renderPage,validateReview,summarizeReview}=require('./pgce-uat-evaluacion-local-2027.cjs');

test('formulario genera exactamente veinte UAT de la pauta y no afirma aprobación',()=>{
 const cases=catalog();
 const html=renderPage();
 assert.equal(cases.length,20);
 assert.deepEqual(cases.map(c=>c.id),Array.from({length:20},(_,i)=>'UAT-'+String(i+1).padStart(2,'0')));
 assert.ok(html.startsWith('<!doctype html>'));
 assert.match(html,/sin certificación/i);
 assert.match(html,/20 casos no probados/);
 assert.match(html,/Descargar evaluación JSON/);
 assert.match(html,/Recuperar evaluación JSON/);
 assert.match(html,/aria-live="polite"/);
 assert.ok(!html.includes('https://convivencia-escolar-api.onrender.com'));
 assert.ok(!html.includes('localStorage'));
 assert.ok(!html.includes('sessionStorage'));
 assert.ok(!html.includes('<script src='));
});

test('la validación exige resultados auténticamente registrados, sin aprobar despliegues',()=>{
 const results=catalog().map(c=>({id:c.id,estado:'No probado',fecha:'',
  evidencia:'',observacion:''}));
 const raw={schema:'mec-pgce-uat-v1',school_year:2027,results};
 let v=validateReview(raw);
 assert.equal(v.results.length,20);
 assert.equal(v.no_automatic_approval,true);
 assert.equal(v.authorized_to_deploy,false);
 assert.ok(!('reviewer_name' in v));
 results[0]={...results[0],estado:'Pasa',fecha:'2027-04-01',evidencia:'PRUEBA-A-001'};
 v=validateReview(raw);
 assert.equal(v.results[0].estado,'Pasa');
 assert.equal(v.authorized_to_deploy,false);
 for(const mutation of [
  {...results[0],evidencia:''},
  {...results[0],fecha:''},
  {...results[0],evidencia:'RUN 12345678'},
  {...results[0],observacion:'a'.repeat(361)},
  {...results[0],estado:'Aprobado por Ministerio'},
  {...results[0],id:'UAT-99'}
 ]){
  const altered=[mutation,...results.slice(1)];
  assert.throws(()=>validateReview({...raw,results:altered}));
 }
 assert.throws(()=>validateReview({...raw,results:results.slice(0,19)}));
 assert.throws(()=>validateReview({...raw,schema:'otro'}));
});

test('el resumen UAT identifica bloqueos, pendientes y nunca habilita producción',()=>{
 const results=catalog().map(c=>({id:c.id,estado:'No probado',fecha:'',evidencia:'',observacion:''}));
 const review={schema:'mec-pgce-uat-v1',school_year:2027,results};
 let status=summarizeReview(review);
 assert.deepEqual(status.counts,{pasa:0,falla:0,no_probado:20});
 assert.equal(status.estado,'EVALUACION INCOMPLETA');
 assert.equal(status.human_approval_verified,false);
 assert.equal(status.authorized_to_deploy,false);
 results[0]={...results[0],estado:'Falla',fecha:'2027-03-05',evidencia:'INC-FICT-01',observacion:'Error sintético'};
 status=summarizeReview(review);
 assert.deepEqual(status.counts,{pasa:0,falla:1,no_probado:19});
 assert.equal(status.estado,'REQUIERE CORRECCIONES');
 assert.deepEqual(status.bloqueos.map(x=>x.id),['UAT-01']);
 assert.equal(status.bloqueos[0].observacion,'Error sintético');
 assert.equal(status.pendientes.length,19);
 for(let i=0;i<20;i++)results[i]={...results[i],estado:'Pasa',fecha:'2027-04-01',evidencia:'TEST-'+i};
 status=summarizeReview(review);
 assert.deepEqual(status.counts,{pasa:20,falla:0,no_probado:0});
 assert.equal(status.estado,'PENDIENTE DE DICTAMEN HUMANO');
 assert.equal(status.human_approval_verified,false);
 assert.equal(status.authorized_to_deploy,false);
 assert.equal(status.bloqueos.length,0);
 const html=renderPage();
 assert.match(html,/Resumen de evaluación y pendientes/);
 assert.match(html,/Imprimir resumen y pauta/);
 assert.match(html,/SIN APROBACIÓN INSTITUCIONAL/);
});
