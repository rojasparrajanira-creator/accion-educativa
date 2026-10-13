'use strict';
// Narrativas analíticas IDPS basadas únicamente en respuestas y enunciados efectivamente disponibles.
const AREA=[
 {name:'Autoestima académica y motivación escolar',from:0,to:8,question:'¿Cómo describen los estudiantes su percepción de capacidad, esfuerzo y sentido del aprendizaje?',implication:'Una menor frecuencia de respuestas favorables puede orientar el fortalecimiento de la autoeficacia escolar, la retroalimentación y las experiencias de logro. No permite concluir, por sí sola, bajo rendimiento, desmotivación clínica ni dificultades cognitivas.'},
 {name:'Clima de convivencia escolar',from:8,to:16,question:'¿Cómo perciben el trato, las condiciones de aprendizaje y las oportunidades de protección en la escuela?',implication:'La convivencia debe leerse como experiencia relacional y condición educativa: percepciones menos favorables justifican revisar prácticas, rutinas y canales de ayuda, pero no constituyen por sí mismas pruebas de episodios de violencia o incumplimientos de funcionarios.'},
 {name:'Participación y formación ciudadana',from:16,to:23,question:'¿Qué experiencias declaran acerca de pertenecer, ser escuchados y participar en decisiones?',implication:'Conviene distinguir sentirse parte de la comunidad de contar efectivamente con oportunidades de opinión y decisión. La declaración de participación no prueba incidencia real en los acuerdos del establecimiento.'},
 {name:'Hábitos de vida saludable',from:23,to:30,question:'¿Qué patrones autorreportados aparecen en alimentación, movimiento, descanso y autocuidado?',implication:'Las respuestas informan hábitos percibidos y declarados; no son evaluación médica, nutricional ni medición objetiva de actividad física, sueño o salud. Corresponde ofrecer apoyos formativos no estigmatizantes.'}
];
const MEANING={
 'Autopercepción académica':'La percepción de capacidad y progreso debe contrastarse con oportunidades de aprendizaje, experiencias de éxito, tipos de retroalimentación y accesibilidad de las tareas.',
 'Motivación escolar':'Interesa identificar si el alumnado encuentra sentido a aprender, persevera ante dificultades y dispone de estrategias para continuar; el puntaje no prueba ausencia de interés.',
 'Ambiente de respeto':'El resultado invita a revisar la calidad del trato cotidiano entre pares y con adultos, considerando momentos, espacios y diferencias de experiencia dentro del curso.',
 'Ambiente organizado':'Las respuestas permiten examinar las condiciones que facilitan la concentración y la continuidad pedagógica: interrupciones, acuerdos de aula y consistencia de rutinas.',
 'Ambiente seguro':'La seguridad percibida incluye el entorno y la confianza en pedir apoyo; no es equivalente a un recuento comprobado de situaciones de maltrato.',
 'Pertenencia':'Pertenecer supone vínculos significativos y reconocimiento en la comunidad; conviene consultar a quienes expresan menor adhesión sin atribuir causas personales.',
 'Participación':'Es relevante diferenciar la existencia formal de actividades de la posibilidad real de aportar opiniones y observar que estas influyan en acuerdos.',
 'Vida democrática':'La escucha de perspectivas diferentes y las decisiones compartidas requieren prácticas deliberativas concretas, no solo difusión de normas.',
 'Alimentación':'La lectura considera rutinas, acceso y condiciones de la jornada; no corresponde atribuir decisiones a falta de voluntad individual.',
 'Vida activa':'Conviene examinar las oportunidades accesibles de movimiento durante y fuera de la jornada, sin reducir el problema a conducta individual.',
 'Autocuidado':'Se propone indagar hábitos de descanso y autocuidado desde una perspectiva educativa, resguardando la privacidad y sin formular inferencias clínicas.'
};
const SOLUTIONS={
 'Autopercepción académica':{what:'Instalar metas breves de aprendizaje, retroalimentación específica y autoevaluaciones sobre progreso',who:'UTP, docentes y profesor/a jefe',how:'Pauta de retroalimentación y revisión quincenal de metas',check:'Dos ciclos de metas y devolución estudiantil'},
 'Motivación escolar':{what:'Diseñar actividades graduadas y diversas estrategias para perseverar ante dificultades',who:'UTP, docentes y equipo de apoyo',how:'Observación de estrategias usadas y encuesta corta de experiencia',check:'Cuatro semanas de prácticas documentadas'},
 'Ambiente de respeto':{what:'Desarrollar espacios de escucha y acuerdos de buen trato entre pares, contrastados con observación de interacciones',who:'Convivencia Escolar y profesor/a jefe',how:'Actas de acuerdos, bitácora de seguimiento y consulta anónima',check:'Seguimiento a cuatro y ocho semanas'},
 'Ambiente organizado':{what:'Analizar las interrupciones y acordar rutinas claras que favorezcan la continuidad de las clases',who:'UTP, docentes e Inspectoría según corresponda',how:'Pauta semanal de aula y consulta sobre condiciones para aprender',check:'Cuatro observaciones y revisión de acuerdos'},
 'Ambiente seguro':{what:'Revisar rutas de solicitud de ayuda, supervisión de espacios y tiempos que el alumnado señale',who:'Convivencia Escolar e Inspectoría',how:'Mapa de percepción de seguridad y registro de medidas adoptadas',check:'Canales comunicados y evaluación de accesibilidad'},
 'Pertenencia':{what:'Implementar experiencias de acogida y cooperación con participación de estudiantes menos vinculados',who:'Profesor/a jefe y equipo de apoyo',how:'Participación voluntaria y consulta de percepción',check:'Dos actividades y devolución del grupo'},
 'Participación':{what:'Establecer espacios de propuestas estudiantiles y explicar qué decisiones se adoptaron a partir de ellas',who:'Profesor/a jefe, docentes y representantes estudiantiles',how:'Actas con propuesta, decisión y devolución',check:'Dos consultas con devolución verificable'},
 'Vida democrática':{what:'Practicar deliberación respetuosa y acuerdos de curso sobre asuntos que los afectan',who:'Profesor/a jefe y docentes',how:'Rúbrica de diálogo y actas de decisiones',check:'Dos instancias deliberativas evaluadas'},
 'Alimentación':{what:'Desarrollar educación alimentaria contextualizada y revisar oportunidades de alimentación e hidratación',who:'Equipo de salud escolar y docentes',how:'Registro de acciones y consulta de barreras de acceso',check:'Dos instancias formativas y revisión posterior'},
 'Vida activa':{what:'Aumentar oportunidades inclusivas de pausas activas y movimiento durante la jornada',who:'Educación Física, docentes y equipo directivo',how:'Registro de pausas y participación accesible',check:'Pautas semanales durante seis semanas'},
 'Autocuidado':{what:'Fortalecer educación sobre descanso, higiene, cuidado emocional y rutas de apoyo',who:'Profesor/a jefe y profesionales de apoyo',how:'Actividades realizadas y devolución voluntaria',check:'Registro de implementación y consulta de seguimiento'}
};
const fmt=x=>x===null||x===undefined||!Number.isFinite(Number(x))?'—':Number(x).toFixed(1).replace('.',',');
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const arra=x=>Array.isArray(x)?x:(()=>{try{let q=JSON.parse(x||'[]');return Array.isArray(q)?q:[]}catch{return[]}})();
const grades=r=>String(r.grade_desc||'');
const cLabel=r=>[r.grade_desc||r.grade,r.course_letter||r.letter].filter(Boolean).join(' ').trim();
const dimsBy=dim=>dim.slice().filter(x=>x.v!==null&&x.v!==undefined).sort((a,b)=>a.v-b.v);
function statsFor(rows,from,to){let c=[0,0,0,0],n=0;for(const r of rows){const answers=arra(r.answers);for(let i=from;i<to;i++){let v=Number(answers[i]);if(Number.isInteger(v)&&v>=1&&v<=4){c[v-1]++;n++;}}}return {c,n,p1:n?100*(c[0]+c[1])/n:null,p2:n?100*(c[2]+c[3])/n:null};}
function itemName(type,grade,index,statement){return '«'+statement(grade,index)+'»';}
function indicatorAnalysis({type,rows,st,dim,scores,groups=[],cohort=[],statement}){
 const g=grades(rows[0]),base=scores||[],labels=['Nunca o casi nunca','A veces','Casi siempre','Siempre o casi siempre'];
 return AREA.map((info,ix)=>{
  const subset=st.slice(info.from,info.to),ds=(dim||[]).filter(x=>x.i===ix&&x.n>0).sort((a,b)=>a.v-b.v);
  const distribution=statsFor(rows,info.from,info.to);
  const low=ds[0],second=ds[1],high=ds[ds.length-1];
  const score=base[ix]?.v;
  const sec={name:info.name,question:info.question,figures:[],interpretation:[],recommendation:[],caution:[]};
  sec.figures.push('El índice descriptivo del indicador alcanza '+fmt(score)+'/100. En las respuestas válidas a sus '+(info.to-info.from)+' enunciados, las opciones 1–2 concentran '+fmt(distribution.p1)+'% y las 3–4, '+fmt(distribution.p2)+'%. Estos porcentajes corresponden a respuestas a preguntas, no necesariamente a estudiantes distintos.');
  if(ds.length){
   sec.figures.push('La menor proporción de opciones 3–4 se observa en '+low.name+' ('+fmt(low.v)+'%). '+(second?'Le sigue '+second.name+' ('+fmt(second.v)+'%). ':'')+(high&&high!==low?'Como contrapunto, '+high.name+' registra '+fmt(high.v)+'% de respuestas 3–4.':''));
  }
  if(type==='individual'){
   const answers=arra(rows[0].answers),neg=subset.filter(x=>x.low>0).sort((a,b)=>a.i-b.i),pos=subset.filter(x=>x.high>0).sort((a,b)=>a.i-b.i);
   if(neg.length)sec.figures.push('En el registro individual aparecen respuestas 1–2 en '+neg.slice(0,3).map(x=>itemName(type,g,x.i,statement)+' ('+labels[Number(answers[x.i])-1]+')').join('; ')+'. '+(neg.length>3?'Existen otras respuestas que se detallan en el anexo de 30 preguntas.':''));
   if(pos.length)sec.figures.push('Al mismo tiempo, se reconocen respuestas 3–4 en '+pos.slice(0,2).map(x=>itemName(type,g,x.i,statement)).join(' y ')+', lo que evita describir el perfil exclusivamente desde sus necesidades.');
   sec.interpretation.push('El resultado debe comprenderse como percepción declarada en un momento específico. '+(low?MEANING[low.name]:'Las respuestas requieren lectura contextual.')+' Conviene explorar con el o la estudiante qué situaciones asocia a estas preguntas, qué apoyos percibe como útiles y cuáles son sus fortalezas cotidianas. No resulta pertinente derivar etiquetas personales a partir de una encuesta.');
   if(cohort.length>=5){const values=cohort.map(r=>Number(arra(r.scores)[ix])).filter(Number.isFinite),cmp=mean(values);
    if(cmp!==null&&score!==null){const gap=Number(score)-cmp;
     sec.interpretation.push('Contraste descriptivo con el curso: el grupo registra '+fmt(cmp)+'/100 y el estudiante '+fmt(score)+'/100 (diferencia de '+(gap>0?'+':'')+fmt(gap)+' puntos). Esta referencia permite abrir preguntas, no clasificar ni establecer posiciones individuales.');
    }}
   sec.recommendation.push('Se sugiere una devolución individual respetuosa, voluntaria y orientada a apoyos, con registro de acuerdos y revisión posterior. '+(low?SOLUTIONS[low.name].what+'.':''));
  }else if(type==='course'){
   const top=subset.filter(x=>x.n>0).sort((a,b)=>b.lowPct-a.lowPct||a.i-b.i).slice(0,3),best=subset.filter(x=>x.n>0).sort((a,b)=>a.lowPct-b.lowPct||a.i-b.i)[0];
   for(const x of top.slice(0,2))sec.figures.push('En '+itemName(type,g,x.i,statement)+', '+x.low+' de '+x.n+' estudiantes ('+fmt(x.lowPct)+'%) marcaron 1–2; '+x.high+' marcaron 3–4. La distribución señala percepciones diferenciadas dentro del mismo grupo.');
   if(best&&(!top.some(x=>x.i===best.i)))sec.figures.push('Existe también una fortaleza relativa: '+(best.high)+' de '+best.n+' respuestas ('+fmt(100-best.lowPct)+'%) se sitúan en 3–4 para '+itemName(type,g,best.i,statement)+'.');
   sec.interpretation.push('Desde una lectura socioeducativa, '+(low?MEANING[low.name]:'se requiere explorar las respuestas del grupo en su contexto.')+' '+info.implication);
   if(low&&high&&low!==high){sec.interpretation.push('La distancia entre '+low.name+' ('+fmt(low.v)+'% respuestas 3–4) y '+high.name+' ('+fmt(high.v)+'%) muestra que el grupo no presenta experiencias uniformes en todo el indicador. La planificación debe mantener las prácticas relativamente favorables y atender específicamente la dimensión menos lograda.');}
   sec.recommendation.push('Se recomienda priorizar '+(low?low.name.toLowerCase():'el diálogo con el grupo')+' mediante escucha estudiantil y triangulación con observación pedagógica, asistencia y registros pertinentes. '+(low?SOLUTIONS[low.name].what+'.':''));
  }else {
   const candidates=(groups||[]).filter(x=>x.rows?.length>=10).map(course=>{
    const same=statsFor(course.rows,info.from,info.to);
    const perItems=Array.from({length:info.to-info.from},(_,j)=>{let ix2=info.from+j,c=[0,0,0,0];for(const r of course.rows){const v=Number(arra(r.answers)[ix2]);if(v>=1&&v<=4&&Number.isInteger(v))c[v-1]++;}const n=c.reduce((a,b)=>a+b,0);return{i:ix2,low:c[0]+c[1],n,p:n?100*(c[0]+c[1])/n:0};}).sort((a,b)=>b.p-a.p);
    return {course,same,bad:perItems[0]};
   }).filter(x=>x.bad?.n>=10).sort((a,b)=>b.same.p1-a.same.p1);
   if(candidates.length){
    const q=candidates.slice(0,2);
    sec.figures.push('Para evitar mezclar textos de instrumentos distintos, se presentan ejemplos por curso con al menos 10 participantes: '+q.map(o=>cLabel(o.course)+' — '+itemName(type,o.course.grade,o.bad.i,statement)+': '+o.bad.low+' de '+o.bad.n+' respuestas 1–2 ('+fmt(o.bad.p)+'%)').join('; ')+'.');
   }
   const small=(groups||[]).filter(x=>x.rows?.length<10).length;
   sec.interpretation.push('A escala institucional, la tendencia en '+(low?low.name.toLowerCase():'este indicador')+' plantea revisar prácticas y oportunidades de aprendizaje, pero no atribuir un mismo problema a todos los cursos. '+(low?MEANING[low.name]:'Se recomienda profundizar con evidencia de cada nivel.'));
   sec.interpretation.push('La diversidad de edades y versiones de enunciados limita la comparación estricta entre cursos. '+(small?'Hay '+small+' curso(s) con menos de 10 respuestas completas, cuyos resultados requieren especial cautela. ':'')+'Las acciones deben focalizarse a partir de diagnósticos por curso y ser acompañadas por el equipo de gestión.');
   sec.recommendation.push('Establecer un foco institucional de mejora y planes diferenciados por ciclo, con revisión de prácticas de aula, participación estudiantil y apoyos. '+(low?SOLUTIONS[low.name].what+'.':''));
  }
  if(low)sec.recommendation.push('Responsables sugeridos: '+SOLUTIONS[low.name].who+'. Evidencia esperada: '+SOLUTIONS[low.name].how+'. Seguimiento: '+SOLUTIONS[low.name].check+'.');
  sec.caution.push('Alcance de la interpretación: '+info.implication);
  return sec;
 });
}
function integrated({type,rows,st,dim,scores,groups=[],cohort=[],statement}){
 const ranked=dimsBy(dim),rInd=scores.slice().filter(x=>x.v!==null).sort((a,b)=>a.v-b.v);
 const out=[],f=ranked[0],g=ranked[ranked.length-1];
 if(type==='individual'){
  if(f)out.push('La información individual sugiere conversar primero sobre '+f.name+' ('+fmt(f.v)+'% de respuestas 3–4 en sus preguntas), sin pasar por alto '+(g?g.name:'las fortalezas')+'. El objetivo no es definir un nivel personal de bienestar, sino acordar apoyos útiles según la experiencia y la voluntad del estudiante.');
  out.push('Se recomienda que profesor/a jefe y profesionales pertinentes contrasten esta autopercepción con las condiciones pedagógicas y relacionales observadas. La devolución debe ser privada, sin exhibir las respuestas ante compañeros ni utilizar el instrumento para aplicar medidas disciplinarias.');
 }else if(type==='course'){
  const top=st.filter(x=>x.n>=10).sort((a,b)=>b.lowPct-a.lowPct).slice(0,3),grade=grades(rows[0]);
  if(top.length)out.push('Como prioridades exploratorias aparecen los siguientes enunciados: '+top.map(x=>'«'+statement(grade,x.i)+'» ('+x.low+'/'+x.n+'; '+fmt(x.lowPct)+'% en opciones 1–2)').join('; ')+'. Se trata de evidencia directa de percepción, no de constatación causal.');
  if(f&&g)out.push('La coexistencia de menores adhesiones en '+f.name+' ('+fmt(f.v)+'% respuestas 3–4) y mejores registros relativos en '+g.name+' ('+fmt(g.v)+'%) desaconseja caracterizar globalmente al curso como favorable o desfavorable. Es más útil preservar las condiciones positivas mientras se intervienen situaciones específicas.');
  if(rInd.length>1)out.push('La diferencia de '+fmt(rInd[rInd.length-1].v-rInd[0].v)+' puntos entre el indicador de mayor y menor índice describe una brecha interna del perfil del grupo. Su seguimiento requiere comparar los mismos ítems, participantes y condiciones de aplicación en mediciones sucesivas.');
  out.push('La ruta sugerida es presentar resultados agregados al equipo educativo, contrastarlos mediante una instancia participativa con el curso, acordar intervenciones en un acta y evaluar su implementación a las seis u ocho semanas. Se recomienda evitar la identificación de estudiantes en las devoluciones grupales.');
 }else {
  const courses=groups.filter(x=>x.rows?.length),insufficient=courses.filter(x=>x.rows.length<10);
  out.push('La lectura institucional exige integrar resultados sin invisibilizar diferencias. Los promedios generales no muestran por sí solos la dispersión entre cursos, por lo que deben acompañarse de tablas de cobertura, desagregación por grado y preguntas concretas. Las decisiones deben priorizar evidencias convergentes por subdimensión y no únicamente el menor índice.');
  if(f)out.push('Una primera línea de análisis colectivo corresponde a '+f.name+' ('+fmt(f.v)+'% de respuestas favorables entre sus ítems), con carácter exploratorio. No se puede afirmar que el mismo porcentaje de estudiantes presente dificultades; una persona responde varias preguntas y los instrumentos varían por nivel.');
  if(insufficient.length)out.push('Se identifican '+insufficient.length+' cursos con menos de 10 registros de respuesta. Deben tratarse como grupos de información limitada y no utilizarse para rankings ni afirmaciones concluyentes.');
  out.push('Se propone al equipo directivo y a los responsables de Convivencia Escolar, UTP y formación ciudadana construir una matriz institucional con focos por ciclo, responsables, plazos, evidencia de implementación y nueva consulta. Es indispensable verificar la cobertura con matrícula comparable antes de comunicar resultados globales.');
 }
 return out;
}
function actionRows({type,rows,st,dim,statement}){
 const ranked=dimsBy(dim).slice(0,4),g=grades(rows[0]);
 return ranked.map((d,idx)=>{
  const a=SOLUTIONS[d.name],items=st.slice(d.a,d.b).filter(x=>x.n).sort((a,b)=>b.lowPct-a.lowPct);
  const item=items[0],evidence=type==='individual'?'Respuesta individual en '+d.name:(type==='institution'?'Tendencia agregada de '+d.name+' (revisar por curso)':'Ítem '+(item.i+1)+' ('+(item.low)+'/'+item.n+' opciones 1–2): '+statement(g,item.i));
  return {priority:idx+1,evidence,action:a.what,responsible:a.who,due:'6–8 semanas',verification:a.how,followUp:a.check};
 });
}
module.exports={indicatorAnalysis,integrated,actionRows};