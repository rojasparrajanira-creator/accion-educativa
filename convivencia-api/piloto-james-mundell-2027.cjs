'use strict';
// Datos SINTÉTICOS para una simulación 2027. No representan matrícula oficial.
// NO ejecutar contra PostgreSQL de producción.
const SCHOOL = Object.freeze({
  reference_name:'Liceo Bicentenario de Excelencia James Mundell',
  pilot_name:'Piloto sintético James Mundell 2027',
  pilot_rbd:'PILOTO-JM-2027',
  school_year:2027,
  students_per_course:20
});
const COURSES=Object.freeze([
  {name:'7° A',level:'7-8'}, {name:'7° B',level:'7-8'},
  {name:'8° A',level:'7-8'}, {name:'8° B',level:'7-8'},
  {name:'I° A',level:'1-2-medio'}, {name:'I° B',level:'1-2-medio'},
  {name:'II° A',level:'1-2-medio'}, {name:'II° B',level:'1-2-medio'},
  {name:'III° Administración',level:'3-4-medio'},
  {name:'III° Turismo',level:'3-4-medio'},
  {name:'III° HC',level:'3-4-medio'},
  {name:'IV° Administración',level:'3-4-medio'},
  {name:'IV° Turismo',level:'3-4-medio'},
  {name:'IV° HC',level:'3-4-medio'}
]);
function rutDv(value){
 let sum=0,m=2;
 for(const digit of String(value).split('').reverse()){
  sum+=Number(digit)*m;
  m=m===7?2:m+1;
 }
 const n=11-sum%11;
 return n===11?'0':n===10?'K':String(n);
}
function makeRoster({perCourse=SCHOOL.students_per_course}={}){
 if(!Number.isInteger(perCourse)||perCourse<5||perCourse>100)throw Error('invalid_students_per_course');
 const out=[];
 for(const course of COURSES){
  for(let j=0;j<perCourse;j++){
   const n=out.length+1;
   // RUT de ensayo en rango reservado para simulación, nunca identidad real.
   const body=90000000+n;
   out.push({rut:String(body)+'-'+rutDv(body),
    name:'ESTUDIANTE FICTICIO '+String(n).padStart(3,'0'),
    course:course.name,level:course.level});
  }
 }
 return out;
}
function csvEscape(v){const s=String(v);return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function asSigeLikeCsv(roster=makeRoster()){
 const lines=['RUN,Nombre Completo,Curso'];
 for(const x of roster)lines.push([x.rut,x.name,x.course].map(csvEscape).join(','));
 return '\ufeff'+lines.join('\r\n')+'\r\n';
}
module.exports={SCHOOL,COURSES,rutDv,makeRoster,asSigeLikeCsv};
