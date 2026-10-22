'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),path=require('node:path');
const A=require('./student-dimensions-adapter-2027.cjs');
const P=require('./pgce-dimensions-integrated-2027.cjs');
test('adaptador SQL calcula dimensiones por colegio, nivel y M1/M2/M3 sin divulgar registros individuales',async()=>{
 const db=new PGlite();
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  const school=await db.query("INSERT INTO establishments(name,rbd) VALUES('Piloto Ficticio','TEST-DIM-A') RETURNING id");
  const other=await db.query("INSERT INTO establishments(name,rbd) VALUES('Establecimiento Ajeno Ficticio','TEST-DIM-B') RETURNING id");
  const est=Number(school.rows[0].id),estOther=Number(other.rows[0].id);
  const m=async(e,code,year)=>{
   const x=await db.query("INSERT INTO measurements(establishment_id,code,school_year,status) VALUES($1,$2,$3,'active') RETURNING id",[e,code,year]);
   return Number(x.rows[0].id);
  };
  const m1=await m(est,'M1',2027),m2=await m(est,'M2',2027),mOld=await m(est,'M1',2026),mOther=await m(estOther,'M1',2027);
  async function makeCohort({name,establishmentId,measurementId,level,count,value,item='D01_01',status='completed'}){
   // Solo nombres sintéticos. Se insertan respuestas individuales en DB aislada
   // y el adaptador solo puede leer agregados de SQL.
   for(let i=1;i<=count;i++){
    const r=await db.query('INSERT INTO students(establishment_id,rut,name) VALUES($1,$2,$3) RETURNING id',
     [establishmentId,name+'-'+i,'ESTUDIANTE FICTICIO '+name+'-'+i]);
    const app=await db.query('INSERT INTO survey_applications(measurement_id,student_id,survey_level,status) VALUES($1,$2,$3,$4) RETURNING id',
     [measurementId,r.rows[0].id,level,status]);
    await db.query('INSERT INTO responses(application_id,item_code,value) VALUES($1,$2,$3)',
     [app.rows[0].id,item,value]);
   }
  }
  await makeCohort({name:'A',establishmentId:est,measurementId:m1,level:'1-2',count:10,value:'3'});
  // Los mismos diez estudiantes contestan dos preguntas de SEG:
  // diez participantes, veinte respuestas válidas (no veinte participantes).
  await db.query("INSERT INTO responses(application_id,item_code,value) SELECT a.id,'D04_01','1' FROM survey_applications a WHERE a.measurement_id=$1 AND a.survey_level='1-2'",[m1]);
  await makeCohort({name:'B',establishmentId:est,measurementId:m1,level:'3-4',count:10,value:'3'});
  await makeCohort({name:'C',establishmentId:est,measurementId:m1,level:'7-8',count:10,value:'2'});
  await makeCohort({name:'SMALL',establishmentId:est,measurementId:m1,level:'5-6',count:9,value:'5'});
  await makeCohort({name:'OTHER',establishmentId:estOther,measurementId:mOther,level:'7-8',count:10,value:'5'});
  await makeCohort({name:'OLD',establishmentId:est,measurementId:mOld,level:'1-2',count:10,value:'1'});
  await makeCohort({name:'M2',establishmentId:est,measurementId:m2,level:'1-2',count:10,value:'1'});
  await makeCohort({name:'UNFINISHED',establishmentId:est,measurementId:m1,level:'7-8',count:10,value:'5',status:'in_progress'});
  const aggregated=await A.loadStudentDimensionAggregates(db,{establishmentId:est,schoolYear:2027,measurementCode:'M1'});
  assert.equal(aggregated.length,3);
  const get=(level)=>aggregated.find(x=>x.level===level&&x.dimension==='SEG');
  assert.equal(get('1-2').participant_count,10);
  assert.equal(get('1-2').valid_response_count,20);
  assert.equal(get('1-2').favorable_band,'50–74 %');
  assert.equal(get('3-4').favorable_band,'75–100 %');
  assert.equal(get('7-8').favorable_band,'0–24 %');
  assert.ok(!get('5-6'),'no exponer grupos menores a 10');
  assert.ok(aggregated.every(x=>x.aggregation_verified===true&&x.participant_count>=10&&x.valid_response_count>=10));
  assert.ok(!JSON.stringify(aggregated).includes('ESTUDIANTE FICTICIO'));
  assert.ok(!JSON.stringify(aggregated).includes('A-1'));
  const report=P.buildDimensionReport([],aggregated);
  // El adaptador entrega conteos solo al módulo servidor; la respuesta final los suprime.
  assert.equal(report.student_source_status,'verified_aggregates_received');
  assert.equal(report.student_levels_present.length,3);
  const second=await A.loadStudentDimensionAggregates(db,{establishmentId:est,schoolYear:2027,measurementCode:'M2'});
  assert.equal(second.length,1);assert.equal(second[0].favorable_band,'0–24 %');
  const foreign=await A.loadStudentDimensionAggregates(db,{establishmentId:estOther,schoolYear:2027,measurementCode:'M1'});
  assert.equal(foreign.length,1);assert.equal(foreign[0].favorable_band,'75–100 %');
  await assert.rejects(A.loadStudentDimensionAggregates(db,{establishmentId:est,schoolYear:2026,measurementCode:'M1'}),/invalid_reporting_scope/);
 }finally{await db.close();}
});
test('parámetros y conteos internos deben ser confiables antes de mostrar bandas',()=>{
 assert.deepEqual(A.studentDimensionAggregate([
  {level:'1-2',dimension:'SEG',participant_count:9,valid_response_count:9,favorable_count:9},
  {level:'7-8',dimension:'SEG',participant_count:10,valid_response_count:9,favorable_count:9},
  {level:'7-8',dimension:'SEG',participant_count:10,valid_response_count:10,favorable_count:11},
  {level:'nt1',dimension:'SEG',participant_count:14,valid_response_count:14,favorable_count:14},
  {level:'7-8',dimension:'SEG',participant_count:10,valid_response_count:20,favorable_count:6}
 ],{schoolYear:2027,measurementCode:'M1'}).map(x=>x.favorable_band),['25–49 %']);
 assert.throws(()=>A.studentDimensionAggregate([],{schoolYear:2026,measurementCode:'M1'}),/invalid_reporting_window/);
 assert.throws(()=>A.studentDimensionAggregate([],{schoolYear:2027,measurementCode:'BAD'}),/invalid_reporting_window/);
 assert.equal(A.LEVELS.length,6);
 assert.equal(A.PERIODS.length,3);
 assert.equal(new Set(Object.keys(A.ITEM_MAP)).size,16);
});

test('rechaza duplicados, números vacíos y agregados imposibles',()=>{
 const base={level:'7-8',dimension:'SEG',participant_count:10,valid_response_count:20,favorable_count:8};
 const invalid=[
  {...base,participant_count:null},
  {...base,participant_count:''},
  {...base,valid_response_count:121},
  {...base,favorable_count:-1},
  {...base,favorable_count:21}
 ];
 for(const item of invalid)assert.equal(A.studentDimensionAggregate([item],{schoolYear:2027,measurementCode:'M1'}).length,0);
 const same=[base,{...base,favorable_count:14}];
 assert.equal(A.studentDimensionAggregate(same,{schoolYear:2027,measurementCode:'M1'}).length,1);
});
