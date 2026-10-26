'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildPgceExportCsv,cell,HEADERS}=require('./pgce-export-2027.cjs');
const report=(period='M1')=>({
 year:2027,status:'preliminary_dimensions_only',student_measurement_code:period,
 dimensions:Array.from({length:10},(_,i)=>({
  id:'SEG-'+i,label:'Dimensión '+i,status:'review_with_professionals',
  legal_links:['16D-c'],
  review_topics:i===0?[{audience:'estudiantes',level:'7-8',
   favorable_band:'50–74 %',review_category:'requires_contextual_interpretation',
   evidence_ref:'PGCE-EST-2027-M1-7-8-SEG',
   student_id:99999,student_name:'PRIVATE-NAME-NOT-EXPORT',
   answers:['SENSITIVE-ANSWERS-NOT-EXPORT']}]:[]
 }))
});
const draft=()=>({school_year:2027,director_approval:null,
 establishment_name:'Escuela sintética',findings:[{id:'H-SEG-01',dimension_id:'SEG',
  need:'Necesidad colectiva',evidence_refs:['ACTA-CONVIVENCIA-2027'],
  student_name:'PRIVATE-FINDING-NOT-EXPORT'}],
 actions:[{action_id:'ACT-c-001',clause:'c',title:'Acción preventiva',
  objective:'Mejorar la convivencia',indicator:'Participación en actividades',
  target:'Meta institucional',responsible:'Equipo de convivencia',
  start_date:'2027-03-10',end_date:'2027-11-30',
  expected_evidence:'ACTA-PRUEBA',private_response:'PRIVATE-ACTION-NOT-EXPORT'}]});
const follow=()=>[{action_id:'ACT-c-001',clause:'c',measurement_code:'M2',
 status:'in_progress',progress_percent:40,evidence_refs:['ACTA-SEGUIMIENTO-2027'],
 professional_note:'Avance observado',adjustment_note:'Revisar estrategia',
 private_response:'PRIVATE-FOLLOWUP-NOT-EXPORT'}];
const preflight={status:'draft_incomplete',missing:['ficha.director','participacion.estudiantes']};
test('CSV exporta solamente registros agregados, acciones y seguimiento profesional',()=>{
 const csv=buildPgceExportCsv({report:report(),draft:draft(),followups:follow(),
  preflight,measurementCode:'M1'});
 assert.ok(csv.startsWith('\ufeff'));
 assert.match(csv,/Tipo de registro;?/); // cada campo incluye comillas, se valida a continuación
 assert.equal(csv.split('\r\n')[0].split(';').length,HEADERS.length);
 for(const item of ['DIMENSIÓN','SEÑAL AGREGADA','HALLAZGO','ACCIÓN',
  'SEGUIMIENTO','ACT-c-001','M2','40 %','50–74 %','BORRADOR'])assert.ok(csv.includes(item),item);
 for(const privateValue of ['PRIVATE-NAME-NOT-EXPORT','SENSITIVE-ANSWERS-NOT-EXPORT',
  'PRIVATE-FINDING-NOT-EXPORT','PRIVATE-ACTION-NOT-EXPORT',
  'PRIVATE-FOLLOWUP-NOT-EXPORT','99999'])assert.ok(!csv.includes(privateValue),privateValue);
 assert.ok(!csv.includes('"participant_count"'));
 assert.ok(!csv.includes('"valid_response_count"'));
});
test('CSV protege celdas de fórmulas y separa columnas de Excel',()=>{
 for(const v of ['=1+1','+cmd','-10','@trigger','  =HYPERLINK("https://example.invalid")']){
  assert.ok(cell(v).startsWith('"'+String("'")),v);
 }
 assert.equal(cell('texto;"entre comillas"'),'"texto;""entre comillas"""');
 assert.ok(!cell('texto\n=INJECT').includes('\n'));
});
test('CSV no ejecuta fórmulas ocultas tras prefijos Unicode invisibles',()=>{
 for(const input of [
  '\u2060=1+1','\u200e+HYPERLINK("https://invalid.example")',
  '\ufeff@cmd','\u00ad-1+2','\u2028=SUM(A1:A2)','\u200b\u200f=1'
 ]){
  const normalized=cell(input);
  assert.ok(normalized.startsWith('"\''),'prefijo potencialmente ejecutable sin neutralizar');
  assert.ok(!/[\u200b-\u200f\u2060-\u2069\ufeff]/u.test(normalized));
 }
});
test('el reporte rechaza cortes cruzados o estructuras inexistentes',()=>{
 assert.throws(()=>buildPgceExportCsv({report:report('M2'),draft:draft(),
  followups:[],preflight,measurementCode:'M1'}),/invalid_pgce_export/);
 assert.throws(()=>buildPgceExportCsv({report:report(),draft:{school_year:2026},
  followups:[],preflight,measurementCode:'M1'}),/invalid_pgce_export/);
 assert.throws(()=>buildPgceExportCsv({report:report(),draft:draft(),followups:[],
  preflight,measurementCode:'M4'}),/invalid_pgce_export/);
});
test('la exportación ignora seguimientos de acciones no incluidas en el borrador',()=>{
 const csv=buildPgceExportCsv({report:report(),draft:draft(),
  followups:[...follow(),{...follow()[0],action_id:'ACT-b-999',
   professional_note:'PRIVATE-ORPHAN-NOT-EXPORT'}],preflight,measurementCode:'M1'});
 assert.ok(!csv.includes('PRIVATE-ORPHAN-NOT-EXPORT'));
});
