'use strict';
// IDPS: motor de informes Word. Exclusivamente lectura y visualización.
const fs=require('fs'),path=require('path'),vm=require('vm'),zlib=require('zlib');
const {Document,Paragraph,TextRun,Table,TableRow,TableCell,ImageRun,Header,Footer,PageNumber,AlignmentType,WidthType,BorderStyle,Packer}=require('docx');
const LABELS=['Autoestima académica y motivación escolar','Clima de convivencia escolar','Participación y formación ciudadana','Hábitos de vida saludable'];
const DIMS=[['Autopercepción académica',0,4,0],['Motivación escolar',4,8,0],['Ambiente de respeto',8,11,1],['Ambiente organizado',11,14,1],['Ambiente seguro',14,16,1],['Pertenencia',16,18,2],['Participación',18,20,2],['Vida democrática',20,23,2],['Alimentación',23,26,3],['Vida activa',26,28,3],['Autocuidado',28,30,3]];
const C={navy:'15384A',blue:'407DA9',teal:'168D90',gold:'B99238',green:'518875',white:'FFFFFF',text:'25394A',muted:'677A86',line:'DCE7E9',pale:'EFF5F6',rose:'B96E67'};
const PALETTE=[C.blue,C.teal,C.gold,C.green];
const PROFESSIONAL=require('./idps-professional-analysis');
const ACTIONS={
'Autopercepción académica':['Retroalimentar el esfuerzo y las estrategias; acordar metas de aprendizaje alcanzables','Profesor/a jefe y docentes','Revisión quincenal de metas'],
'Motivación escolar':['Desarrollar experiencias de logro, elección y participación activa en el aprendizaje','UTP y docentes','Registro de actividades y devolución estudiantil'],
'Ambiente de respeto':['Revisar acuerdos de buen trato, diálogo y relaciones respetuosas entre pares y adultos','Convivencia Escolar y profesor/a jefe','Observación y actas de acuerdos'],
'Ambiente organizado':['Implementar rutinas compartidas y revisar las interrupciones de la enseñanza','UTP y docentes','Pauta de observación de aula'],
'Ambiente seguro':['Identificar espacios y momentos percibidos como inseguros; reforzar canales confiables de ayuda','Convivencia Escolar e Inspectoría','Mapa participativo y medidas registradas'],
'Pertenencia':['Fortalecer acogida, vínculos entre pares y participación en experiencias significativas','Profesor/a jefe y dupla de apoyo','Registro de participación y seguimiento'],
'Participación':['Crear espacios periódicos de opinión y decisión estudiantil con devolución de acuerdos','Profesor/a jefe y representantes estudiantiles','Actas y acuerdos evaluados'],
'Vida democrática':['Ejercitar escucha, respeto a diferencias y decisiones compartidas en clases','Docentes y Convivencia Escolar','Registro de asambleas y participación'],
'Alimentación':['Realizar actividades contextualizadas de hábitos de alimentación e hidratación','Docentes y equipo de salud escolar','Pauta de hábitos y participación'],
'Vida activa':['Promover pausas activas y oportunidades inclusivas de movimiento','Educación Física y docentes','Registro semanal de oportunidades'],
'Autocuidado':['Trabajar descanso, higiene y conductas protectoras mediante acciones graduadas','Profesor/a jefe y equipo de apoyo','Revisión voluntaria de hábitos y acuerdos']
};
const A=x=>Array.isArray(x)?x:(()=>{try{const v=JSON.parse(x||'[]');return Array.isArray(v)?v:[]}catch{return[]}})();
const F=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n))?Number(n).toFixed(1).replace('.',','):'—';
const P=(a,b)=>b?100*a/b:null;
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const grade=r=>String(r.grade_desc||'').trim();
const className=r=>[r.grade_desc,r.course_letter].filter(Boolean).join(' ');
const fullName=r=>[r.first_names,r.last_name_paternal,r.last_name_maternal].filter(Boolean).join(' ');
const date=x=>{try{return new Date(x).toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric'});}catch{return '—';}};
let BANK=null;
function qs(g){if(!BANK){try{const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../idps-public/questions-core.js'),'utf8'),ctx,{timeout:1000});BANK=ctx.window.IDPS_QUESTIONS||{};}catch(e){console.warn('[IDPS_QUESTIONS_REPORT]',e.message);BANK={};}}return BANK[String(g||'').trim()]||[];}
function statement(g,i){return qs(g)[i]||('Ítem '+(i+1)+' (revisar la versión del instrumento)');}
function stat(rows){return Array.from({length:30},(_,i)=>{const c=[0,0,0,0];for(const r of rows){const v=Number(A(r.answers)[i]);if(Number.isInteger(v)&&v>=1&&v<=4)c[v-1]++;}const n=c.reduce((a,b)=>a+b,0);return{i,n,c,low:c[0]+c[1],high:c[2]+c[3],lowPct:P(c[0]+c[1],n)};});}
function indic(rows){return LABELS.map((name,i)=>{const points=rows.map(r=>Number(A(r.scores)[i])).filter(v=>Number.isFinite(v)&&v>=0&&v<=100);return{name,i,v:mean(points)};});}
function dim(st){return DIMS.map(([name,a,b,i])=>{const s=st.slice(a,b),n=s.reduce((a,x)=>a+x.n,0),yes=s.reduce((a,x)=>a+x.high,0);return{name,a,b,i,n,yes,v:P(yes,n)};});}
function para(x,sm=false){return new Paragraph({children:[new TextRun({text:String(x),color:sm?C.muted:C.text,size:sm?19:23,italics:sm})],alignment:sm?AlignmentType.LEFT:AlignmentType.JUSTIFIED,spacing:{line:sm?290:360,after:sm?145:170}});}
function head(x,sub=false){return new Paragraph({children:[new TextRun({text:String(x),bold:true,color:C.navy,size:sub?24:29})],keepNext:true,spacing:{before:sub?180:300,after:125},border:sub?undefined:{bottom:{style:BorderStyle.SINGLE,color:C.gold,size:10,space:8}}});}
function cel(x,hd=false){return new TableCell({shading:{fill:hd?C.navy:C.white},margins:{top:87,bottom:87,left:93,right:93},children:[new Paragraph({children:[new TextRun({text:String(x),bold:hd,color:hd?C.white:C.text,size:hd?18:18})],spacing:{line:260}})]});}
function table(headers,values){return new Table({width:{size:100,type:WidthType.PERCENTAGE},borders:{top:{style:BorderStyle.SINGLE,size:4,color:C.line},bottom:{style:BorderStyle.SINGLE,size:4,color:C.line},insideH:{style:BorderStyle.SINGLE,size:3,color:C.line},insideV:{style:BorderStyle.SINGLE,size:2,color:C.line}},rows:[new TableRow({tableHeader:true,cantSplit:true,children:headers.map(v=>cel(v,true))}),...values.map(row=>new TableRow({cantSplit:true,children:row.map(v=>cel(v))}))]});}
function crc(buf){let c=0xffffffff;for(const b of buf){c^=b;for(let k=0;k<8;k++)c=(c&1)?(c>>>1)^0xedb88320:c>>>1;}return(c^0xffffffff)>>>0;}
function chunk(tag,data){const t=Buffer.from(tag),b=Buffer.alloc(data.length+12);b.writeUInt32BE(data.length,0);t.copy(b,4);data.copy(b,8);b.writeUInt32BE(crc(Buffer.concat([t,data])),data.length+8);return b;}
function rgb(hex){return[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));}
function graphic(segments){
 const w=1050,h=46,raw=Buffer.alloc(h*(w*3+1)),total=segments.reduce((n,v)=>n+Math.max(0,Number(v[0])||0),0)||100;
 let acc=0;const stops=segments.map(([v,color])=>{acc+=100*Math.max(0,Number(v)||0)/total;return[acc,rgb(color)];});
 for(let y=0;y<h;y++){const start=y*(w*3+1);for(let x=0;x<w;x++){
  const l=x-10,t=y-5,W=w-20,H=35,r=16,cx=Math.max(r,Math.min(W-r,l)),cy=Math.max(r,Math.min(H-r,t));
  const on=l>=0&&l<W&&t>=0&&t<H&&(l-cx)**2+(t-cy)**2<=r*r;
  let color=[255,255,255];if(on){const v=l/W*100;color=(stops.find(s=>v<=s[0])||stops[stops.length-1])[1];if(l<1||l>W-2||t<1||t>H-2)color=rgb(C.line);}
  const idx=start+1+x*3;raw[idx]=color[0];raw[idx+1]=color[1];raw[idx+2]=color[2];
 }}
 const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
function bar(out,label,value,color){out.push(new Paragraph({children:[new TextRun({text:label,color:C.text,bold:true,size:20}),new TextRun({text:'   '+(value==null?'Sin datos':F(value)+'%'),bold:true,color:C.navy,size:20})],keepNext:true,spacing:{before:80,after:20}}));out.push(new Paragraph({children:[new ImageRun({data:graphic([[value==null?0:value,color],[value==null?100:100-value,'E9F0F1']]),transformation:{width:460,height:20}})],spacing:{after:60}}));}
function description(rows,denom,type){
 if(type==='individual')return'Una respuesta individual completa; interpretación reservada para acompañamiento educativo.';
 const n=rows.length,d=Number(denom);
 if(!Number.isInteger(d)||d<1)return n+' respuestas completas. No hay denominador verificable: no se informa cobertura.';
 if(n>d)return n+' respuestas registradas y '+d+' estudiantes activos comparables. Los datos de matrícula no concuerdan: cobertura no calculable hasta verificar el denominador.';
 return n+' respuestas completas de '+d+' estudiantes habilitados ('+F(P(n,d))+'% de cobertura).';
}
function sum(out,opts,st){
 const {rows,type,denom,cohort}=opts,v=indic(rows).filter(x=>x.v!=null).sort((a,b)=>a.v-b.v);
 out.push(head('01 | Síntesis ejecutiva'));out.push(para(description(rows,denom,type)));
 if(!v.length)return;
 const a=v[0],b=v[v.length-1];
 out.push(para('El indicador con menor índice relativo es '+a.name+' ('+F(a.v)+'/100), mientras que el mayor corresponde a '+b.name+' ('+F(b.v)+'/100). Esta diferencia es descriptiva; no implica diagnósticos ni niveles oficiales de desempeño.'));
 const d=dim(st).filter(x=>x.v!=null).sort((a,b)=>a.v-b.v)[0];
 if(d)out.push(para('Foco para la lectura educativa: '+d.name+' registra '+F(d.v)+'% de respuestas 3–4 entre sus ítems válidos. Corresponde analizar las preguntas concretas, incluidas las respuestas menos favorables, y triangular con antecedentes del establecimiento.'));
 if(type==='course'){
  const q=st.filter(x=>x.n>=5).sort((x,y)=>y.lowPct-x.lowPct)[0];
  if(q)out.push(para('Evidencia del curso: '+q.low+' de '+q.n+' estudiantes ('+F(q.lowPct)+'%) respondieron 1–2 al ítem «'+statement(grade(rows[0]),q.i)+'». Esta distribución justifica una revisión cualitativa, no una conclusión causal.'));
 }
 if(type==='individual'&&cohort?.length>=5){
  const m=indic(cohort)[a.i].v;if(m!=null)out.push(para('Como referencia descriptiva, el curso obtiene '+F(m)+'/100 en '+a.name+' frente a '+F(a.v)+'/100 del estudiante. No se identifican ni ordenan compañeros.'));
 }
 if(type==='institution')out.push(para('Los instrumentos están adaptados por curso o nivel: los textos de las preguntas no son necesariamente iguales en cada grado. Por ello se presentan comparaciones prudentes por subdimensión y evidencia textual por curso, sin sumar enunciados no equivalentes.'));
}
function profiles(out,opts,st){
 out.push(head('02 | Indicadores IDPS: perfil de resultados'));
 for(const q of indic(opts.rows))bar(out,q.name,q.v,PALETTE[q.i]);
 out.push(para('Cada barra representa un índice transformado 0–100, no un porcentaje de estudiantes ni un resultado oficial de la Agencia de Calidad.',true));
 out.push(head('Distribución real de opciones de respuesta por indicador',true));
 const ranges=[[0,8],[8,16],[16,23],[23,30]];
 for(let i=0;i<ranges.length;i++){
  const items=st.slice(...ranges[i]);const c=[0,0,0,0];
  for(const item of items)item.c.forEach((v,k)=>c[k]+=v);
  const total=c.reduce((a,b)=>a+b,0);
  out.push(new Paragraph({children:[new TextRun({text:LABELS[i],bold:true,color:C.navy,size:19})],keepNext:true,spacing:{before:75,after:20}}));
  out.push(new Paragraph({children:[new ImageRun({data:graphic(c.map((v,k)=>[v,['B96E67','C99B39','76B6B0','407DA9'][k]])),transformation:{width:460,height:20}})],spacing:{after:25}}));
  out.push(para(total?c.map((v,k)=>(k+1)+': '+F(100*v/total)+'% ('+v+')').join('   ·   '):'Sin respuestas válidas',true));
 }
 out.push(para('Leyenda: 1 Nunca o casi nunca (terracota); 2 A veces (ocre); 3 Casi siempre (turquesa); 4 Siempre o casi siempre (azul). Cada barra se calcula sobre respuestas a preguntas, no sobre cantidad de estudiantes.',true));
 out.push(head('03 | Análisis de subdimensiones'));
 for(const d of dim(st))bar(out,d.name,d.v,PALETTE[d.i]);
 out.push(para('El porcentaje de subdimensión expresa respuestas favorables (opciones 3–4) sobre respuestas válidas a sus preguntas. No mide prevalencia de bienestar o riesgo entre personas.',true));
}

const PROFESSIONAL_LENS={
'Autopercepción académica':{
 meaning:'La autopercepción académica se vincula con la confianza para enfrentar desafíos, reconocer capacidades y considerar el error como oportunidad de aprendizaje.',
 inquiry:'Contrastar las percepciones con experiencias de éxito y dificultad en distintas asignaturas, expectativas docentes y disponibilidad de apoyos; no atribuirlas a una capacidad fija.',
 outcome:'Registrar metas acordadas, oportunidades de retroalimentación específica y evolución de la percepción de progreso.'},
'Motivación escolar':{
 meaning:'La motivación escolar reúne interés, persistencia y sentido del aprendizaje; un desacuerdo o baja frecuencia no equivale a falta de voluntad.',
 inquiry:'Indagar pertinencia de las actividades, claridad de metas, participación del estudiantado y experiencias de frustración en tareas complejas.',
 outcome:'Verificar participación en actividades significativas, cumplimiento de metas graduales y devolución del estudiantado.'},
'Ambiente de respeto':{
 meaning:'La percepción de respeto entre pares y adultos constituye una señal sobre la calidad de las interacciones cotidianas, no una medición directa de hechos de violencia.',
 inquiry:'Distinguir entre bromas ofensivas, conflictos, exclusión, relaciones con adultos y episodios concretos mediante escucha segura y observaciones sistemáticas.',
 outcome:'Monitorear acuerdos de trato, registros de observación y nueva consulta anónima sobre relaciones respetuosas.'},
'Ambiente organizado':{
 meaning:'Las respuestas relacionadas con organización describen cómo el grupo experimenta las condiciones que facilitan o interrumpen la concentración y el aprendizaje.',
 inquiry:'Observar momentos de interrupción, transiciones entre actividades, claridad de normas y estrategias adultas de recuperación del trabajo pedagógico.',
 outcome:'Medir frecuencia y duración de interrupciones observadas y acuerdos de funcionamiento del aula.'},
'Ambiente seguro':{
 meaning:'La percepción de seguridad y la posibilidad de solicitar ayuda son componentes protectores diferenciados: sentirse inseguro no equivale por sí mismo a haber sufrido una agresión.',
 inquiry:'Explorar espacios y horarios de preocupación, confianza en adultos de referencia y conocimiento de canales de apoyo, resguardando cualquier revelación sensible.',
 outcome:'Verificar conocimiento de canales de ayuda, medidas implementadas y percepción posterior de seguridad.'},
'Pertenencia':{
 meaning:'El sentido de pertenencia expresa vínculos declarados con el grupo y la comunidad escolar, sin describir por sí solo las causas de cercanía o distanciamiento.',
 inquiry:'Observar experiencias de acogida, reconocimiento, inclusión y relaciones entre pares, prestando atención a grupos con baja participación.',
 outcome:'Registrar participación voluntaria en actividades de vinculación y consulta posterior de pertenencia.'},
'Participación':{
 meaning:'Las oportunidades de participación permiten reconocer si los estudiantes perciben espacios reales para expresar opiniones e involucrarse en la vida escolar.',
 inquiry:'Diferenciar oferta de actividades, barreras de acceso y percepción de influencia efectiva de la voz estudiantil en las decisiones.',
 outcome:'Registrar espacios realizados, propuestas recibidas y decisiones devueltas a los estudiantes.'},
'Vida democrática':{
 meaning:'La convivencia democrática involucra escucha respetuosa, construcción de acuerdos y oportunidades de deliberación dentro del curso.',
 inquiry:'Examinar prácticas concretas de diálogo y decisión colectiva, evitando suponer que el silencio representa conformidad.',
 outcome:'Documentar acuerdos alcanzados, participación efectiva y seguimiento del cumplimiento de lo decidido.'},
'Alimentación':{
 meaning:'Los hábitos alimentarios declarados son relevantes para la experiencia escolar, pero no permiten inferir situación económica, condiciones de salud o responsabilidad familiar.',
 inquiry:'Revisar oportunidades reales de alimentación e hidratación durante la jornada, conocimiento de hábitos protectores y barreras de acceso sin estigmatizar.',
 outcome:'Verificar acciones formativas, acceso a hidratación y percepción de utilidad de las orientaciones.'},
'Vida activa':{
 meaning:'La actividad física cotidiana y las pausas de movimiento forman parte de las oportunidades de bienestar dentro y fuera del establecimiento; no miden condición física ni rendimiento deportivo.',
 inquiry:'Indagar tiempos sedentarios, acceso a espacios, alternativas inclusivas de movimiento y organización de la jornada escolar.',
 outcome:'Registrar oportunidades semanales de movimiento, participación inclusiva y una nueva consulta sobre hábitos.'},
'Autocuidado':{
 meaning:'El autocuidado declarado contempla descanso, higiene y bienestar físico y emocional; sus respuestas deben leerse sin formular explicaciones clínicas o familiares.',
 inquiry:'Explorar hábitos y condiciones escolares que favorecen el descanso y bienestar, preservando la privacidad y coordinando apoyos voluntarios cuando corresponda.',
 outcome:'Registrar actividades preventivas, acuerdos de bienestar y revisión de percepciones en el seguimiento.'}
};
function dimForIndex(i){return DIMS.find(d=>i>=d[1]&&i<d[2])?.[0]||'Dimensión no identificada';}
function evidenceFor(item,g,individual,answers){
 const prompt=statement(g,item.i);
 if(individual){
  const response=Number(A(answers)[item.i]);const labs=answerLabels(g);
  return 'En el enunciado «'+prompt+'», se registró la opción '+(labs[response-1]||String(response))+'.';
 }
 return 'En «'+prompt+'», '+item.low+' de '+item.n+' respuestas ('+F(item.lowPct)+'%) se concentran en las opciones 1–2, mientras '+item.high+' corresponden a las opciones 3–4.';
}
function answerLabels(g){
 const x=String(g||'').toLowerCase().replace(/\s+/g,'');
 return (x==='2°medio'||x==='iimedio')?
 ['Totalmente en desacuerdo','En desacuerdo','De acuerdo','Totalmente de acuerdo']:
 ['Nunca o casi nunca','A veces','Casi siempre','Siempre o casi siempre'];
}
function relativeScope(st,start,end,individual){
 const items=st.slice(start,end).filter(x=>x.n>0).sort((a,b)=>b.lowPct-a.lowPct||a.i-b.i);
 return individual?items.filter(x=>x.low>0):items;
}
function localQuote(st,gradeName,index){const x=st[index];return x?'«'+statement(gradeName,x.i)+'»':'sin datos';}
function integratedProfessionalReading(out,opts,st){
 const {type,rows,groups}=opts;
 out.push(head('Lectura integrada de las necesidades y fortalezas',true));
 if(type==='individual'){
  const d=dim(st).filter(x=>x.n).sort((a,b)=>a.v-b.v);
  const fragile=d.filter(x=>x.v<100).slice(0,2);
  const strengths=d.filter(x=>x.v>0).sort((a,b)=>b.v-a.v).slice(0,2);
  if(fragile.length)out.push(para('En el perfil individual, la exploración profesional puede comenzar por '+fragile.map(x=>x.name).join(' y ')+'. Se trata de respuestas expresadas en un momento determinado: ninguna constituye por sí misma evidencia de un problema persistente, condición clínica o vulneración.'));
  if(strengths.length)out.push(para('Como recursos para el acompañamiento, el estudiante también declara respuestas relativamente favorables en '+strengths.map(x=>x.name).join(' y ')+'. Estas percepciones pueden facilitar acuerdos graduales y acciones que reconozcan sus intereses y fortalezas.'));
  out.push(para('La devolución individual deberá realizarse mediante conversación respetuosa, priorizando lo que el propio estudiante considere relevante, contrastando únicamente con antecedentes educativos pertinentes y registrando acuerdos proporcionales, con resguardo de su confidencialidad.'));
 }else if(type==='course'){
  const gradeName=grade(rows[0]);
  const top=st.filter(x=>x.n>=Math.min(rows.length,8)).sort((a,b)=>b.lowPct-a.lowPct||a.i-b.i);
  const picked=[],used=new Set();
  for(const x of top){const d=dimForIndex(x.i);if(!used.has(d)){used.add(d);picked.push(x);}if(picked.length===3)break;}
  if(picked.length)out.push(para('En la lectura transversal del curso destacan tres ámbitos diferenciados: '+picked.map(x=>dimForIndex(x.i)+' ('+F(x.lowPct)+'% de opciones 1–2 en el ítem '+(x.i+1)+')').join('; ')+'. La presencia simultánea de estos hallazgos orienta una intervención coordinada, pero no demuestra que sean los mismos estudiantes quienes respondieron de forma menos favorable en todos ellos.'));
  for(const x of picked){
   const d=dimForIndex(x.i),f=PROFESSIONAL_LENS[d];
   if(f)out.push(para('Foco de trabajo en '+d+': '+evidenceFor(x,gradeName,false)+ ' '+f.inquiry+' Acción de verificación: '+f.outcome));
  }
  const fully=st.filter(x=>x.n).sort((a,b)=>a.lowPct-b.lowPct||a.i-b.i)[0];
  if(fully)out.push(para('Se identifica asimismo un recurso relativo del grupo en «'+statement(gradeName,fully.i)+'»: '+fully.high+' de '+fully.n+' respuestas se ubicaron en opciones 3–4. Este resultado favorable no neutraliza ni invalida experiencias menos favorables en otros enunciados.'));
 }else{
  const usable=(groups||[]).filter(g=>g.rows&&g.rows.length>=10),all=(groups||[]).filter(g=>g.rows&&g.rows.length>0);
  const counts=LABELS.map((name,i)=>({name,n:usable.reduce((t,g)=>{
   const v=indic(g.rows).filter(x=>x.v!==null).sort((a,b)=>a.v-b.v);
   return t+(v[0]?.i===i?1:0);
  },0)})).sort((a,b)=>b.n-a.n);
  if(usable.length)out.push(para('En '+usable.length+' cursos con al menos diez encuestas completas, el indicador de menor valor relativo dentro de cada curso corresponde con mayor frecuencia a '+counts[0].name+' ('+counts[0].n+' cursos). Este recuento orienta dónde profundizar; no constituye una comparación estandarizada entre niveles ni un ranking.'));
  const small=all.filter(g=>g.rows.length<10);
  if(small.length)out.push(para('En '+small.length+' cursos con menos de diez respuestas completas, la lectura exige precaución adicional; se evita interpretar resultados minoritarios como características estables del grupo.'));
  const signals=usable.map(g=>{
   const stg=stat(g.rows),x=stg.filter(v=>v.n>=10).sort((a,b)=>b.lowPct-a.lowPct||a.i-b.i)[0];
   return x?{g,x}:null;
  }).filter(Boolean).sort((a,b)=>b.x.lowPct-a.x.lowPct);
  const emphasis=signals.slice(0,3);
  if(emphasis.length)out.push(para('La revisión institucional debe iniciar con situaciones verificables por curso. Ejemplos de respuestas que ameritan indagación contextual: '+emphasis.map(({g,x})=>className({grade_desc:g.grade,course_letter:g.letter})+' — '+dimForIndex(x.i)+', '+x.low+' de '+x.n+' opciones 1–2 en «'+statement(g.grade,x.i)+'»').join('; ')+'. Son casos descriptivos; no prueban daño ni permiten generalizaciones al resto del establecimiento.'));
  out.push(para('La priorización institucional debe combinar estos resultados con participación, asistencia, observaciones de aula y registros de convivencia, y establecer decisiones diferenciadas por ciclo educativo. La agregación no sustituye el análisis de cada curso.'));
 }
}

function deep(out,opts,st){
 const {type,rows}=opts,g=grade(rows[0]),aa=A(rows[0].answers),scores=indic(rows),ds=dim(st);
 out.push(head('04 | Análisis profesional socioeducativo por indicador'));
 const ranges=[[0,8],[8,16],[16,23],[23,30]];
 for(let ix=0;ix<4;ix++){
  const [a,b]=ranges[ix],sub=ds.filter(x=>x.i===ix).sort((x,y)=>(x.v??101)-(y.v??101));
  out.push(head(LABELS[ix],true));
  const index=scores[ix].v;
  out.push(para('El índice transformado del indicador alcanza '+F(index)+'/100. La lectura de sus componentes identifica como menor proporción relativa de opciones favorables '+sub.slice(0,2).map(x=>x.name+' ('+F(x.v)+'% de respuestas 3–4 sobre ítems válidos)').join(' y ')+'. Esta distribución orienta preguntas de indagación y no establece por sí misma un nivel de riesgo.'));
  if(type==='individual'){
   const lows=relativeScope(st,a,b,true).slice(0,3);
   for(const x of lows){const d=dimForIndex(x.i),lens=PROFESSIONAL_LENS[d];
    out.push(para(evidenceFor(x,g,true,aa)+' Desde '+d+', '+(lens?.meaning||'corresponde revisar esta percepción con el estudiante')+' '+(lens?.inquiry||'')));
   }
   const strength=st.slice(a,b).filter(x=>x.n&&x.high>0).sort((x,y)=>x.lowPct-y.lowPct)[0];
   if(strength)out.push(para('Factor favorable declarado: '+evidenceFor(strength,g,true,aa)+' Esta percepción puede aprovecharse para acompañar acuerdos sin atribuir etiquetas individuales.'));
   if(!lows.length)out.push(para('No se registraron opciones 1–2 en esta área; aun así, los apoyos deben decidirse considerando el relato del estudiante y su contexto.'));
  }else if(type==='course'){
   const lows=relativeScope(st,a,b,false).slice(0,2);
   for(const x of lows){const d=dimForIndex(x.i),lens=PROFESSIONAL_LENS[d];
    out.push(para('Evidencia observada. '+evidenceFor(x,g,false)+' Interpretación profesional: '+(lens?.meaning||'La distribución refleja una percepción del grupo.')+' Preguntas a contrastar: '+(lens?.inquiry||'Revisar el contexto de la respuesta.') ));
   }
   const strength=st.slice(a,b).filter(x=>x.n).sort((x,y)=>x.lowPct-y.lowPct||x.i-y.i)[0];
   if(strength)out.push(para('Fortaleza relativa: en «'+statement(g,strength.i)+'», '+strength.high+' de '+strength.n+' respuestas se sitúan en opciones 3–4 ('+F(P(strength.high,strength.n))+'%). Se propone sostener las prácticas relacionadas y verificar que alcancen a estudiantes con experiencias diversas.'));
  }else{
   out.push(para('Este resultado integra participantes de distintos grados. Debido a que la formulación específica varía entre versiones del instrumento, la lectura institucional se concentra en la dimensión y exige contrastar los enunciados concretos por curso antes de definir medidas.'));
   for(const x of sub.slice(0,2)){const lens=PROFESSIONAL_LENS[x.name];
    if(lens)out.push(para('Área de profundización: '+x.name+'. '+lens.meaning+' Hipótesis que deben examinarse: '+lens.inquiry));
   }
  }
  const focus=sub[0],action=focus&&ACTIONS[focus.name],lens=focus&&PROFESSIONAL_LENS[focus.name];
  if(action)out.push(para('Orientación para la gestión: '+action[0]+'. Responsable sugerido: '+action[1]+'. Seguimiento: '+(lens?.outcome||action[2])+' Es una propuesta que requiere revisión profesional y acuerdo institucional.'));
 }
 integratedProfessionalReading(out,opts,st);
}
function rawData(out,opts,st){
 if(opts.type==='institution')return;
 const g=grade(opts.rows[0]);out.push(head('05 | Detalle verificable de las 30 preguntas'));
 if(!qs(g).length)out.push(para('Advertencia: no fue posible cargar los textos del cuestionario de este nivel; cotejar el instrumento aplicado.',true));
 if(opts.type==='individual'){
  const a=A(opts.rows[0].answers),labs=answerLabels(g);
  out.push(table(['N.º','Enunciado de la encuesta','Respuesta registrada'],st.map(x=>[x.i+1,statement(g,x.i),Number(a[x.i])>=1&&Number(a[x.i])<=4?labs[Number(a[x.i])-1]:'Sin respuesta'])));
 }else out.push(table(['N.º','Enunciado de la encuesta','1','2','3','4','1–2'],st.map(x=>[x.i+1,statement(g,x.i),...x.c,x.n?F(x.lowPct)+'%':'—'])));
 out.push(para('Opciones registradas: '+answerLabels(g).map((x,i)=>(i+1)+' = '+x).join('; ')+'. Las proporciones por ítem se calculan sobre respuestas válidas.',true));
}
function compare(out,opts){
 const {type,rows,cohort,groups}=opts;out.push(head(type==='institution'?'05 | Comparaciones institucionales y heterogeneidad':'06 | Variabilidad y contrastes descriptivos'));
 if(type==='individual'){
  if(!cohort||cohort.length<5){out.push(para('No se presentan comparaciones de curso por tratarse de menos de cinco respuestas completas.'));return;}
  const x=indic(rows),y=indic(cohort);out.push(table(['Indicador','Estudiante','Curso','Diferencia en puntos'],x.map((v,i)=>[v.name,F(v.v),F(y[i].v),F(v.v-y[i].v)])));
  out.push(para('Los valores de curso se agregan sin mostrar respuestas ni identidades de compañeros. Las diferencias no son rankings ni pruebas diagnósticas.',true));
 }else if(type==='course'){
  const z=rows.map(r=>Number(r.general)).filter(Number.isFinite).sort((a,b)=>a-b);if(z.length>1){const q=t=>z[Math.floor((z.length-1)*t)];out.push(para('Mediana '+F(q(.5))+'/100; P25 '+F(q(.25))+'/100; P75 '+F(q(.75))+'/100; amplitud '+F(z[z.length-1]-z[0])+' puntos. La dispersión indica que el promedio no refleja por sí solo la diversidad de percepciones.'));}
  out.push(para('Los resultados individuales no se publican en cuadros comparativos de curso.'));
 }else{
  out.push(para('La tabla siguiente compara descriptivamente cursos y cobertura de respuestas; no implica jerarquía de calidad ni equivalencia psicométrica entre formularios de diferentes grados.'));
  out.push(table(['Curso','Respuestas','Académica','Convivencia','Participación','Vida saludable'],(groups||[]).map(g=>[className({grade_desc:g.grade,course_letter:g.letter}),g.n,...(g.scores||[]).map(F)])));
  out.push(head('Hallazgos concretos de cada curso',true));
  for(const g of groups||[]){if(!g.rows||!g.rows.length)continue;const st=stat(g.rows),q=st.filter(x=>x.n>=5).sort((a,b)=>b.lowPct-a.lowPct)[0];if(q)out.push(para(className({grade_desc:g.grade,course_letter:g.letter})+': «'+statement(g.grade,q.i)+'». '+q.low+' de '+q.n+' respuestas 1–2 ('+F(q.lowPct)+'%).')); }
 }
}
function plan(out,opts,st){
 const {rows,type,groups}=opts;
 out.push(head(type==='institution'?'06 | Plan institucional de intervención y evaluación':'07 | Plan de acompañamiento y seguimiento'));
 const picks=[],used=new Set();
 if(type==='individual'){
  for(const x of dim(st).filter(v=>v.n&&v.v<100).sort((a,b)=>a.v-b.v)){if(!used.has(x.name)){used.add(x.name);picks.push({name:x.name,detail:'Percepción individual en '+x.name,low:P(x.n-x.yes,x.n)});}if(picks.length>=3)break;}
 }else if(type==='course'){
  for(const x of st.filter(v=>v.n>=Math.min(rows.length,8)).sort((a,b)=>b.lowPct-a.lowPct||a.i-b.i)){
   const name=dimForIndex(x.i);if(!used.has(name)){used.add(name);picks.push({name,detail:'Ítem '+(x.i+1)+': '+x.low+' de '+x.n+' respuestas 1–2 ('+F(x.lowPct)+'%)',low:x.lowPct});}
   if(picks.length>=4)break;
  }
 }else{
  const effective=(groups||[]).filter(g=>g.rows&&g.rows.length>=10);
  const ranking=DIMS.map(([name,a,b])=>{
   let withData=0,relative=0;for(const g of effective){const ds=dim(stat(g.rows)),thisD=ds.find(v=>v.name===name),worst=ds.filter(v=>v.v!=null).sort((x,y)=>x.v-y.v)[0];if(thisD?.v!=null){withData++;if(worst?.name===name)relative++;}}
   return{name,relative,withData};
  }).sort((a,b)=>b.relative-a.relative||a.name.localeCompare(b.name));
  for(const x of ranking.slice(0,4)){picks.push({name:x.name,detail:'Prioridad relativa en '+x.relative+' de '+x.withData+' cursos con diez o más respuestas',low:null});}
 }
 const data=picks.map((x,i)=>{
  const a=ACTIONS[x.name]||['Indagar el significado de las respuestas y consensuar apoyos','Equipo educativo','Registro de seguimiento'];
  return['Prioridad '+(i+1)+'. '+x.name+'. '+x.detail,a[0],a[1],type==='individual'?'Revisión inicial en 2–4 semanas':'Revisión en 6–8 semanas',a[2]];
 });
 if(data.length)out.push(table(['Evidencia priorizada','Intervención propuesta','Responsable','Plazo de revisión','Indicador verificable'],data));
 else out.push(para('No se dispone de suficientes respuestas para seleccionar acciones a partir de este criterio. Corresponde revisar los datos y acordar un plan con el equipo educativo.'));
 out.push(para('Secuencia recomendada: 1) devolución y análisis contextual de hallazgos; 2) acuerdo escrito de responsables y medidas; 3) implementación con registro de actividades; 4) revisión de evidencias y escucha de estudiantes; 5) aplicación de seguimiento del mismo instrumento cuando sea pertinente, sin atribuir causalidad a cambios descriptivos.'));
 if(type==='individual')out.push(para('Los acuerdos deben ser proporcionales y voluntarios, con participación del estudiante y de su familia cuando corresponda, y con acceso restringido al informe.'));
 if(type==='institution')out.push(para('Distinguir medidas transversales del establecimiento de acciones específicas de cada curso; no atribuir a un curso o nivel los resultados agregados de otro.'));
 out.push(para('Las metas, responsables y medidas propuestas son orientativas; deberán ser validadas por el equipo profesional y ajustadas al contexto institucional antes de su implementación.',true));
}
async function reportDoc(opts){
 const {est,type,rows,denom,year}=opts;if(!rows?.length)throw Error('No hay respuestas para generar el informe.');
 const st=stat(rows),first=rows[0],title=type==='individual'?'Informe individual de resultados IDPS':type==='course'?'Informe de resultados IDPS por curso':'Informe institucional de resultados IDPS',out=[];
 out.push(new Paragraph({shading:{fill:C.navy},indent:{left:130},children:[new TextRun({text:'MATERIAL EDUCATIVO CHILE  /  EVALUACIÓN IDPS',color:C.white,bold:true,size:19})],spacing:{before:155,after:170}}));
 out.push(new Paragraph({children:[new TextRun({text:title,bold:true,color:C.navy,size:36})],spacing:{before:150,after:110}}));
 out.push(new Paragraph({children:[new TextRun({text:'Análisis técnico socioeducativo | '+date(new Date()),color:C.muted,size:19})],spacing:{after:200}}));
 const meta=[['Establecimiento',est.name||'—'],['RBD',est.rbd||'—'],['Comuna',est.commune||'—'],['Año',year||first.school_year||'—']];
 if(type==='individual')meta.push(['Estudiante',fullName(first)],['Curso',className(first)],['Fecha de encuesta',date(first.submitted_at)],['Uso','Reservado']);
 else meta.push(['Unidad',type==='course'?className(first):'Institución'],['Respuestas completas',rows.length],['Habilitados comparables',Number.isInteger(Number(denom))?denom:'No disponible'],['Cobertura',Number(denom)>=rows.length&&Number(denom)>0?F(P(rows.length,denom))+'%':'No calculable']);
 out.push(table(['Identificación','Antecedente'],meta));
 sum(out,opts,st);profiles(out,opts,st);deep(out,opts,st);rawData(out,opts,st);compare(out,opts);plan(out,opts,st);
 out.push(head(type==='institution'?'07 | Resguardos metodológicos y de confidencialidad':'08 | Resguardos metodológicos y de confidencialidad'));
 out.push(para('El instrumento utilizado es un diagnóstico interno de Material Educativo Chile. Sus índices son transformaciones descriptivas de respuestas ordinales, no resultados oficiales IDPS/SIMCE, baremos certificados ni diagnósticos clínicos. Las frecuencias deben interpretarse según los enunciados aplicados, su contexto y el grupo participante.'));
 out.push(para('No corresponde formular diagnósticos, sanciones ni conclusiones causales a partir de respuestas aisladas. La devolución debe resguardar identidades y complementarse con entrevistas voluntarias, observaciones pedagógicas, asistencia y antecedentes institucionales pertinentes.'));
 const doc=new Document({creator:'Material Educativo Chile',title,styles:{default:{document:{run:{font:'Times New Roman',size:24,color:C.text},paragraph:{spacing:{line:360}}}}},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1030,bottom:1030,left:1000,right:1000}}},headers:{default:new Header({children:[new Paragraph({children:[new TextRun({text:'IDPS  •  '+(est.name||''),size:16,color:C.muted})],border:{bottom:{color:C.line,style:BorderStyle.SINGLE,size:3}}})]})},footers:{default:new Footer({children:[new Paragraph({children:[new TextRun({text:'MATERIAL EDUCATIVO CHILE  •  Uso reservado  •  Página ',size:16,color:C.muted}),new TextRun({children:[PageNumber.CURRENT],size:16,color:C.muted})],alignment:AlignmentType.RIGHT})]})},children:out}]});
 return Packer.toBuffer(doc);
}
module.exports={reportDoc};