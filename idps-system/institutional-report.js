const express = require('express');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || '';
const pool = DATABASE_URL ? new Pool({connectionString:DATABASE_URL, ssl:{rejectUnauthorized:false}}) : null;

const IDPS_REFERENCE_URL='https://www.curriculumnacional.cl/tax/evaluacion/62/73/103';
const EID_REFERENCE_URL='https://archivos.agenciaeducacion.cl/estandares_indicativos_de_desempeno.pdf';

const INDICATORS = [
  {
    name:'Autoestima académica y motivación escolar',
    short:'Autoestima y motivación',
    dimensions:'Autopercepción y autovaloración académica; motivación escolar.',
    meaning:'Este indicador considera cómo las y los estudiantes perciben y valoran sus capacidades para aprender, junto con su interés, disposición, expectativas académicas y respuesta frente a las dificultades del aprendizaje.',
    eid:'Estándares Indicativos de Desempeño: dimensión Formación y Convivencia, subdimensión Formación; y Gestión Pedagógica, apoyo al desarrollo de los estudiantes.',
    responsible:'UTP · Profesor/a jefe · Orientación · Equipo de apoyo',
    curricular:[
      {level:'4° básico',code:'OR04 OA 01 y OR04 OA 09',url:'https://www.curriculumnacional.cl/curriculum/1o-6o-basico/orientacion/4-basico',text:'Valoración de características, habilidades y fortalezas; hábitos y actitudes de esfuerzo e interés que favorecen el aprendizaje.'},
      {level:'6° básico',code:'OR06 OA 01 y OR06 OA 09',url:'https://www.curriculumnacional.cl/curriculum/1o-6o-basico/orientacion/6-basico',text:'Valoración positiva de sí mismo; hábitos, metas, perseverancia y autonomía para favorecer el aprendizaje.'},
      {level:'2° medio',code:'OR2M OA 09 y OR2M OA 10',url:'https://www.curriculumnacional.cl/curriculum/7o-basico-2o-medio/orientacion/2-medio',text:'Proyección del aprendizaje y proyecto de vida considerando habilidades, intereses, motivaciones y metas.'}
    ],
    actions:[
      {action:'Implementar un ciclo breve de tutorías y actividades de orientación centrado en fortalezas, metas académicas alcanzables, perseverancia y reconocimiento del progreso.',process:'Al menos 1 instancia mensual por curso priorizado.',evidence:'Planificaciones, registro de tutorías, productos de estudiantes y actas de seguimiento.'},
      {action:'Incorporar prácticas sistemáticas de retroalimentación formativa y reconocimiento del esfuerzo y progreso en las asignaturas, con seguimiento de estudiantes que manifiestan baja autovaloración académica.',process:'Acuerdo pedagógico implementado por los equipos docentes y revisado en reunión técnica.',evidence:'Pauta de retroalimentación, acuerdos UTP, observación de aula y muestras de trabajo.'}
    ]
  },
  {
    name:'Clima de convivencia escolar',
    short:'Clima de convivencia',
    dimensions:'Ambiente de respeto; ambiente organizado; ambiente seguro.',
    meaning:'Este indicador aborda la percepción de un entorno escolar respetuoso, organizado y seguro, incluyendo el buen trato, la valoración de la diversidad, la claridad de las normas y la resolución constructiva de conflictos.',
    eid:'Estándares Indicativos de Desempeño: dimensión Formación y Convivencia, subdimensión Convivencia, con foco en buen trato, respeto, normas, seguridad y abordaje formativo de los conflictos.',
    responsible:'Coordinación de Convivencia Educativa · Inspectoría · Profesor/a jefe · Equipo directivo',
    curricular:[
      {level:'4° básico',code:'OR04 OA 06 y OR04 OA 07',url:'https://www.curriculumnacional.cl/curriculum/1o-6o-basico/orientacion/4-basico',text:'Solidaridad, respeto, buen trato y resolución guiada de conflictos entre pares.'},
      {level:'6° básico',code:'OR06 OA 06 y OR06 OA 07',url:'https://www.curriculumnacional.cl/curriculum/1o-6o-basico/orientacion/6-basico',text:'Solidaridad, respeto, rechazo de la violencia y discriminación; resolución autónoma de conflictos.'},
      {level:'2° medio',code:'OR2M OA 05 y OR2M OA 06',url:'https://www.curriculumnacional.cl/curriculum/7o-basico-2o-medio/orientacion/2-medio',text:'Relaciones interpersonales constructivas y resolución de conflictos en un marco de derechos.'}
    ],
    actions:[
      {action:'Revisar y reforzar acuerdos de convivencia por curso mediante metodologías participativas, explicitando expectativas de buen trato, respeto, organización y seguridad.',process:'100% de cursos priorizados con acuerdos revisados y socializados.',evidence:'Actas de curso, acuerdos visibles, registros de socialización y seguimiento.'},
      {action:'Implementar estrategias de prevención y resolución colaborativa de conflictos, incorporando espacios de diálogo, mediación formativa y análisis de situaciones recurrentes.',process:'Registro mensual de acciones preventivas y seguimiento de situaciones priorizadas.',evidence:'Bitácoras de convivencia, registros de mediación, actas de coordinación y encuestas breves de percepción.'}
    ]
  },
  {
    name:'Participación y formación ciudadana',
    short:'Participación y ciudadanía',
    dimensions:'Sentido de pertenencia; participación; vida democrática.',
    meaning:'Este indicador considera el vínculo de las y los estudiantes con su comunidad educativa, las oportunidades de participación y colaboración, y la promoción de habilidades y actitudes necesarias para la vida democrática.',
    eid:'Estándares Indicativos de Desempeño: dimensión Formación y Convivencia, subdimensión Participación y vida democrática.',
    responsible:'Equipo directivo · Encargado/a de Formación Ciudadana · Profesor/a jefe · Centro de Estudiantes',
    curricular:[
      {level:'4° básico',code:'OR04 OA 08',url:'https://www.curriculumnacional.cl/curriculum/1o-6o-basico/orientacion/4-basico',text:'Participación guiada en la comunidad escolar, responsabilidades, diálogo y toma de decisiones democrática.'},
      {level:'6° básico',code:'OR06 OA 08',url:'https://www.curriculumnacional.cl/curriculum/1o-6o-basico/orientacion/6-basico/or06-oa-08',text:'Participación activa y colaborativa, organización, responsabilidades y toma de decisiones democráticas.'},
      {level:'2° medio',code:'OR2M OA 07 y OR2M OA 08',url:'https://www.curriculumnacional.cl/curriculum/7o-basico-2o-medio/orientacion/2-medio',text:'Participación, equidad, inclusión, justicia, bienestar, buen trato y desarrollo de iniciativas colectivas democráticas.'}
    ],
    actions:[
      {action:'Fortalecer espacios regulares de voz estudiantil y deliberación en Consejo de Curso, Centro de Estudiantes u otras instancias, incorporando temas definidos por las y los estudiantes.',process:'Al menos una instancia mensual de participación efectiva por curso priorizado.',evidence:'Actas, acuerdos, propuestas estudiantiles y seguimiento de compromisos.'},
      {action:'Desarrollar un proyecto de participación o servicio a la comunidad escolar que permita a los estudiantes identificar una necesidad, proponer soluciones, distribuir responsabilidades y evaluar resultados.',process:'Al menos un proyecto por nivel priorizado durante el ciclo de intervención.',evidence:'Plan de proyecto, productos, registro fotográfico, evaluación y reflexión final.'}
    ]
  },
  {
    name:'Hábitos de vida saludable',
    short:'Hábitos de vida saludable',
    dimensions:'Hábitos alimenticios; hábitos de vida activa; hábitos de autocuidado.',
    meaning:'Este indicador considera actitudes y conductas asociadas a una vida saludable y la percepción sobre el grado en que el establecimiento promueve alimentación saludable, actividad física y prácticas de autocuidado.',
    eid:'Estándares Indicativos de Desempeño: dimensión Formación y Convivencia, subdimensión Formación, articulada con prácticas institucionales de bienestar y autocuidado.',
    responsible:'Orientación · Educación Física y Salud · Profesor/a jefe · Equipo de convivencia/bienestar',
    curricular:[
      {level:'4° básico',code:'OR04 OA 05',url:'https://www.curriculumnacional.cl/curriculum/1o-6o-basico/orientacion/4-basico/or04-oa-05',text:'Conductas protectoras y de autocuidado: higiene, descanso, recreación, actividad física, alimentación y prevención de riesgos.'},
      {level:'6° básico',code:'OR06 OA 04 y OR06 OA 05',url:'https://www.curriculumnacional.cl/curriculum/1o-6o-basico/orientacion/6-basico',text:'Conductas protectoras y de autocuidado; prevención del consumo de sustancias y estrategias de vida saludable.'},
      {level:'2° medio',code:'OR2M OA 03 y OR2M OA 04',url:'https://www.curriculumnacional.cl/curriculum/7o-basico-2o-medio/orientacion/2-medio',text:'Identificación de situaciones de riesgo y promoción autónoma de acciones de vida saludable, manejo del estrés, prevención y seguridad.'}
    ],
    actions:[
      {action:'Implementar una secuencia de actividades de orientación y educación para la salud sobre descanso, actividad física, alimentación, manejo del estrés, autocuidado y prevención de riesgos.',process:'Al menos 2 actividades por curso priorizado durante el ciclo.',evidence:'Planificaciones, materiales, registro de aplicación y productos de estudiantes.'},
      {action:'Desarrollar una campaña institucional de hábitos protectores con participación estudiantil y seguimiento de compromisos concretos por curso.',process:'Campaña ejecutada y monitoreada durante al menos 6 semanas.',evidence:'Materiales de campaña, compromisos de curso, registros de seguimiento y encuesta breve final.'}
    ]
  }
];

const OTHER_IDPS=[
  {name:'Asistencia escolar',dimension:'Tasa de asistencia por establecimiento',source:'Registros administrativos/SIGE y resultados oficiales correspondientes.',status:'No se calcula a partir de esta encuesta.',action:'Analizar asistencia por nivel y curso, identificar ausentismo reiterado y acordar estrategias de alerta temprana, contacto con familias y seguimiento de casos.',responsible:'Inspectoría · Dupla psicosocial · Profesor/a jefe · Equipo directivo'},
  {name:'Permanencia escolar',dimension:'Tasa de permanencia por establecimiento',source:'Registros administrativos de trayectoria educativa y resultados oficiales correspondientes.',status:'No se calcula a partir de esta encuesta.',action:'Fortalecer seguimiento de trayectorias, factores de riesgo de desvinculación, acompañamiento individual y articulación con redes y familias.',responsible:'Equipo directivo · Dupla psicosocial · UTP · Profesor/a jefe'},
  {name:'Equidad de género en aprendizajes',dimension:'Equidad de género en aprendizajes',source:'Resultados de aprendizaje desagregados por sexo y reportes oficiales pertinentes.',status:'No debe inferirse desde las respuestas IDPS de esta plataforma.',action:'Analizar brechas de aprendizaje por sexo, revisar expectativas y oportunidades pedagógicas, y definir apoyos cuando se observen diferencias persistentes.',responsible:'UTP · Equipos docentes · Equipo directivo'},
  {name:'Titulación técnico-profesional',dimension:'Tasa de titulación técnico-profesional',source:'Registros de egreso, práctica profesional y titulación de establecimientos EMTP.',status:'Aplica a establecimientos con enseñanza media técnico-profesional.',action:'Monitorear práctica y titulación, acompañar egresados, gestionar centros de práctica y fortalecer orientación vocacional y transición al mundo laboral.',responsible:'Coordinación TP · UTP · Orientación · Equipo directivo'}
];

function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function parseScores(v){if(Array.isArray(v))return v.map(Number);try{return JSON.parse(v||'[]').map(Number)}catch{return[]}}
function round1(n){return Math.round(Number(n||0)*10)/10;}
function pct(n,d){return d?Math.round(Number(n)*100/Number(d)):0;}
function dateCL(v){try{return new Date(v).toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric'})}catch{return '—'}}
function courseLabel(g,l){return `${g||''} ${l||''}`.trim();}
function internalReading(v){v=Number(v||0);if(v>=75)return 'Fortaleza relativa';if(v>=55)return 'Desarrollo favorable';return 'Ámbito prioritario de fortalecimiento';}
function priorityLabel(v){v=Number(v||0);if(v<55)return 'Alta';if(v<75)return 'Media';return 'Sostenimiento';}
function coverageReading(v){if(v>=80)return 'La cobertura alcanzada es amplia y permite contar con una base institucional consistente para el análisis descriptivo de los grupos participantes.';if(v>=60)return 'La cobertura es parcial. Los resultados permiten identificar tendencias, pero se recomienda considerar la participación pendiente antes de generalizar conclusiones a toda la población habilitada.';return 'La cobertura es limitada. Los resultados deben interpretarse con cautela y como una aproximación inicial, priorizando completar la aplicación antes de adoptar conclusiones institucionales amplias.';}
function aggregate(rows){if(!rows.length)return {n:0,scores:[0,0,0,0],general:0};const sums=[0,0,0,0];let total=0;for(const r of rows){const s=parseScores(r.scores);for(let i=0;i<4;i++)sums[i]+=Number(s[i]||0);total+=Number(r.general||0);}return{n:rows.length,scores:sums.map(x=>round1(x/rows.length)),general:round1(total/rows.length)};}
function groupRows(rows){const map=new Map();for(const r of rows){const key=`${r.school_year}|${r.grade_desc}|${r.course_letter||''}`;if(!map.has(key))map.set(key,[]);map.get(key).push(r);}return[...map.entries()].map(([key,list])=>{const[year,grade,letter]=key.split('|');return{year:Number(year),grade,letter,...aggregate(list)};}).sort((a,b)=>b.year-a.year||String(a.grade).localeCompare(String(b.grade),'es')||String(a.letter).localeCompare(String(b.letter),'es'));}
function indicatorNarrative(i,value,groups){const def=INDICATORS[i];const sorted=groups.map(g=>({course:courseLabel(g.grade,g.letter),value:Number(g.scores[i]||0)})).sort((a,b)=>b.value-a.value);const top=sorted[0],low=sorted[sorted.length-1];const spread=top&&low?round1(top.value-low.value):0;let status='';if(value>=75){status=`El resultado institucional de ${value.toFixed(1)}% configura una fortaleza relativa dentro del perfil obtenido. Las respuestas reflejan una percepción mayoritariamente favorable en los aspectos abordados por este indicador.`;}else if(value>=55){status=`El resultado institucional de ${value.toFixed(1)}% muestra un desarrollo favorable, aunque todavía existen oportunidades de consolidación. Se recomienda sostener las prácticas que contribuyen positivamente al indicador y focalizar apoyos en los grupos con resultados comparativamente más bajos.`;}else{status=`El resultado institucional de ${value.toFixed(1)}% identifica este ámbito como una prioridad de fortalecimiento. Las respuestas sugieren revisar prácticas, experiencias y oportunidades institucionales relacionadas con las dimensiones evaluadas, evitando atribuir el resultado a causas únicas o exclusivamente individuales.`;}const comp=sorted.length>1?` Entre los cursos con respuestas se observa una diferencia de ${spread.toFixed(1)} puntos porcentuales, desde ${low.course} (${low.value.toFixed(1)}%) hasta ${top.course} (${top.value.toFixed(1)}%). Esta variación aconseja complementar el promedio institucional con análisis diferenciado por curso.`:'';return`${def.meaning} ${status}${comp}`;}
function bar(value){const v=Math.max(0,Math.min(100,Number(value||0)));return`<div class="bar"><span style="width:${v}%"></span></div>`;}
function curriculumLinks(def){return def.curricular.map(x=>`<div class="oa"><b>${esc(x.level)} · <a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.code)}</a></b><br>${esc(x.text)}</div>`).join('');}

async function buildData(estId){
  if(!pool)throw new Error('La base de datos central no está disponible.');
  const est=(await pool.query('SELECT id,name,rbd,commune FROM idps_establishments WHERE id=$1',[estId])).rows[0];
  if(!est)throw new Error('Establecimiento no encontrado.');
  const responses=(await pool.query(`SELECT r.scores,r.general,r.submitted_at,a.school_year,a.grade_desc,a.course_letter FROM idps_responses r JOIN idps_applications a ON a.id=r.application_id JOIN idps_students s ON s.id=r.student_id WHERE r.establishment_id=$1 AND s.active=true ORDER BY a.school_year DESC,a.grade_desc,a.course_letter,r.submitted_at`,[estId])).rows;
  const total=(await pool.query(`SELECT COUNT(*)::int AS n FROM idps_applications a JOIN idps_students s ON s.id=a.student_id WHERE a.establishment_id=$1 AND s.active=true`,[estId])).rows[0]?.n||0;
  return {est,responses,total,institution:aggregate(responses),groups:groupRows(responses)};
}

function interventionRows(institution){
  const ranked=INDICATORS.map((d,i)=>({i,value:Number(institution.scores[i]||0)})).sort((a,b)=>a.value-b.value);
  const order=new Map(ranked.map((x,idx)=>[x.i,idx+1]));
  const rows=[];
  INDICATORS.forEach((d,i)=>{
    const v=Number(institution.scores[i]||0);
    d.actions.forEach((a,j)=>rows.push(`<tr><td>${order.get(i)}</td><td><b>${esc(d.short)}</b><div class="mini">Línea ${j+1} · ${esc(priorityLabel(v))}</div></td><td>${esc(a.action)}</td><td>${esc(d.responsible)}</td><td>${esc(a.process)}</td><td>${esc(a.evidence)}</td><td>${curriculumLinks(d)}<div class="eid"><b>Agencia / EID:</b> ${esc(d.eid)}</div></td></tr>`));
  });
  return rows.join('');
}

function ganttRows(institution){
  const ranked=INDICATORS.map((d,i)=>({i,value:Number(institution.scores[i]||0)})).sort((a,b)=>a.value-b.value);
  const p1=INDICATORS[ranked[0].i].short,p2=INDICATORS[ranked[1].i].short;
  const tasks=[
    ['Socialización del diagnóstico y triangulación de antecedentes',[1,1,0,0,0,0]],
    ['Definición de metas, responsables y evidencias',[1,1,0,0,0,0]],
    [`Implementación prioritaria: ${p1}`,[0,1,1,1,0,0]],
    [`Implementación prioritaria: ${p2}`,[0,1,1,1,0,0]],
    ['Acciones de sostenimiento en los demás indicadores',[0,1,1,1,1,0]],
    ['Levantamiento de otros IDPS administrativos',[1,1,1,0,0,0]],
    ['Monitoreo de proceso y ajustes',[0,0,1,1,1,0]],
    ['Reaplicación / evaluación de cierre y acuerdos de continuidad',[0,0,0,0,1,1]]
  ];
  return tasks.map(t=>`<tr><td>${esc(t[0])}</td>${t[1].map(x=>`<td class="gcell ${x?'on':''}">${x?'●':''}</td>`).join('')}</tr>`).join('');
}

function htmlReport(data){
  const {est,total,institution,groups}=data;
  const coverage=pct(institution.n,total||institution.n);
  const ranked=INDICATORS.map((d,i)=>({i,name:d.name,value:Number(institution.scores[i]||0)})).sort((a,b)=>b.value-a.value);
  const strongest=ranked[0],priority=ranked[ranked.length-1];
  const courseTable=groups.map(g=>`<tr><td>${g.year}</td><td>${esc(courseLabel(g.grade,g.letter))}</td><td>${g.n}</td><td>${g.general.toFixed(1)}%</td>${g.scores.map(v=>`<td>${Number(v).toFixed(1)}%</td>`).join('')}</tr>`).join('');
  const resultRows=INDICATORS.map((d,i)=>{const v=Number(institution.scores[i]||0);return`<tr><td><b>${esc(d.name)}</b><div class="mini">${esc(d.dimensions)}</div></td><td class="num">${v.toFixed(1)}%</td><td>${esc(internalReading(v))}</td><td>${esc(priorityLabel(v))}</td></tr>`}).join('');
  const analyses=INDICATORS.map((d,i)=>{const v=Number(institution.scores[i]||0);return`<section class="indicator"><h3>${i+1}. ${esc(d.name)} <span>${v.toFixed(1)}%</span></h3><div class="dim"><b>Dimensiones de referencia:</b> ${esc(d.dimensions)}</div>${bar(v)}<p>${esc(indicatorNarrative(i,v,groups))}</p><div class="management"><b>Vinculación curricular:</b>${curriculumLinks(d)}<div class="eid"><b>Vinculación con Agencia / EID:</b> ${esc(d.eid)}</div></div></section>`}).join('');
  const otherRows=OTHER_IDPS.map(x=>`<tr><td><b>${esc(x.name)}</b><div class="mini">${esc(x.dimension)}</div></td><td>${esc(x.source)}</td><td>${esc(x.status)}</td><td>${esc(x.action)}</td><td>${esc(x.responsible)}</td></tr>`).join('');
  const priorityRows=ranked.slice().reverse().slice(0,2).map((x,idx)=>`<tr><td>${idx+1}</td><td><b>${esc(x.name)}</b></td><td>${x.value.toFixed(1)}%</td><td>${esc(INDICATORS[x.i].actions[0].action)}</td><td>${esc(INDICATORS[x.i].responsible)}</td></tr>`).join('');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Informe Institucional IDPS</title><style>
  :root{--navy:#0F2D52;--blue:#1E7FBC;--turq:#19C2D1;--yellow:#FFD200;--grey:#E6E8EB;--text:#24374b;--muted:#64748b;--paper:#fff}
  *{box-sizing:border-box}body{margin:0;background:#eef2f6;color:var(--text);font-family:Inter,Arial,sans-serif;line-height:1.5}.page{max-width:1180px;margin:24px auto;background:var(--paper);box-shadow:0 8px 32px #0f2d5218}.head{background:var(--navy);color:#fff;padding:24px 34px 22px;border-bottom:5px solid var(--turq)}.headtop{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.brand{font-weight:900;font-size:15px;letter-spacing:.02em}.school{text-align:right;font-size:13px;max-width:460px}.school b{font-size:15px}.title{padding:34px 42px 10px}.title h1{font-size:28px;line-height:1.15;color:var(--navy);margin:0 0 8px}.subtitle{font-size:14px;color:var(--muted)}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:12px 42px 26px}.meta div{background:#f6f8fa;border:1px solid var(--grey);border-radius:8px;padding:10px 12px}.meta small{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;font-weight:800}.meta b{font-size:13px;color:var(--navy)}main{padding:0 42px 42px}section{margin:0 0 28px;break-inside:avoid}h2{font-size:18px;color:var(--navy);border-bottom:2px solid var(--grey);padding-bottom:7px;margin:0 0 12px}h3{font-size:15px;color:var(--navy);margin:0 0 8px}p{margin:7px 0 10px;text-align:justify}.lead{font-size:14px}.callout{background:#f3f8fc;border-left:4px solid var(--blue);padding:14px 16px;border-radius:6px}.scope{background:#fffbea;border:1px solid #f4dfa0;padding:13px 15px;border-radius:7px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:15px 0}.kpi{border:1px solid var(--grey);border-radius:8px;padding:12px;background:#fff}.kpi b{display:block;font-size:22px;color:var(--navy)}.kpi span{font-size:11px;color:var(--muted)}table{width:100%;border-collapse:collapse;font-size:10.5px;margin:12px 0 4px}th{background:#eaf2f9;color:var(--navy);font-weight:800}th,td{border:1px solid #dce3e9;padding:7px 8px;vertical-align:top}.num{text-align:center;font-weight:800;white-space:nowrap}.mini{font-size:9.5px;color:var(--muted);margin-top:3px}.indicator{border:1px solid var(--grey);border-radius:9px;padding:15px 17px;margin-bottom:14px}.indicator h3{display:flex;justify-content:space-between;gap:12px}.indicator h3 span{font-size:16px;color:var(--blue)}.dim{font-size:11px;color:var(--muted)}.bar{height:9px;background:#e9eef2;border-radius:8px;overflow:hidden;margin:10px 0}.bar span{display:block;height:100%;background:var(--blue)}.management{background:#f7fafc;border-radius:6px;padding:10px 12px;font-size:11px}.oa{margin:6px 0;padding-left:10px;border-left:2px solid var(--turq)}.oa a{color:var(--blue);text-decoration:none}.eid{margin-top:8px}.note{font-size:10.5px;color:var(--muted)}.actions{display:flex;gap:10px;margin:30px 0 0}.btn{display:inline-block;background:var(--navy);color:#fff;text-decoration:none;border:0;border-radius:8px;padding:10px 14px;font-weight:800;cursor:pointer}.btn.secondary{background:#fff;color:var(--navy);border:1px solid var(--navy)}.gantt th,.gantt td{text-align:center}.gantt td:first-child,.gantt th:first-child{text-align:left}.gcell{min-width:55px}.gcell.on{background:#dff5f7;color:var(--navy);font-weight:900}.plan-table{font-size:9.2px}.plan-table td{line-height:1.35}.plan-table th:nth-child(3){min-width:210px}.plan-table th:nth-child(7){min-width:235px}.sources a{color:var(--blue)}footer{border-top:1px solid var(--grey);padding:18px 42px 24px;color:var(--muted);font-size:9.5px}.source{margin-top:8px}
  @media(max-width:760px){.page{margin:0;box-shadow:none}.head,.title,main,footer{padding-left:20px;padding-right:20px}.meta{padding-left:20px;padding-right:20px;grid-template-columns:1fr 1fr}.kpis{grid-template-columns:1fr 1fr}.headtop{flex-direction:column}.school{text-align:left}table{display:block;overflow:auto}.title h1{font-size:23px}}
  @media print{@page{size:A4 landscape;margin:11mm}body{background:#fff}.page{max-width:none;margin:0;box-shadow:none}.head{margin:-11mm -11mm 7mm;padding:9mm 11mm 6mm}.title{padding:6mm 0 2mm}.meta{padding:2mm 0 6mm}.meta div{break-inside:avoid}main{padding:0}.no-print{display:none!important}footer{padding:5mm 0 0;margin-top:6mm}.indicator{break-inside:avoid}h2{break-after:avoid}table{font-size:8.3px}th,td{padding:4px 5px}.plan-table{font-size:7.4px}.oa{margin:3px 0}.gcell{min-width:42px}}
  </style></head><body><div class="page">
  <header class="head"><div class="headtop"><div><div class="brand">MATERIAL EDUCATIVO CHILE</div><div style="font-size:11px;opacity:.82">Plataforma de apoyo al análisis y mejora de Indicadores de Desarrollo Personal y Social</div></div><div class="school"><b>${esc(est.name)}</b><br>RBD ${esc(est.rbd)}${est.commune?' · '+esc(est.commune):''}</div></div></header>
  <div class="title"><h1>Informe Institucional de Resultados y Plan de Intervención</h1><div class="subtitle">Indicadores de Desarrollo Personal y Social (IDPS) · Diagnóstico, análisis, vinculación curricular y planificación de mejora</div></div>
  <div class="meta"><div><small>Establecimiento</small><b>${esc(est.name)}</b></div><div><small>RBD</small><b>${esc(est.rbd)}</b></div><div><small>Comuna</small><b>${esc(est.commune||'—')}</b></div><div><small>Fecha de emisión</small><b>${dateCL(new Date())}</b></div></div>
  <main>
    <section><h2>1. Antecedentes y propósito</h2><p class="lead">El presente informe integra el diagnóstico institucional obtenido a partir de la aplicación del instrumento de Desarrollo Personal y Social de Material Educativo Chile con un plan de intervención sugerido, orientado a transformar la evidencia disponible en decisiones, acciones, responsabilidades, mecanismos de seguimiento y vinculación curricular.</p><p>La lectura utiliza como referencia las definiciones vigentes de los Indicadores de Desarrollo Personal y Social del Ministerio de Educación y, para la dimensión de gestión, los Estándares Indicativos de Desempeño utilizados por la Agencia de Calidad de la Educación como marco orientador para la mejora continua.</p></section>

    <section><h2>2. Marco vigente de IDPS y alcance de la plataforma</h2><div class="scope"><b>Indicadores abordados por la encuesta:</b> autoestima académica y motivación escolar; clima de convivencia escolar; participación y formación ciudadana; hábitos de vida saludable. <b>Otros IDPS vigentes:</b> asistencia escolar, permanencia escolar, equidad de género en aprendizajes y titulación técnico-profesional. Estos últimos requieren fuentes administrativas o de resultados y no deben estimarse a partir de esta encuesta.</div><p class="note">Los porcentajes de esta plataforma corresponden a una escala descriptiva interna y no equivalen a puntajes, categorías o resultados oficiales informados por el Ministerio de Educación o la Agencia de Calidad de la Educación.</p></section>

    <section><h2>3. Cobertura de aplicación</h2><div class="kpis"><div class="kpi"><b>${total}</b><span>Estudiantes habilitados</span></div><div class="kpi"><b>${institution.n}</b><span>Respuestas válidas</span></div><div class="kpi"><b>${coverage}%</b><span>Cobertura institucional</span></div><div class="kpi"><b>${institution.general.toFixed(1)}%</b><span>Promedio descriptivo general</span></div></div><p>${esc(coverageReading(coverage))}</p></section>

    <section><h2>4. Resumen ejecutivo</h2><div class="callout"><p>El perfil institucional evidencia como resultado comparativamente más favorable <b>${esc(strongest.name)}</b>, con ${strongest.value.toFixed(1)}%. En contraste, el ámbito que requiere mayor atención corresponde a <b>${esc(priority.name)}</b>, con ${priority.value.toFixed(1)}%.</p><p>La priorización es relativa al propio establecimiento y no constituye una clasificación oficial. Los resultados deben triangularse con antecedentes de convivencia, asistencia, permanencia, resultados de aprendizaje, participación, trayectoria educativa y observación pedagógica antes de adoptar decisiones institucionales.</p></div></section>

    <section><h2>5. Resultados institucionales</h2><table><thead><tr><th>Indicador</th><th>Resultado</th><th>Lectura descriptiva interna</th><th>Prioridad de gestión</th></tr></thead><tbody>${resultRows}</tbody></table></section>

    <section><h2>6. Interpretación profesional y vinculación curricular</h2>${analyses}</section>

    <section><h2>7. Análisis comparativo por curso</h2><p>La comparación entre cursos permite reconocer diferencias internas que pueden quedar ocultas en el promedio institucional. Estas variaciones son relevantes para focalizar apoyos y evitar intervenciones homogéneas cuando las necesidades se distribuyen de manera distinta entre grupos.</p><table><thead><tr><th>Año</th><th>Curso</th><th>N</th><th>General</th><th>Autoestima</th><th>Convivencia</th><th>Participación</th><th>Hábitos</th></tr></thead><tbody>${courseTable}</tbody></table></section>

    <section><h2>8. Otros Indicadores de Desarrollo Personal y Social</h2><p>Para una lectura institucional integral, el establecimiento debe complementar esta aplicación con los indicadores que se construyen a partir de información administrativa y de resultados. La plataforma los incorpora en el plan como líneas de seguimiento, sin asignarles un puntaje que no corresponda a la fuente oficial.</p><table><thead><tr><th>Indicador</th><th>Fuente necesaria</th><th>Estado en este informe</th><th>Acción de gestión sugerida</th><th>Responsables sugeridos</th></tr></thead><tbody>${otherRows}</tbody></table></section>

    <section><h2>9. Priorización institucional</h2><table><thead><tr><th>Prioridad</th><th>Ámbito</th><th>Resultado</th><th>Primera acción sugerida</th><th>Responsables</th></tr></thead><tbody>${priorityRows}</tbody></table></section>

    <section><h2>10. Plan de intervención institucional vinculado al Currículum Nacional y a la gestión de calidad</h2><p>El siguiente plan constituye una propuesta base que debe ser contextualizada por el establecimiento. Las acciones se vinculan con Objetivos de Aprendizaje de Orientación de 4° básico, 6° básico y 2° medio y con las dimensiones de Formación y Convivencia de los Estándares Indicativos de Desempeño. Se recomienda integrar estas acciones al PME, Plan de Gestión de la Convivencia Educativa, Plan de Formación Ciudadana, Orientación y otras estrategias institucionales pertinentes.</p><table class="plan-table"><thead><tr><th>Orden</th><th>Indicador / prioridad</th><th>Acción</th><th>Responsables sugeridos</th><th>Indicador de proceso / meta</th><th>Medio de verificación</th><th>Vinculación curricular y EID</th></tr></thead><tbody>${interventionRows(institution)}</tbody></table></section>

    <section><h2>11. Carta Gantt sugerida · ciclo de 12 semanas</h2><p>La temporalización puede adaptarse al calendario escolar y a las prioridades definidas por el equipo responsable.</p><table class="gantt"><thead><tr><th>Actividad</th><th>Sem. 1–2</th><th>Sem. 3–4</th><th>Sem. 5–6</th><th>Sem. 7–8</th><th>Sem. 9–10</th><th>Sem. 11–12</th></tr></thead><tbody>${ganttRows(institution)}</tbody></table></section>

    <section><h2>12. Seguimiento y evaluación del plan</h2><p>Se recomienda realizar un monitoreo quincenal o mensual de las acciones, registrar nivel de ejecución, cobertura, dificultades y evidencias, y efectuar una revisión intermedia en la semana 6. Al cierre del ciclo, la comunidad educativa debiera contrastar la evidencia de proceso con una nueva medición interna o instrumento breve de seguimiento, evitando atribuir cambios a una única acción cuando intervienen múltiples factores del contexto escolar.</p><div class="callout"><b>Criterios mínimos de seguimiento:</b> porcentaje de acciones ejecutadas; cobertura de estudiantes; cumplimiento de responsables y plazos; participación de estudiantes; evidencia de implementación; variación en la percepción del indicador priorizado; acuerdos de continuidad o ajuste.</div></section>

    <section><h2>13. Conclusiones institucionales</h2><p>En términos globales, los resultados muestran un perfil heterogéneo entre los cuatro ámbitos evaluados. La principal fortaleza relativa se sitúa en <b>${esc(strongest.name)}</b>, mientras que <b>${esc(priority.name)}</b> se configura como el foco prioritario para la planificación institucional. La mejora requiere combinar acciones transversales, estrategias focalizadas por curso y seguimiento de los otros IDPS construidos con registros administrativos o de aprendizaje.</p><p>El valor del informe radica en utilizar la evidencia como punto de partida para un ciclo de mejora: analizar, priorizar, planificar, implementar, monitorear y volver a evaluar. La responsabilidad final sobre la selección y adecuación de las acciones corresponde al establecimiento y a sus equipos profesionales.</p></section>

    <section><h2>14. Consideraciones metodológicas</h2><p>Los resultados provienen de respuestas de estudiantes y expresan tendencias agregadas de la población participante. Su interpretación debe considerar la cobertura alcanzada, el contexto de aplicación, las diferencias entre cursos y la naturaleza perceptual de los indicadores evaluados. No corresponde utilizar estos datos como diagnóstico clínico, calificación individual, sanción ni sustituto de resultados oficiales.</p><p>Los otros cuatro IDPS —asistencia escolar, permanencia escolar, equidad de género en aprendizajes y titulación técnico-profesional— requieren fuentes de información distintas. En consecuencia, este informe los incorpora como componentes de gestión y seguimiento, pero no inventa puntajes ni resultados ausentes.</p></section>

    <section class="sources"><h2>15. Referencias técnicas</h2><p>Ministerio de Educación, Currículum Nacional: <a href="${IDPS_REFERENCE_URL}" target="_blank" rel="noopener">Estándares y otros indicadores · IDPS vigentes</a>.</p><p>Agencia de Calidad de la Educación / Ministerio de Educación: <a href="${EID_REFERENCE_URL}" target="_blank" rel="noopener">Estándares Indicativos de Desempeño para establecimientos educacionales y sus sostenedores</a>.</p><p class="note">Los enlaces curriculares incluidos en el plan dirigen a las páginas oficiales de Currículum Nacional correspondientes a Orientación en 4° básico, 6° básico y 2° medio.</p></section>

    <div class="no-print actions"><button class="btn" onclick="window.print()">Imprimir / Guardar PDF</button><a class="btn secondary" href="/panel/resultados">Volver a resultados</a></div>
  </main>
  <footer><b>Material Educativo Chile</b> · Informe institucional de apoyo a la gestión educativa.<div class="source">Documento generado a partir de resultados internos de la plataforma. Las referencias a IDPS, Currículum Nacional y Estándares Indicativos de Desempeño se utilizan como marco técnico orientador y no implican certificación ni validación oficial de la Agencia de Calidad de la Educación.</div></footer>
  </div></body></html>`;
}

const previousGet=express.application.get;
express.application.get=function institutionalReportPatch(path,...handlers){
  if(path==='/panel/informe/institucional' && handlers.length){
    handlers[handlers.length-1]=async function professionalInstitutionalReport(req,res){
      try{
        const data=await buildData(req.auth.establishmentId);
        if(!data.institution.n)return res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe institucional</title></head><body style="font-family:Arial;padding:40px"><h1>Informe Institucional de Resultados</h1><p>Aún no existen respuestas registradas para generar el informe.</p><p><a href="/panel/resultados">Volver a resultados</a></p></body></html>`);
        res.setHeader('Cache-Control','private, no-store');
        return res.send(htmlReport(data));
      }catch(e){console.error('[INSTITUTIONAL_REPORT]',e);if(!res.headersSent)res.status(500).send('No fue posible generar el informe institucional.');}
    };
  }
  return previousGet.call(this,path,...handlers);
};
