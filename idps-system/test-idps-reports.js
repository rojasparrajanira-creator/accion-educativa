'use strict';
/* QA sin conexión a base de datos ni uso de información real de estudiantes. */
const assert=require('node:assert/strict');
const zlib=require('node:zlib');
const {reportDoc,reportHtml}=require('./idps-word-premium');

function synthetic(n,grade,letter,year=2026){
 return Array.from({length:n},(_,i)=>{
  const answers=Array.from({length:30},(_,j)=>j===8?(i%4+1):((i+j)%4+1));
  function points(a){return Math.round(10*((a.reduce((s,x)=>s+x,0)-a.length)/(a.length*3))*100)/10;}
  const scores=[answers.slice(0,8),answers.slice(8,16),answers.slice(16,23),answers.slice(23)].map(points);
  return {student_id:'synthetic-'+grade+'-'+i,grade_desc:grade,course_letter:letter,school_year:year,
   first_names:'Prueba',last_name_paternal:'Anonima',last_name_maternal:'Simulada',
   answers,scores,general:Math.round(10*scores.reduce((a,b)=>a+b,0)/4)/10,submitted_at:'2026-10-13T15:00:00Z'};
 });
}
function xmlEntry(zip,name){
 // Extrae la entrada de la estructura central de ZIP sin dependencias adicionales.
 let pos=0;
 while(pos<zip.length-46){
  if(zip.readUInt32LE(pos)!==0x02014b50){pos++;continue;}
  const compression=zip.readUInt16LE(pos+10),compressed=zip.readUInt32LE(pos+20);
  const fileNameLength=zip.readUInt16LE(pos+28),extra=zip.readUInt16LE(pos+30),comment=zip.readUInt16LE(pos+32);
  const off=zip.readUInt32LE(pos+42),entryName=zip.subarray(pos+46,pos+46+fileNameLength).toString();
  if(entryName===name){
   assert.equal(zip.readUInt32LE(off),0x04034b50,'ZIP local header');
   const localName=zip.readUInt16LE(off+26),localExtra=zip.readUInt16LE(off+28);
   const data=zip.subarray(off+30+localName+localExtra,off+30+localName+localExtra+compressed);
   if(compression===0)return data;
   if(compression===8)return zlib.inflateRawSync(data);
   throw Error('Compresión ZIP no admitida: '+compression);
  }
  pos+=46+fileNameLength+extra+comment;
 }
 throw Error('No se encontró '+name+' dentro del Word');
}
function allText(xml){return String(xml).replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ');}
async function check(options,label){
 const data=await reportDoc(options),html=reportHtml(options);
 assert.ok(Buffer.isBuffer(data),'El informe '+label+' no retornó un Buffer');
 assert.equal(data.toString('binary',0,2),'PK','El informe '+label+' no es ZIP/DOCX');
 const documentXML=xmlEntry(data,'word/document.xml').toString('utf8');
 const content=allText(documentXML);
 assert.ok(documentXML.includes('w:drawing'),'El Word '+label+' no contiene gráficos embebidos');
 assert.ok(content.includes('Análisis profesional'),'El Word '+label+' no incluye análisis');
 assert.ok(content.includes('Plan'),'El Word '+label+' no incluye plan de seguimiento');
 assert.ok(!content.includes('representatividad de estudiantes ausentes'),'Persiste frase incorrecta sobre ausentes');
 assert.ok(html.includes('Análisis profesional basado en evidencias'),'La página '+label+' carece de análisis');
 assert.ok(!html.includes('representatividad de estudiantes ausentes'),'La página '+label+' menciona ausentes');
 assert.ok(!html.includes('Guardar PDF'),'La página '+label+' promueve PDF en vez de Word');
 assert.ok(html.includes('Descargar informe Word editable'),'La página '+label+' no enlaza la descarga Word');
 if(options.type!=='institution'){
  assert.ok(content.includes('En mi curso')||content.includes('Cuando enfrento'),'Los enunciados de '+label+' no corresponden al instrumento');
 }
 if(options.type!=='individual'){
  const expected=options.coverageAnswered===options.denom?'100,0% de cobertura':(100*options.coverageAnswered/options.denom).toFixed(1).replace('.',',')+'% de cobertura';
  assert.ok(content.includes(expected),'Cobertura Word incorrecta '+label+': '+expected);
  assert.ok(html.includes(expected),'Cobertura HTML incorrecta '+label+': '+expected);
 }
 console.log('OK',label,'DOCX',data.length,'bytes','HTML',html.length,'caracteres');
}

(async()=>{
 const school={name:'Centro educativo ficticio',rbd:'00000-0',commune:'Comuna ficticia'};
 const a=synthetic(31,'1° medio','B'),b=synthetic(20,'6° básico','A'),rows=[...a,...b];
 const base={est:school,year:2026};
 await check({...base,type:'course',rows:a,denom:31,coverageAnswered:31},'curso-31-de-31');
 await check({...base,type:'course',rows:a,denom:31,coverageAnswered:30},'curso-30-de-31');
 await check({...base,type:'individual',rows:[a[0]],denom:1,cohort:a},'individual');
 await check({...base,type:'institution',rows,denom:51,coverageAnswered:51,
  groups:[{year:2026,grade:'1° medio',letter:'B',n:31,rows:a,scores:[50,60,55,65]},
  {year:2026,grade:'6° básico',letter:'A',n:20,rows:b,scores:[62,66,59,61]}]},'institucional');
 console.log('VALIDACIÓN FINALIZADA: 4 generaciones reales de Word y HTML sin datos personales.');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
