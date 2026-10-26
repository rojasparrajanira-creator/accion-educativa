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


test('UAT impide exportar referencias personales evidentes y fechas imposibles',()=>{
 const {containsSensitiveText,validCalendarDate}=require('./pgce-uat-evaluacion-local-2027.cjs');
 assert.equal(containsSensitiveText('RUN 12.345.678-9'),true);
 assert.equal(containsSensitiveText('12345678-K'),true);
 assert.equal(containsSensitiveText('persona@ejemplo.cl'),true);
 assert.equal(containsSensitiveText('+56 9 1234 5678'),true);
 assert.equal(containsSensitiveText('ACTA-SINTETICA-2027'),false);
 assert.equal(validCalendarDate('2027-04-01'),true);
 assert.equal(validCalendarDate('2028-02-29'),true);
 for(const invalid of ['2027-02-29','2027-02-30','2027-13-01','2027-11-31','2027-00-12','27-01-01']){
  assert.equal(validCalendarDate(invalid),false,invalid);
 }
 const template=catalog().map(x=>({id:x.id,estado:'No probado',fecha:'',evidencia:'',observacion:''}));
 const base={schema:'mec-pgce-uat-v1',school_year:2027,results:template};
 for(const value of ['RUN 12.345.678-9','contacto persona@ejemplo.cl','celular +56 9 1234 5678']){
  const mutation={...template[0],estado:'Pasa',fecha:'2027-04-01',
   evidencia:'ACTA-SINT-01',observacion:value};
  assert.throws(()=>validateReview({...base,results:[mutation,...template.slice(1)]}),
   /uat_resultados_invalidos/);
 }
 const impossible={...template[0],estado:'Falla',fecha:'2027-02-30',
  evidencia:'INC-SINT-02'};
 assert.throws(()=>validateReview({...base,results:[impossible,...template.slice(1)]}),
  /uat_resultados_invalidos/);
 assert.equal(validateReview(base).authorized_to_deploy,false);
 assert.match(renderPage(),/containsSensitiveText/);
 assert.match(renderPage(),/validCalendarDate/);
});
