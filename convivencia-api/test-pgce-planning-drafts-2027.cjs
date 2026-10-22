'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validatePgceDraft,normalizeLegacyActionIds}=require('./pgce-planning-drafts-2027.cjs');
const {buildPgceScaffold,buildDimensionReport}=require('./pgce-dimensions-integrated-2027.cjs');
const initial=()=>buildPgceScaffold(buildDimensionReport()).draft;
test('el editor conserva borradores incompletos sin elevarlos a aprobados',()=>{
 const draft=initial();
 const result=validatePgceDraft(draft);
 assert.equal(result.school_year,2027);
 assert.equal(result.director_approval,null);
 assert.equal(result.actions.length,7);
});
test('el editor admite hallazgos documentados vinculados a acciones y cursos',()=>{
 const d=initial();
 d.findings=[{id:'H-SEG-01',dimension_id:'SEG',
  need:'Necesidad colectiva a revisar',evidence_refs:['ACTA-2027-01']}];
 const a=d.actions.find(x=>x.clause==='c');
 a.finding_ids=['H-SEG-01'];a.target_courses=['7° A','8° B'];
 a.evaluation_method='Revisión de evidencias y seguimiento en M1/M2/M3';
 const clean=validatePgceDraft(d);
 assert.equal(clean.actions.find(x=>x.clause==='c').target_courses.length,2);
 assert.deepEqual(clean.findings[0].evidence_refs,['ACTA-2027-01']);
});
test('nunca acepta aprobaciones automáticas ni identificadores de estudiantes',()=>{
 const d=initial();
 assert.throws(()=>validatePgceDraft({...d,director_approval:{approval_document_ref:'NO',date:'2027-12-01'}}),/invalid_pgce_draft/);
 assert.throws(()=>validatePgceDraft({...d,student_id:1001}),/invalid_pgce_draft/);
 const copy=initial();
 copy.findings=[{id:'H-SEG-02',dimension_id:'SEG',
  need:'Dato protegido 12.345.678-9',evidence_refs:['ACTA-2027-02']}];
 assert.throws(()=>validatePgceDraft(copy),/invalid_pgce_draft/);
});
test('no admite hallazgos repetidos, dimensiones ajenas ni referencias inexistentes',()=>{
 const d=initial();
 const f={id:'H-SEG-03',dimension_id:'SEG',need:'Necesidad colectiva',evidence_refs:['ACTA-2027-03']};
 d.findings=[f,{...f}];
 assert.throws(()=>validatePgceDraft(d),/invalid_pgce_draft/);
 d.findings=[{...f,dimension_id:'OTRA'}];
 assert.throws(()=>validatePgceDraft(d),/invalid_pgce_draft/);
 d.findings=[f];d.actions[0].finding_ids=['H-NO-EXISTE'];
 assert.throws(()=>validatePgceDraft(d),/invalid_pgce_draft/);
 d.actions[0].finding_ids=[];d.actions[0].clause='';
 assert.throws(()=>validatePgceDraft(d),/invalid_pgce_draft/);
});

test('permite varias acciones en el mismo apartado, con ID propio e inmutable',()=>{
 const d=initial();
 d.actions.push({...d.actions[0],action_id:'ACT-a-002',title:'Segunda acción de coordinación'});
 const plan=validatePgceDraft(d);
 assert.equal(plan.actions.filter(x=>x.clause==='a').length,2);
 assert.equal(new Set(plan.actions.map(x=>x.action_id)).size,8);
 d.actions.push({...d.actions[0]});
 assert.throws(()=>validatePgceDraft(d),/invalid_pgce_draft/);
 d.actions.pop();
 d.actions[7].action_id='ACT-b-002';
 assert.throws(()=>validatePgceDraft(d),/invalid_pgce_draft/);
});
test('migración de borradores antiguos agrega IDs determinísticos sin alterar textos',()=>{
 const old=initial();
 old.actions.forEach(x=>delete x.action_id);
 old.actions.find(x=>x.clause==='c').title='Acción anterior de bienestar';
 const migrated=normalizeLegacyActionIds(old);
 assert.equal(migrated.actions.find(x=>x.clause==='c').action_id,'ACT-c-001');
 assert.equal(migrated.actions.find(x=>x.clause==='c').title,'Acción anterior de bienestar');
 assert.ok(old.actions.every(x=>!('action_id' in x)));
 assert.deepEqual(migrated,validatePgceDraft(migrated));
});
test('no es posible introducir estructuras de identidad dentro de las fuentes documentales',()=>{
 const d=initial();
 d.diagnostic_sources=[{audience:'docente',method:'encuesta',
  evidence_ref:'ACTA-2027-A',studentName:'Nombre oculto'}];
 assert.throws(()=>validatePgceDraft(d),/invalid_pgce_draft/);
 d.diagnostic_sources=[];
 d.participation=[{audience:'estudiantes',summary:'Revisión colectiva',
  evidence_ref:'ACTA-2027',date:'2027-08-10',individual_responses:['dato privado']}];
 assert.throws(()=>validatePgceDraft(d),/invalid_pgce_draft/);
 d.participation=[];
 d.council_school={report_ref:'ACTA-2027',feedback_or_justification:'',
  privateStudentData:'Dato'};
 assert.throws(()=>validatePgceDraft(d),/invalid_pgce_draft/);
});
test('admite participación y documentos institucionales agregados de estructura conocida',()=>{
 const d=initial();
 d.diagnostic_sources=[{audience:'institutional_records',method:'Acta de Consejo',
  evidence_ref:'ACTA-TEST-2027'}];
 d.participation=[{audience:'estudiantes',summary:'Participación por ciclo',
  evidence_ref:'ACTA-EST-2027',date:'2027-08-10'}];
 const clean=validatePgceDraft(d);
 assert.equal(clean.participation[0].audience,'estudiantes');
});
