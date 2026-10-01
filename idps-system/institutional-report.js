const express = require('express');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || '';
const pool = DATABASE_URL ? new Pool({connectionString:DATABASE_URL, ssl:{rejectUnauthorized:false}}) : null;

const INDICATORS = [
  {
    name:'Autoestima académica y motivación escolar',
    short:'Autoestima y motivación',
    dimensions:'Autopercepción y autovaloración académica; motivación escolar.',
    meaning:'Este indicador considera cómo las y los estudiantes perciben y valoran sus capacidades para aprender, junto con su interés, disposición, expectativas académicas y respuesta frente a las dificultades del aprendizaje.',
    actions:'Fortalecer experiencias de logro, retroalimentación formativa, reconocimiento del esfuerzo y progreso, metas alcanzables, expectativas positivas y estrategias para afrontar la frustración académica.'
  },
  {
    name:'Clima de convivencia escolar',
    short:'Clima de convivencia',
    dimensions:'Ambiente de respeto; ambiente organizado; ambiente seguro.',
    meaning:'Este indicador aborda la percepción de un entorno escolar respetuoso, organizado y seguro, incluyendo el buen trato, la valoración de la diversidad, la claridad de las normas y la resolución constructiva de conflictos.',
    actions:'Reforzar prácticas de buen trato, prevención de la violencia, claridad y apropiación de normas, resolución colaborativa de conflictos, participación de la comunidad y acciones que fortalezcan la percepción de seguridad.'
  },
  {
    name:'Participación y formación ciudadana',
    short:'Participación y ciudadanía',
    dimensions:'Sentido de pertenencia; participación; vida democrática.',
    meaning:'Este indicador considera el vínculo de las y los estudiantes con su comunidad educativa, las oportunidades de participación y colaboración, y la promoción de habilidades y actitudes necesarias para la vida democrática.',
    actions:'Ampliar espacios de voz y representación estudiantil, participación en decisiones, deliberación, debate fundamentado, organización democrática y experiencias que fortalezcan el sentido de pertenencia.'
  },
  {
    name:'Hábitos de vida saludable',
    short:'Hábitos de vida saludable',
    dimensions:'Hábitos alimenticios; hábitos de vida activa; hábitos de autocuidado.',
    meaning:'Este indicador considera actitudes y conductas asociadas a una vida saludable y la percepción sobre el grado en que el establecimiento promueve alimentación saludable, actividad física y prácticas de autocuidado.',
    actions:'Promover hábitos de alimentación equilibrada, actividad física regular, descanso, autocuidado, prevención de conductas de riesgo y oportunidades sistemáticas de educación para la salud y el bienestar.'
  }
];

function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function parseScores(v){if(Array.isArray(v))return v.map(Number);try{return JSON.parse(v||'[]').map(Number)}catch{return[]}}
function round1(n){return Math.round(Number(n||0)*10)/10;}
function pct(n,d){return d?Math.round(Number(n)*100/Number(d)):0;}
function dateCL(v){try{return new Date(v).toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric'})}catch{return '—'}}
function courseLabel(g,l){return `${g||''} ${l||''}`.trim();}

function internalReading(v){
  v=Number(v||0);
  if(v>=75)return 'Fortaleza relativa';
  if(v>=55)return 'Desarrollo favorable';
  return 'Ámbito prioritario de fortalecimiento';
}
function coverageReading(v){
  if(v>=80)return 'La cobertura alcanzada es amplia y permite contar con una base institucional consistente para el análisis descriptivo de los grupos participantes.';
  if(v>=60)return 'La cobertura es parcial. Los resultados permiten identificar tendencias, pero se recomienda considerar la participación pendiente antes de generalizar conclusiones a toda la población habilitada.';
  return 'La cobertura es limitada. Los resultados deben interpretarse con cautela y como una aproximación inicial, priorizando completar la aplicación antes de adoptar conclusiones institucionales amplias.';
}
function aggregate(rows){
  if(!rows.length)return {n:0,scores:[0,0,0,0],general:0};
  const sums=[0,0,0,0]; let total=0;
  for(const r of rows){
    const s=parseScores(r.scores);
    for(let i=0;i<4;i++)sums[i]+=Number(s[i]||0);
    total+=Number(r.general||0);
  }
  return {n:rows.length,scores:sums.map(x=>round1(x/rows.length)),general:round1(total/rows.length)};
}
function groupRows(rows){
  const map=new Map();
  for(const r of rows){
    const key=`${r.school_year}|${r.grade_desc}|${r.course_letter||''}`;
    if(!map.has(key))map.set(key,[]);
    map.get(key).push(r);
  }
  return [...map.entries()].map(([key,list])=>{
    const [year,grade,letter]=key.split('|');
    return {year:Number(year),grade,letter,...aggregate(list)};
  }).sort((a,b)=>b.year-a.year||String(a.grade).localeCompare(String(b.grade),'es')||String(a.letter).localeCompare(String(b.letter),'es'));
}
function indicatorNarrative(i,value,groups){
  const def=INDICATORS[i];
  const sorted=groups.map(g=>({course:courseLabel(g.grade,g.letter),value:Number(g.scores[i]||0)})).sort((a,b)=>b.value-a.value);
  const top=sorted[0], low=sorted[sorted.length-1];
  const spread=top&&low?round1(top.value-low.value):0;
  let status='';
  if(value>=75){
    status=`El resultado institucional de ${value.toFixed(1)}% configura una fortaleza relativa dentro del perfil obtenido. En términos educativos, las respuestas reflejan una percepción mayoritariamente favorable en los aspectos abordados por este indicador.`;
  }else if(value>=55){
    status=`El resultado institucional de ${value.toFixed(1)}% muestra un desarrollo favorable, aunque todavía existen oportunidades de consolidación. Se recomienda sostener las prácticas que contribuyen positivamente al indicador y focalizar apoyos en los grupos con resultados comparativamente más bajos.`;
  }else{
    status=`El resultado institucional de ${value.toFixed(1)}% identifica este ámbito como una prioridad de fortalecimiento. Las respuestas sugieren la necesidad de revisar prácticas, experiencias y oportunidades institucionales relacionadas con las dimensiones evaluadas, evitando atribuir el resultado a causas únicas o exclusivamente individuales.`;
  }
  const comp=sorted.length>1
    ? ` Entre los cursos con respuestas se observa una diferencia de ${spread.toFixed(1)} puntos porcentuales, desde ${low.course} (${low.value.toFixed(1)}%) hasta ${top.course} (${top.value.toFixed(1)}%). Esta variación aconseja complementar el promedio institucional con un análisis diferenciado por curso.`
    : '';
  return `${def.meaning} ${status}${comp}`;
}
function bar(value){const v=Math.max(0,Math.min(100,Number(value||0)));return `<div class="bar"><span style="width:${v}%"></span></div>`;}

async function buildData(estId){
  if(!pool)throw new Error('La base de datos central no está disponible.');
  const est=(await pool.query('SELECT id,name,rbd,commune FROM idps_establishments WHERE id=$1',[estId])).rows[0];
  if(!est)throw new Error('Establecimiento no encontrado.');
  const responses=(await pool.query(`SELECT r.scores,r.general,r.submitted_at,a.school_year,a.grade_desc,a.course_letter
    FROM idps_responses r
    JOIN idps_applications a ON a.id=r.application_id
    JOIN idps_students s ON s.id=r.student_id
    WHERE r.establishment_id=$1 AND s.active=true
    ORDER BY a.school_year DESC,a.grade_desc,a.course_letter,r.submitted_at`,[estId])).rows;
  const total=(await pool.query(`SELECT COUNT(*)::int AS n FROM idps_applications a JOIN idps_students s ON s.id=a.student_id WHERE a.establishment_id=$1 AND s.active=true`,[estId])).rows[0]?.n||0;
  const institution=aggregate(responses);
  const groups=groupRows(responses);
  return {est,responses,total,institution,groups};
}

function htmlReport(data){
  const {est,total,institution,groups}=data;
  const coverage=pct(institution.n,total||institution.n);
  const ranked=INDICATORS.map((d,i)=>({i,name:d.name,value:Number(institution.scores[i]||0)})).sort((a,b)=>b.value-a.value);
  const strongest=ranked[0], priority=ranked[ranked.length-1];
  const courseTable=groups.map(g=>`<tr><td>${g.year}</td><td>${esc(courseLabel(g.grade,g.letter))}</td><td>${g.n}</td><td>${g.general.toFixed(1)}%</td>${g.scores.map(v=>`<td>${Number(v).toFixed(1)}%</td>`).join('')}</tr>`).join('');
  const resultRows=INDICATORS.map((d,i)=>{const v=Number(institution.scores[i]||0);return `<tr><td><b>${esc(d.name)}</b><div class="mini">${esc(d.dimensions)}</div></td><td class="num">${v.toFixed(1)}%</td><td>${esc(internalReading(v))}</td></tr>`}).join('');
  const analyses=INDICATORS.map((d,i)=>{const v=Number(institution.scores[i]||0);return `<section class="indicator"><h3>${i+1}. ${esc(d.name)} <span>${v.toFixed(1)}%</span></h3><div class="dim"><b>Dimensiones de referencia:</b> ${esc(d.dimensions)}</div>${bar(v)}<p>${esc(indicatorNarrative(i,v,groups))}</p><p class="management"><b>Implicancia para la gestión:</b> ${esc(d.actions)}</p></section>`}).join('');
  const priorityRows=ranked.slice().reverse().slice(0,2).map((x,idx)=>`<tr><td>${idx+1}</td><td><b>${esc(x.name)}</b></td><td>${x.value.toFixed(1)}%</td><td>${esc(INDICATORS[x.i].actions)}</td></tr>`).join('');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Informe Institucional IDPS</title><style>
  :root{--navy:#0F2D52;--blue:#1E7FBC;--turq:#19C2D1;--yellow:#FFD200;--grey:#E6E8EB;--text:#24374b;--muted:#64748b;--paper:#fff}
  *{box-sizing:border-box}body{margin:0;background:#eef2f6;color:var(--text);font-family:Inter,Arial,sans-serif;line-height:1.55}.page{max-width:1040px;margin:24px auto;background:var(--paper);box-shadow:0 8px 32px #0f2d5218}.head{background:var(--navy);color:#fff;padding:24px 34px 22px;border-bottom:5px solid var(--turq)}.headtop{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.brand{font-weight:900;font-size:15px;letter-spacing:.02em}.school{text-align:right;font-size:13px;max-width:430px}.school b{font-size:15px}.title{padding:34px 42px 10px}.title h1{font-size:28px;line-height:1.15;color:var(--navy);margin:0 0 8px}.subtitle{font-size:14px;color:var(--muted)}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:12px 42px 26px}.meta div{background:#f6f8fa;border:1px solid var(--grey);border-radius:8px;padding:10px 12px}.meta small{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;font-weight:800;letter-spacing:.04em}.meta b{font-size:13px;color:var(--navy)}main{padding:0 42px 42px}section{margin:0 0 28px;break-inside:avoid}h2{font-size:18px;color:var(--navy);border-bottom:2px solid var(--grey);padding-bottom:7px;margin:0 0 12px}h3{font-size:15px;color:var(--navy);margin:0 0 8px}p{margin:7px 0 10px;text-align:justify}.lead{font-size:14px}.callout{background:#f3f8fc;border-left:4px solid var(--blue);padding:14px 16px;border-radius:6px}.scope{background:#fffbea;border:1px solid #f4dfa0;padding:13px 15px;border-radius:7px}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:15px 0}.kpi{border:1px solid var(--grey);border-radius:8px;padding:12px;background:#fff}.kpi b{display:block;font-size:22px;color:var(--navy)}.kpi span{font-size:11px;color:var(--muted)}table{width:100%;border-collapse:collapse;font-size:11px;margin:12px 0 4px}th{background:#eaf2f9;color:var(--navy);font-weight:800}th,td{border:1px solid #dce3e9;padding:7px 8px;vertical-align:top}.num{text-align:center;font-weight:800;white-space:nowrap}.mini{font-size:9.5px;color:var(--muted);margin-top:3px}.indicator{border:1px solid var(--grey);border-radius:9px;padding:15px 17px;margin-bottom:14px}.indicator h3{display:flex;justify-content:space-between;gap:12px}.indicator h3 span{font-size:16px;color:var(--blue)}.dim{font-size:11px;color:var(--muted)}.bar{height:9px;background:#e9eef2;border-radius:8px;overflow:hidden;margin:10px 0}.bar span{display:block;height:100%;background:var(--blue)}.management{background:#f7fafc;border-radius:6px;padding:9px 11px;font-size:12px}.note{font-size:10.5px;color:var(--muted)}.actions{display:flex;gap:10px;margin:30px 0 0}.btn{display:inline-block;background:var(--navy);color:#fff;text-decoration:none;border:0;border-radius:8px;padding:10px 14px;font-weight:800;cursor:pointer}.btn.secondary{background:#fff;color:var(--navy);border:1px solid var(--navy)}footer{border-top:1px solid var(--grey);padding:18px 42px 24px;color:var(--muted);font-size:9.5px}.source{margin-top:8px}
  @media(max-width:760px){.page{margin:0;box-shadow:none}.head,.title,main,footer{padding-left:20px;padding-right:20px}.meta{padding-left:20px;padding-right:20px;grid-template-columns:1fr 1fr}.kpis{grid-template-columns:1fr 1fr}.headtop{flex-direction:column}.school{text-align:left}table{display:block;overflow:auto}.title h1{font-size:23px}}
  @media print{@page{size:A4;margin:14mm 13mm}body{background:#fff}.page{max-width:none;margin:0;box-shadow:none}.head{margin:-14mm -13mm 8mm;padding:13mm 13mm 7mm}.title{padding:8mm 0 2mm}.meta{padding:2mm 0 7mm}.meta div{break-inside:avoid}main{padding:0}.no-print{display:none!important}footer{padding:6mm 0 0;margin-top:8mm}.indicator{break-inside:avoid}h2{break-after:avoid}table{font-size:9.5px}th,td{padding:5px 6px}}
  </style></head><body><div class="page">
  <header class="head"><div class="headtop"><div><div class="brand">MATERIAL EDUCATIVO CHILE</div><div style="font-size:11px;opacity:.82">Plataforma de apoyo al análisis de Indicadores de Desarrollo Personal y Social</div></div><div class="school"><b>${esc(est.name)}</b><br>RBD ${esc(est.rbd)}${est.commune?' · '+esc(est.commune):''}</div></div></header>
  <div class="title"><h1>Informe Institucional de Resultados</h1><div class="subtitle">Indicadores de Desarrollo Personal y Social (IDPS) · Análisis descriptivo para la gestión y mejora educativa</div></div>
  <div class="meta"><div><small>Establecimiento</small><b>${esc(est.name)}</b></div><div><small>RBD</small><b>${esc(est.rbd)}</b></div><div><small>Comuna</small><b>${esc(est.commune||'—')}</b></div><div><small>Fecha de emisión</small><b>${dateCL(new Date())}</b></div></div>
  <main>
    <section><h2>1. Antecedentes y propósito del informe</h2><p class="lead">El presente informe sistematiza los resultados obtenidos mediante la aplicación institucional del instrumento de Desarrollo Personal y Social de Material Educativo Chile. Su propósito es aportar evidencia descriptiva para la comprensión de las percepciones y experiencias de las y los estudiantes y apoyar la toma de decisiones de los equipos directivos, de convivencia educativa, orientación y gestión pedagógica.</p><p>La lectura se organiza tomando como marco de referencia las definiciones vigentes de los Indicadores de Desarrollo Personal y Social publicadas por el Ministerio de Educación en el contexto del Sistema Nacional de Aseguramiento de la Calidad. Los IDPS complementan la información académica y contribuyen a ampliar la comprensión de la calidad educativa hacia dimensiones asociadas al desarrollo integral de las y los estudiantes.</p></section>
    <section><h2>2. Marco de referencia y alcance</h2><div class="scope"><b>Alcance del instrumento.</b> Esta aplicación aborda cuatro indicadores basados principalmente en percepciones y conductas autodeclaradas: autoestima académica y motivación escolar, clima de convivencia escolar, participación y formación ciudadana, y hábitos de vida saludable. El marco vigente de IDPS contempla además otros indicadores que se construyen con información administrativa o de resultados, los cuales no forman parte de esta aplicación.</div><p class="note">Los porcentajes presentados corresponden a una escala descriptiva interna de la plataforma. No equivalen a puntajes, categorías ni resultados oficiales informados por la Agencia de Calidad de la Educación. Los rangos cualitativos utilizados tienen una finalidad orientativa para la gestión interna del establecimiento.</p></section>
    <section><h2>3. Cobertura de aplicación</h2><div class="kpis"><div class="kpi"><b>${total}</b><span>Estudiantes habilitados</span></div><div class="kpi"><b>${institution.n}</b><span>Respuestas válidas</span></div><div class="kpi"><b>${coverage}%</b><span>Cobertura institucional</span></div><div class="kpi"><b>${institution.general.toFixed(1)}%</b><span>Promedio descriptivo general</span></div></div><p>${esc(coverageReading(coverage))}</p></section>
    <section><h2>4. Resumen ejecutivo</h2><div class="callout"><p>El perfil institucional evidencia como resultado comparativamente más favorable <b>${esc(strongest.name)}</b>, con ${strongest.value.toFixed(1)}%. En contraste, el ámbito que requiere mayor atención corresponde a <b>${esc(priority.name)}</b>, con ${priority.value.toFixed(1)}%.</p><p>Esta lectura debe comprenderse como una priorización relativa dentro del propio establecimiento. Los resultados no explican por sí mismos las causas de las percepciones observadas; por ello, deben triangularse con antecedentes de convivencia, participación, asistencia, trayectoria educativa, observación pedagógica y otros datos relevantes disponibles en la comunidad.</p></div></section>
    <section><h2>5. Resultados institucionales por indicador</h2><table><thead><tr><th>Indicador</th><th>Resultado</th><th>Lectura descriptiva interna</th></tr></thead><tbody>${resultRows}</tbody></table></section>
    <section><h2>6. Interpretación profesional de los resultados</h2>${analyses}</section>
    <section><h2>7. Análisis comparativo por curso</h2><p>La comparación entre cursos permite reconocer diferencias internas que pueden quedar ocultas en el promedio institucional. Estas variaciones son relevantes para focalizar apoyos y evitar intervenciones homogéneas cuando las necesidades se distribuyen de manera distinta entre grupos.</p><table><thead><tr><th>Año</th><th>Curso</th><th>N</th><th>General</th><th>Autoestima</th><th>Convivencia</th><th>Participación</th><th>Hábitos</th></tr></thead><tbody>${courseTable}</tbody></table></section>
    <section><h2>8. Conclusiones institucionales</h2><p>En términos globales, los resultados muestran un perfil heterogéneo entre los cuatro ámbitos evaluados. La principal fortaleza relativa se sitúa en <b>${esc(strongest.name)}</b>, mientras que <b>${esc(priority.name)}</b> se configura como el foco prioritario para la planificación institucional. La existencia de diferencias entre cursos refuerza la necesidad de combinar acciones transversales con estrategias focalizadas según nivel o grupo.</p><p>Desde una perspectiva de mejora continua, se recomienda que los resultados sean analizados colegiadamente por los equipos responsables, vinculando la evidencia cuantitativa con antecedentes cualitativos y con los instrumentos de gestión del establecimiento.</p></section>
    <section><h2>9. Priorización para la mejora</h2><table><thead><tr><th>Prioridad</th><th>Ámbito</th><th>Resultado</th><th>Orientación de gestión</th></tr></thead><tbody>${priorityRows}</tbody></table><p>Las acciones derivadas de estas prioridades pueden articularse, según corresponda, con el Plan de Mejoramiento Educativo, el Plan de Gestión de la Convivencia Educativa, el Plan de Formación Ciudadana, Orientación, acciones de promoción del bienestar y otras estrategias institucionales.</p></section>
    <section><h2>10. Consideraciones metodológicas para la toma de decisiones</h2><p>Los resultados provienen de respuestas de estudiantes y expresan tendencias agregadas de la población participante. Su interpretación debe considerar la cobertura alcanzada, el contexto de aplicación, las diferencias entre cursos y la naturaleza perceptual de los indicadores evaluados. No corresponde utilizar estos datos como diagnóstico clínico, calificación individual, sanción, ni como sustituto de los resultados oficiales que reportan el Ministerio de Educación o la Agencia de Calidad de la Educación.</p><p>Para fortalecer la validez de las decisiones, se recomienda complementar este informe con evidencia adicional y realizar seguimiento periódico de las acciones implementadas, definiendo responsables, plazos, indicadores de proceso y criterios de verificación.</p></section>
    <div class="no-print actions"><button class="btn" onclick="window.print()">Imprimir / Guardar PDF</button><a class="btn secondary" href="/panel/resultados">Volver a resultados</a></div>
  </main>
  <footer><b>Material Educativo Chile</b> · Informe institucional de apoyo a la gestión educativa.<div class="source">Marco de referencia técnico: Indicadores de Desarrollo Personal y Social vigentes, Unidad de Currículum y Evaluación del Ministerio de Educación, en el contexto del Sistema Nacional de Aseguramiento de la Calidad de la Educación.</div></footer>
  </div></body></html>`;
}

const previousGet=express.application.get;
express.application.get=function institutionalReportPatch(path,...handlers){
  if(path==='/panel/informe/institucional' && handlers.length){
    handlers[handlers.length-1]=async function professionalInstitutionalReport(req,res){
      try{
        const data=await buildData(req.auth.establishmentId);
        if(!data.institution.n){
          return res.send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe institucional</title></head><body style="font-family:Arial;padding:40px"><h1>Informe Institucional de Resultados</h1><p>Aún no existen respuestas registradas para generar el informe.</p><p><a href="/panel/resultados">Volver a resultados</a></p></body></html>`);
        }
        res.setHeader('Cache-Control','private, no-store');
        return res.send(htmlReport(data));
      }catch(e){
        console.error('[INSTITUTIONAL_REPORT]',e);
        if(!res.headersSent)res.status(500).send('No fue posible generar el informe institucional.');
      }
    };
  }
  return previousGet.call(this,path,...handlers);
};
