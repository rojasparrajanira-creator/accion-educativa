'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {catalog,renderPage,validateReview}=require('./pgce-uat-evaluacion-local-2027.cjs');

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
