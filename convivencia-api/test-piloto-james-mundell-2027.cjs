'use strict';
// Prueba autocontenida. Usa PGlite en memoria y estudiantes inventados.
// NO realiza llamadas al servidor Render, pagos, correos ni bases productivas.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const {SCHOOL,COURSES,makeRoster,asSigeLikeCsv}=require('./piloto-james-mundell-2027.cjs');

const src=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
const start=src.indexOf('function plain(v){');
const end=src.indexOf('\nconst {createSubscriptions}',start);
if(start<0||end<0)throw Error('server parser functions missing');
const parser=vm.runInNewContext(src.slice(start,end)+
 '\n({courseKey,surveyLevelForCourse,parseCsvMatrix,matrixToObjects,parseStudentRow})');

test('estructura 2027: 14 cursos, modalidades TP/HC diferenciadas y 280 estudiantes ficticios',()=>{
 assert.equal(SCHOOL.school_year,2027);
 assert.equal(SCHOOL.pilot_rbd,'PILOTO-JM-2027');
 assert.equal(COURSES.length,14);
 const roster=makeRoster();
 assert.equal(roster.length,280);
 assert.equal(new Set(roster.map(r=>r.rut)).size,280);
 assert.equal(new Set(roster.map(r=>r.name)).size,280);
 const keys=COURSES.map(c=>parser.courseKey(c.name));
 assert.equal(new Set(keys).size,14,'No se deben mezclar las especialidades TP y HC');
 for(const c of COURSES)assert.equal(parser.surveyLevelForCourse(c.name),c.level,
  'Instrumento equivocado en '+c.name);
 for(const student of roster)assert.match(student.name,/^ESTUDIANTE FICTICIO \d{3}$/);
 assert.ok(roster.every(x=>!x.name.includes('Janira')&&!x.name.includes('Emilia')));
});

test('la previsualización SIGE conserva 14 cursos y 280 registros ficticios',()=>{
 const csv=asSigeLikeCsv();
 const matrix=parser.parseCsvMatrix(csv);
 const objects=parser.matrixToObjects(matrix);
 assert.equal(objects.length,280);
 const rows=objects.map((o,i)=>parser.parseStudentRow(o,'sintetico.csv',i+2));
 assert.equal(rows.length,280);
 assert.equal(new Set(rows.map(x=>parser.courseKey(x.course))).size,14);
 assert.equal(rows.filter(x=>!x.rut||!x.name||!x.course).length,0);
 assert.equal(new Set(rows.map(x=>x.rut)).size,280);
 const actual=makeRoster();
 assert.equal(rows[0].rut,actual[0].rut);
 assert.equal(rows[279].course,'IV° HC');
});

test('PostgreSQL aislado: cursos, matrícula, M1/M2/M3, diagnósticos y seguimiento 2027',async()=>{
 const db=new PGlite();
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'subscriptions.sql'),'utf8'));
  const eq=await db.query('insert into establishments(name,rbd) values($1,$2) returning id',
   [SCHOOL.pilot_name,SCHOOL.pilot_rbd]);
  const eid=eq.rows[0].id;
  const coordinator=(await db.query(
   "insert into users(establishment_id,email,name,role) values($1,'piloto-coordinacion@example.invalid','Profesional Ficticio A','coordinador_convivencia') returning id",
   [eid])).rows[0].id;
  const dupla=(await db.query(
   "insert into users(establishment_id,email,name,role) values($1,'piloto-dupla@example.invalid','Profesional Ficticio B','dupla_psicosocial') returning id",
   [eid])).rows[0].id;
  const docente=(await db.query(
   "insert into users(establishment_id,email,name,role) values($1,'piloto-docente@example.invalid','Profesional Ficticio C','profesor') returning id",
   [eid])).rows[0].id;
  assert.equal(new Set([coordinator,dupla,docente].map(String)).size,3);
  const courseIds=new Map();
  for(const course of COURSES){
   const q=await db.query('insert into courses(establishment_id,name,school_year) values($1,$2,$3) returning id',
    [eid,course.name,2027]);
   courseIds.set(course.name,q.rows[0].id);
  }
  const studentIds=[];
  const roster=makeRoster();
  for(const s of roster){
   const q=await db.query('insert into students(establishment_id,course_id,rut,name) values($1,$2,$3,$4) returning id',
    [eid,courseIds.get(s.course),s.rut,s.name]);
   studentIds.push({id:q.rows[0].id,level:s.level,course:s.course});
  }
  const measurements=new Map();
  for(const code of ['M1','M2','M3']){
   const m=await db.query('insert into measurements(establishment_id,code,school_year) values($1,$2,2027) returning id',[eid,code]);
   measurements.set(code,m.rows[0].id);
  }
  const apps=[];
  for(const s of studentIds){
   const q=await db.query('insert into survey_applications(measurement_id,student_id,survey_level) values($1,$2,$3) returning id',
    [measurements.get('M1'),s.id,s.level]);
   apps.push({id:q.rows[0].id,course:s.course});
  }
  assert.equal(Number((await db.query('select count(*) n from students where establishment_id=$1',[eid])).rows[0].n),280);
  assert.equal(Number((await db.query('select count(*) n from courses where establishment_id=$1',[eid])).rows[0].n),14);
  assert.equal(Number((await db.query('select count(*) n from survey_applications where measurement_id=$1',[measurements.get('M1')])).rows[0].n),280);
  assert.equal(Number((await db.query('select count(*) n from measurements where school_year=2027 and establishment_id=$1',[eid])).rows[0].n),3);
  // Simular respuestas de 5 estudiantes por curso para probar segregación de resultados.
  for(const course of COURSES){
   const courseApps=apps.filter(a=>a.course===course.name).slice(0,5);
   for(const a of courseApps){
    await db.query("update survey_applications set status='completed',completed_at=now() where id=$1",[a.id]);
    await db.query("insert into responses(application_id,item_code,value) values($1,'D01_01','4')",[a.id]);
    await db.query("insert into application_reviews(application_id,establishment_id,status,reviewed_by) values($1,$2,'reviewed',$3)",[a.id,eid,coordinator]);
   }
  }
  const checked=await db.query(
   "select c.name,count(distinct a.id) filter(where a.status='completed') as n from courses c join students s on s.course_id=c.id join survey_applications a on a.student_id=s.id where c.establishment_id=$1 group by c.id,c.name order by c.name",
   [eid]);
  assert.equal(checked.rows.length,14);
  assert.ok(checked.rows.every(x=>Number(x.n)===5));
  const available=apps.find(a=>a.course==='7° A');
  const intervention=(await db.query(
   "insert into pgce_interventions(establishment_id,source_application_id,dimension_code,priority,professional_decision,responsible,responsible_user_id,start_date,end_date,indicator,target,created_by) values($1,$2,'D02','high','aprobar','Profesional Ficticio B',$3,'2027-03-01','2027-07-30','Participación en actividades','Alcanzar participación proyectada',$4) returning id",
   [eid,available.id,dupla,coordinator])).rows[0];
  await db.query(
   "insert into pgce_intervention_updates(intervention_id,measurement_code,status,progress_percent,evidence_note,created_by) values($1,'M1','in_progress',35,'Seguimiento totalmente simulado',$2)",
   [intervention.id,dupla]);
  const task=(await db.query(
   "insert into professional_tasks(establishment_id,title,assigned_to,assigned_by,due_date,related_type,related_id) values($1,'Acción sintética PGCE',$2,$3,'2027-07-30','pgce_intervention',$4) returning id",
   [eid,dupla,coordinator,String(intervention.id)])).rows[0];
  await db.query("insert into professional_notifications(establishment_id,user_id,kind,title) values($1,$2,'pgce_task','Tarea ficticia')",[eid,dupla]);
  assert.equal(Number((await db.query('select count(*) n from professional_tasks where id=$1',[task.id])).rows[0].n),1);
  assert.equal(Number((await db.query('select count(*) n from pgce_intervention_updates where intervention_id=$1',[intervention.id])).rows[0].n),1);
  // Segunda institución ficticia: mismo RUT posible, pero nunca en resultados del primer establecimiento.
  const other=(await db.query(
   "insert into establishments(name,rbd) values('Colegio Externo Ficticio','PILOTO-AJENO-2027') returning id")).rows[0];
  const otherCourse=(await db.query(
   "insert into courses(establishment_id,name,school_year) values($1,'7° A',2027) returning id",[other.id])).rows[0];
  await db.query("insert into students(establishment_id,course_id,rut,name) values($1,$2,$3,'OTRO ESTUDIANTE FICTICIO')",
   [other.id,otherCourse.id,roster[0].rut]);
  assert.equal(Number((await db.query('select count(*) n from students where establishment_id=$1',[eid])).rows[0].n),280);
  assert.equal(Number((await db.query('select count(*) n from students where establishment_id=$1',[other.id])).rows[0].n),1);
  console.log('PILOT_FIXTURE_SQL_PASSED '+JSON.stringify({year:2027,courses:14,synthetic_students:280,
   assigned_m1:280,completed_simulated:70,measurements:3,interventions:1,followups:1,tasks:1,
   environment:'PGlite in-memory; NOT end-to-end HTTP'}));
 }finally{await db.close()}
});
