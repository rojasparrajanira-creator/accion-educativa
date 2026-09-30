const express = require('express');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');
const crypto = require('crypto');

const DATABASE_URL = process.env.DATABASE_URL || '';
const SURVEY_URL = (process.env.SURVEY_URL || 'https://diagnostico-idps-material-educativo.onrender.com').replace(/\/$/, '');
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://idps-gestion-material-educativo.onrender.com').replace(/\/$/, '');
const pool = DATABASE_URL ? new Pool({connectionString:DATABASE_URL, ssl:{rejectUnauthorized:false}}) : null;
const MIN_GROUP = 5;
let requireEst = null;

function esc(v='') {
  return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function norm(v='') {
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
}
function surveyLevel(grade='') {
  const g = norm(grade);
  if (g === '4basico' || g === '4basic') return '4° básico';
  if (g === '6basico' || g === '6basic') return '6° básico';
  if (g === '2medio') return '2° medio';
  return '';
}
function questionLevel(level='') { return level === '2° medio' ? 'II medio' : level; }
function validUuid(v='') { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v)); }
function surveyLink(token) { return `${SURVEY_URL}/encuesta-idps.html?t=${encodeURIComponent(token)}`; }
function pct(n,d) { return d ? Math.round((n/d)*100) : 0; }
function round1(n) { return Math.round(Number(n)*10)/10; }
function calcScores(answers) {
  const groups = [answers.slice(0,8), answers.slice(8,16), answers.slice(16,23), answers.slice(23,30)];
  const scores = groups.map(v => round1(((v.reduce((a,b)=>a+b,0)-v.length)/(v.length*3))*100));
  return {scores, general:round1(scores.reduce((a,b)=>a+b,0)/scores.length)};
}
function reading(value) {
  if (value >= 75) return 'Fortaleza relativa';
  if (value >= 55) return 'Desarrollo intermedio';
  return 'Área prioritaria de trabajo';
}
const INDICATORS = [
  'Autoestima académica y motivación escolar',
  'Clima de convivencia escolar',
  'Participación y formación ciudadana',
  'Hábitos de vida saludable'
];
const RECOMMENDATIONS = [
  'Fortalecer experiencias de logro, retroalimentación formativa, metas alcanzables y reconocimiento del esfuerzo.',
  'Reforzar acuerdos de convivencia, buen trato, prevención de violencia, resolución colaborativa de conflictos y percepción de seguridad.',
  'Aumentar instancias de voz estudiantil, participación en decisiones, pertenencia y experiencias de formación ciudadana.',
  'Promover rutinas de autocuidado, actividad física, descanso, alimentación saludable y hábitos protectores sostenidos.'
];

async function ensureTables() {
  if (!pool) throw new Error('La base de datos central no está disponible.');
  await pool.query(`CREATE TABLE IF NOT EXISTS idps_students (
    id uuid PRIMARY KEY,
    establishment_id uuid NOT NULL REFERENCES idps_establishments(id) ON DELETE CASCADE,
    school_year integer NOT NULL,
    source_rbd text,
    grade_desc text NOT NULL,
    course_letter text,
    run text NOT NULL,
    dv text NOT NULL,
    gender text,
    first_names text,
    last_name_paternal text,
    last_name_maternal text,
    birth_date date,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(establishment_id,school_year,run,dv)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS idps_applications (
    id uuid PRIMARY KEY,
    token uuid NOT NULL UNIQUE,
    establishment_id uuid NOT NULL REFERENCES idps_establishments(id) ON DELETE CASCADE,
    student_id uuid NOT NULL UNIQUE REFERENCES idps_students(id) ON DELETE CASCADE,
    school_year integer NOT NULL,
    level text NOT NULL,
    grade_desc text NOT NULL,
    course_letter text,
    status text NOT NULL DEFAULT 'pending',
    created_at timestamptz NOT NULL DEFAULT now(),
    opened_at timestamptz,
    completed_at timestamptz
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idps_applications_est_idx ON idps_applications(establishment_id,school_year,grade_desc,course_letter,status)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS idps_responses (
    id uuid PRIMARY KEY,
    application_id uuid NOT NULL UNIQUE REFERENCES idps_applications(id) ON DELETE CASCADE,
    establishment_id uuid NOT NULL REFERENCES idps_establishments(id) ON DELETE CASCADE,
    student_id uuid NOT NULL REFERENCES idps_students(id) ON DELETE CASCADE,
    level text NOT NULL,
    answers jsonb NOT NULL,
    scores jsonb NOT NULL,
    general numeric(6,2) NOT NULL,
    submitted_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idps_responses_est_idx ON idps_responses(establishment_id,submitted_at)`);
}

async function ensureApplications(estId) {
  await ensureTables();
  const students = (await pool.query(`SELECT id,school_year,grade_desc,course_letter FROM idps_students WHERE establishment_id=$1 AND active=true`,[estId])).rows;
  const eligible = students.map(s => ({...s, level:surveyLevel(s.grade_desc)})).filter(s => s.level);
  if (!eligible.length) return 0;
  await pool.query('BEGIN');
  try {
    for (const s of eligible) {
      await pool.query(`INSERT INTO idps_applications(id,token,establishment_id,student_id,school_year,level,grade_desc,course_letter,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending')
        ON CONFLICT(student_id) DO UPDATE SET
          school_year=EXCLUDED.school_year,
          level=CASE WHEN idps_applications.status='completed' THEN idps_applications.level ELSE EXCLUDED.level END,
          grade_desc=CASE WHEN idps_applications.status='completed' THEN idps_applications.grade_desc ELSE EXCLUDED.grade_desc END,
          course_letter=CASE WHEN idps_applications.status='completed' THEN idps_applications.course_letter ELSE EXCLUDED.course_letter END`,
        [crypto.randomUUID(),crypto.randomUUID(),estId,s.id,s.school_year,s.level,s.grade_desc,s.course_letter||'']);
    }
    await pool.query('COMMIT');
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
  return eligible.length;
}

async function getEst(estId) {
  return (await pool.query(`SELECT id,rbd,name,commune,status,expires_at FROM idps_establishments WHERE id=$1`,[estId])).rows[0];
}

async function getApplicationRows(estId) {
  await ensureApplications(estId);
  const rows = (await pool.query(`SELECT
      a.id,a.token,a.school_year,a.level,a.grade_desc,a.course_letter,a.status,a.opened_at,a.completed_at,
      s.first_names,s.last_name_paternal,s.last_name_maternal,s.run,s.dv,s.active
    FROM idps_applications a
    JOIN idps_students s ON s.id=a.student_id
    WHERE a.establishment_id=$1 AND s.active=true
    ORDER BY a.school_year DESC,a.grade_desc,a.course_letter,s.last_name_paternal,s.last_name_maternal,s.first_names`,[estId])).rows;
  return rows.filter(r => surveyLevel(r.grade_desc));
}

async function getProgress(estId) {
  const rows = await getApplicationRows(estId);
  const completed = rows.filter(r=>r.status==='completed').length;
  const opened = rows.filter(r=>r.status==='opened').length;
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.school_year}|${r.grade_desc}|${r.course_letter||''}`;
    if (!groups.has(key)) groups.set(key,{year:r.school_year,grade:r.grade_desc,letter:r.course_letter||'',level:r.level,total:0,opened:0,completed:0});
    const g=groups.get(key); g.total++; if(r.status==='opened') g.opened++; if(r.status==='completed') g.completed++;
  }
  return {rows,total:rows.length,opened,completed,percent:pct(completed,rows.length),groups:[...groups.values()]};
}

async function getResults(estId) {
  await ensureTables();
  const rows = (await pool.query(`SELECT r.scores,r.general,r.level,r.submitted_at,a.school_year,a.grade_desc,a.course_letter
    FROM idps_responses r JOIN idps_applications a ON a.id=r.application_id
    WHERE r.establishment_id=$1 ORDER BY r.submitted_at`,[estId])).rows;
  const aggregate = list => {
    if(!list.length) return {n:0,scores:[0,0,0,0],general:0};
    const sums=[0,0,0,0]; let general=0;
    for(const x of list){const s=Array.isArray(x.scores)?x.scores:JSON.parse(x.scores||'[]'); for(let i=0;i<4;i++) sums[i]+=Number(s[i]||0); general+=Number(x.general||0);}
    return {n:list.length,scores:sums.map(v=>round1(v/list.length)),general:round1(general/list.length)};
  };
  const institution=aggregate(rows);
  const groupsMap=new Map();
  for(const r of rows){const key=`${r.school_year}|${r.grade_desc}|${r.course_letter||''}`; if(!groupsMap.has(key))groupsMap.set(key,[]); groupsMap.get(key).push(r);}
  const groups=[...groupsMap.entries()].map(([key,list])=>{const [year,grade,letter]=key.split('|'); return {year:Number(year),grade,letter,level:list[0]?.level||'',...aggregate(list)};}).sort((a,b)=>b.year-a.year||a.grade.localeCompare(b.grade)||a.letter.localeCompare(b.letter));
  return {rows,institution,groups};
}

function baseCss(){return `
:root{--navy:#0F2D52;--blue:#1E7FBC;--turq:#19C2D1;--yellow:#FFD200;--bg:#F4F7FA;--line:#E6E8EB;--text:#17324d;--green:#198754;--red:#b42318}
*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;background:var(--bg);color:var(--text)}header{background:var(--navy);color:#fff;padding:18px 24px}.wrap{max-width:1180px;margin:auto}.brand{display:flex;align-items:center;justify-content:space-between;gap:16px}.brand small{opacity:.8}.topnav a{color:#fff;text-decoration:none;margin-left:14px;font-weight:700}main{padding:34px 18px}.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:20px}.col3{grid-column:span 3}.col4{grid-column:span 4}.col6{grid-column:span 6}.col12{grid-column:span 12}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:0 8px 28px rgba(15,45,82,.07)}h1,h2,h3{color:var(--navy);margin-top:0}.muted{color:#637083}.kpi{font-size:30px;font-weight:900;color:var(--navy)}.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:12px;padding:9px 14px;font-weight:800;text-decoration:none;cursor:pointer}.primary{background:var(--turq);color:var(--navy)}.secondary{background:#fff;color:var(--blue);border:1px solid var(--blue)}.print{background:var(--navy);color:#fff}.tag{display:inline-block;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;background:#f1f3f5;color:#65727f}.tag.ok{background:#e7f6ec;color:#166534}.tag.open{background:#fff7d1;color:#725c00}.notice{padding:12px 14px;border-radius:10px;background:#eef9f3;border:1px solid #bfe7cf;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;color:#637083}.bar{height:9px;background:#e5eaee;border-radius:99px;overflow:hidden}.bar i{display:block;height:100%;background:var(--turq)}.score{font-size:24px;font-weight:900;color:var(--navy)}.actions{display:flex;gap:8px;flex-wrap:wrap}.privacy{font-size:12px;line-height:1.5;padding:12px 14px;background:#fff9df;border:1px solid #eadb8d;border-radius:12px}.report h1{margin-bottom:4px}.report .meta{margin-bottom:24px}.avoid{break-inside:avoid}@media(max-width:800px){.col3,.col4,.col6{grid-column:span 12}.brand{flex-direction:column;align-items:flex-start}.topnav a{margin:0 12px 0 0}table{display:block;overflow:auto}.card{padding:18px}}@media print{header,.no-print{display:none!important}body{background:#fff}main{padding:0}.card{box-shadow:none;border-color:#ddd}.wrap{max-width:none}.report{font-size:11pt}}
`}
function page(title,body,extra=''){return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${baseCss()}</style></head><body><header><div class="wrap brand"><div><b>Material Educativo Chile</b><br><small>Diagnóstico IDPS · Gestión de establecimientos</small></div><div class="topnav"><a href="/panel">Panel</a><a href="/panel/estudiantes">Nómina</a><a href="/panel/aplicacion">Aplicación</a><a href="/panel/resultados">Resultados</a><a href="/logout">Cerrar sesión</a></div></div></header><main><div class="wrap">${body}</div></main>${extra}</body></html>`}
function courseName(r){return `${r.grade_desc||r.grade} ${r.course_letter||r.letter||''}`.trim();}

const originalGet=express.application.get;
express.application.get=function applicationPatchedGet(path,...handlers){
  if(path==='/panel' && handlers.length>=2){
    requireEst=handlers[0];
    const originalPanel=handlers[handlers.length-1];
    handlers[handlers.length-1]=async function applicationAwarePanel(req,res,next){
      let progress={total:0,completed:0,percent:0}; let results={institution:{n:0,general:0}};
      try{[progress,results]=await Promise.all([getProgress(req.auth.establishmentId),getResults(req.auth.establishmentId)]);}catch(e){console.error('[IDPS_APPLICATION_PANEL]',e.message);}
      const send=res.send.bind(res);
      res.send=function(body){
        if(typeof body==='string'){
          body=body.replace('<div class="kpi">0%</div><b>Aplicación</b><p class="muted">Seguimiento por curso y nivel.</p>',`<div class="kpi">${progress.percent}%</div><b>Aplicación</b><p class="muted">${progress.completed} de ${progress.total} respuestas completadas.</p>`);
          const diag=results.institution.n>=MIN_GROUP?`${Number(results.institution.general).toFixed(1)}%`:'—';
          body=body.replace('<div class="kpi">—</div><b>Diagnóstico</b><p class="muted">Se activará al recibir respuestas.</p>',`<div class="kpi">${diag}</div><b>Diagnóstico</b><p class="muted">${results.institution.n} respuesta(s) centralizadas.</p>`);
          body=body.replace(`<a class="btn primary" href="${SURVEY_URL}" target="_blank">Abrir encuesta publicada</a>`,`<a class="btn primary" href="/panel/aplicacion">Gestionar aplicación</a><a class="btn secondary" href="/panel/resultados">Ver resultados e informe</a>`);
        }
        return send(body);
      };
      return originalPanel(req,res,next);
    };
  }
  return originalGet.call(this,path,...handlers);
};

const originalListen=express.application.listen;
express.application.listen=function applicationPatchedListen(...args){
  this.set('trust proxy', 1);
  if(requireEst && !this.__applicationModuleRoutes){
    this.__applicationModuleRoutes=true;
    const publicLimiter=rateLimit({windowMs:15*60*1000,limit:180,standardHeaders:true,legacyHeaders:false});
    const surveyOrigin=(()=>{try{return new URL(SURVEY_URL).origin}catch{return ''}})();
    const cors=(req,res,next)=>{const origin=req.headers.origin||''; if(origin&&origin===surveyOrigin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');} res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');next();};

    this.options('/api/application/:token',cors,(req,res)=>res.sendStatus(204));
    this.options('/api/application/:token/submit',cors,(req,res)=>res.sendStatus(204));

    this.get('/api/application/:token',cors,publicLimiter,async(req,res)=>{
      try{
        if(!validUuid(req.params.token)) return res.status(404).json({ok:false,error:'Enlace no válido.'});
        await ensureTables();
        const q=await pool.query(`SELECT a.id,a.token,a.level,a.grade_desc,a.course_letter,a.school_year,a.status,a.opened_at,a.completed_at,
          e.name AS establishment_name,e.status AS establishment_status,e.expires_at,s.active
          FROM idps_applications a JOIN idps_establishments e ON e.id=a.establishment_id JOIN idps_students s ON s.id=a.student_id
          WHERE a.token=$1`,[req.params.token]);
        const a=q.rows[0];
        if(!a||!a.active||a.establishment_status!=='active'||(a.expires_at&&new Date(a.expires_at)<new Date())) return res.status(404).json({ok:false,error:'Este enlace no está disponible.'});
        if(!a.opened_at&&a.status==='pending') await pool.query(`UPDATE idps_applications SET opened_at=now(),status='opened' WHERE id=$1 AND status='pending'`,[a.id]);
        return res.json({ok:true,completed:a.status==='completed',context:{level:a.level,questionLevel:questionLevel(a.level),grade:a.grade_desc,courseLetter:a.course_letter||'',schoolYear:a.school_year,establishment:a.establishment_name}});
      }catch(e){console.error('[IDPS_APPLICATION_GET]',e);res.status(500).json({ok:false,error:'No fue posible abrir la aplicación.'});}
    });

    this.post('/api/application/:token/submit',cors,publicLimiter,async(req,res)=>{
      const client=pool?await pool.connect():null;
      try{
        if(!client) throw new Error('Base de datos no disponible');
        if(!validUuid(req.params.token)) return res.status(404).json({ok:false,error:'Enlace no válido.'});
        const answers=req.body?.answers;
        if(!Array.isArray(answers)||answers.length!==30||answers.some(v=>!Number.isInteger(v)||v<1||v>4)) return res.status(400).json({ok:false,error:'Las respuestas recibidas no son válidas.'});
        await client.query('BEGIN');
        const q=await client.query(`SELECT a.*,e.status AS establishment_status,e.expires_at,s.active FROM idps_applications a JOIN idps_establishments e ON e.id=a.establishment_id JOIN idps_students s ON s.id=a.student_id WHERE a.token=$1 FOR UPDATE`,[req.params.token]);
        const a=q.rows[0];
        if(!a||!a.active||a.establishment_status!=='active'||(a.expires_at&&new Date(a.expires_at)<new Date())) {await client.query('ROLLBACK');return res.status(404).json({ok:false,error:'Este enlace no está disponible.'});}
        if(a.status==='completed'){await client.query('ROLLBACK');return res.status(409).json({ok:false,error:'Esta aplicación ya fue respondida.'});}
        const calc=calcScores(answers);
        await client.query(`INSERT INTO idps_responses(id,application_id,establishment_id,student_id,level,answers,scores,general)
          VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,[crypto.randomUUID(),a.id,a.establishment_id,a.student_id,a.level,JSON.stringify(answers),JSON.stringify(calc.scores),calc.general]);
        await client.query(`UPDATE idps_applications SET status='completed',completed_at=now(),opened_at=COALESCE(opened_at,now()) WHERE id=$1`,[a.id]);
        await client.query('COMMIT');
        return res.json({ok:true,scores:calc.scores,general:calc.general});
      }catch(e){if(client){try{await client.query('ROLLBACK')}catch{}} console.error('[IDPS_APPLICATION_SUBMIT]',e);res.status(500).json({ok:false,error:'No fue posible registrar la respuesta. Intenta nuevamente.'});}
      finally{if(client)client.release();}
    });

    this.get('/panel/aplicacion',requireEst,async(req,res)=>{
      try{
        const [est,progress]=await Promise.all([getEst(req.auth.establishmentId),getProgress(req.auth.establishmentId)]);
        const groups=progress.groups.map(g=>`<tr><td>${g.year}</td><td>${esc(`${g.grade} ${g.letter}`.trim())}</td><td>${g.total}</td><td>${g.completed}</td><td>${pct(g.completed,g.total)}%</td></tr>`).join('');
        const students=progress.rows.map(r=>{const status=r.status==='completed'?'<span class="tag ok">Respondida</span>':r.status==='opened'?'<span class="tag open">Abierta</span>':'<span class="tag">Pendiente</span>';const link=surveyLink(r.token);return `<tr><td>${esc(`${r.last_name_paternal||''} ${r.last_name_maternal||''}, ${r.first_names||''}`)}</td><td>${esc(courseName(r))}</td><td>${status}</td><td><div class="actions"><a class="btn secondary" target="_blank" rel="noopener" href="${esc(link)}">Abrir</a><button type="button" class="btn primary" onclick="navigator.clipboard.writeText(${JSON.stringify(link)}).then(()=>this.textContent='Copiado')">Copiar enlace</button></div></td></tr>`}).join('');
        res.send(page('Aplicación IDPS',`<div class="grid"><div class="col12"><h1>Aplicación IDPS</h1><p class="muted"><b>${esc(est?.name||'Establecimiento')}</b> · Enlaces individuales vinculados a la nómina SIGE.</p></div><div class="col3 card"><div class="kpi">${progress.total}</div><b>Habilitados</b></div><div class="col3 card"><div class="kpi">${progress.completed}</div><b>Respondidos</b></div><div class="col3 card"><div class="kpi">${progress.total-progress.completed}</div><b>Pendientes</b></div><div class="col3 card"><div class="kpi">${progress.percent}%</div><b>Avance</b></div><div class="col12 privacy"><b>Privacidad:</b> el estudiante accede mediante un token aleatorio. La encuesta no muestra su nombre ni RUN. El panel utiliza la vinculación únicamente para controlar cobertura y evita mostrar respuestas individuales al establecimiento.</div><div class="col12 card"><h2>Avance por curso</h2><table><thead><tr><th>Año</th><th>Curso</th><th>Habilitados</th><th>Respondidos</th><th>Avance</th></tr></thead><tbody>${groups||'<tr><td colspan="5">Carga primero la nómina SIGE.</td></tr>'}</tbody></table></div><div class="col12 card"><h2>Enlaces individuales</h2><p class="muted">Comparte con cada estudiante únicamente su enlace. Una vez respondido, el vínculo queda cerrado.</p><table><thead><tr><th>Estudiante</th><th>Curso</th><th>Estado</th><th>Enlace</th></tr></thead><tbody>${students||'<tr><td colspan="4">No hay estudiantes habilitados en 4° básico, 6° básico o 2° medio.</td></tr>'}</tbody></table></div></div>`));
      }catch(e){res.status(500).send(page('Aplicación IDPS',`<div class="card"><h1>No fue posible cargar la aplicación</h1><p>${esc(e.message)}</p></div>`));}
    });

    this.get('/panel/resultados',requireEst,async(req,res)=>{
      try{
        const [est,progress,results]=await Promise.all([getEst(req.auth.establishmentId),getProgress(req.auth.establishmentId),getResults(req.auth.establishmentId)]);
        const inst=results.institution;
        const cards=INDICATORS.map((n,i)=>`<div class="col3 card"><span class="muted">${esc(n)}</span><div class="score">${inst.n>=MIN_GROUP?inst.scores[i].toFixed(1)+'%':'—'}</div><b>${inst.n>=MIN_GROUP?reading(inst.scores[i]):`Disponible con ${MIN_GROUP} respuestas`}</b></div>`).join('');
        const groups=results.groups.map(g=>`<tr><td>${g.year}</td><td>${esc(`${g.grade} ${g.letter}`.trim())}</td><td>${g.n}</td><td>${g.n>=MIN_GROUP?g.general.toFixed(1)+'%':'—'}</td><td>${g.n>=MIN_GROUP?g.scores.map(v=>v.toFixed(1)+'%').join(' · '):`Mínimo ${MIN_GROUP} respuestas`}</td></tr>`).join('');
        res.send(page('Resultados IDPS',`<div class="grid"><div class="col12"><h1>Resultados IDPS</h1><p class="muted"><b>${esc(est?.name||'Establecimiento')}</b> · ${progress.completed} respuestas de ${progress.total} estudiantes habilitados (${progress.percent}% de cobertura).</p><div class="actions no-print"><a class="btn primary" href="/panel/informe" target="_blank">Abrir informe imprimible</a><a class="btn secondary" href="/panel/aplicacion">Volver a aplicación</a></div></div>${cards}<div class="col12 card"><h2>Resultados por curso</h2><p class="muted">Por privacidad, se muestran indicadores agregados solo cuando existen al menos ${MIN_GROUP} respuestas en el grupo.</p><table><thead><tr><th>Año</th><th>Curso</th><th>N</th><th>Índice general</th><th>Indicadores A · C · P · H</th></tr></thead><tbody>${groups||'<tr><td colspan="5">Aún no hay respuestas registradas.</td></tr>'}</tbody></table></div><div class="col12 privacy"><b>Lectura técnica:</b> los porcentajes son índices descriptivos internos derivados de este instrumento. No corresponden a puntajes, categorías ni resultados oficiales SIMCE.</div></div>`));
      }catch(e){res.status(500).send(page('Resultados IDPS',`<div class="card"><h1>No fue posible cargar resultados</h1><p>${esc(e.message)}</p></div>`));}
    });

    this.get('/panel/informe',requireEst,async(req,res)=>{
      try{
        const [est,progress,results]=await Promise.all([getEst(req.auth.establishmentId),getProgress(req.auth.establishmentId),getResults(req.auth.establishmentId)]);
        const inst=results.institution; const today=new Intl.DateTimeFormat('es-CL',{dateStyle:'long'}).format(new Date());
        const indicatorRows=INDICATORS.map((n,i)=>`<tr><td>${esc(n)}</td><td>${inst.n>=MIN_GROUP?inst.scores[i].toFixed(1)+'%':'—'}</td><td>${inst.n>=MIN_GROUP?reading(inst.scores[i]):'Muestra insuficiente'}</td></tr>`).join('');
        const courseRows=results.groups.map(g=>`<tr><td>${g.year}</td><td>${esc(`${g.grade} ${g.letter}`.trim())}</td><td>${g.n}</td><td>${g.n>=MIN_GROUP?g.general.toFixed(1)+'%':'—'}</td><td>${g.n>=MIN_GROUP?reading(g.general):'Muestra insuficiente'}</td></tr>`).join('');
        let recs='<p>Aún no existe un número suficiente de respuestas para generar orientaciones agregadas.</p>';
        if(inst.n>=MIN_GROUP){const order=inst.scores.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v);recs=`<ol>${order.slice(0,2).map(x=>`<li><b>${esc(INDICATORS[x.i])}:</b> ${esc(RECOMMENDATIONS[x.i])}</li>`).join('')}</ol>`;}
        res.send(page('Informe institucional IDPS',`<article class="report"><div class="actions no-print" style="justify-content:flex-end"><button class="btn print" onclick="window.print()">Imprimir / Guardar PDF</button></div><div class="card avoid"><h1>Informe Institucional de Diagnóstico IDPS</h1><p class="meta"><b>${esc(est?.name||'Establecimiento')}</b><br>RBD ${esc(est?.rbd||'')} · ${esc(est?.commune||'')}<br>${esc(today)}</p><p>Este informe consolida los resultados del diagnóstico interno de Indicadores de Desarrollo Personal y Social aplicado mediante Material Educativo Chile. Su propósito es apoyar la planificación preventiva y formativa del establecimiento.</p></div><div class="grid" style="margin-top:20px"><div class="col4 card avoid"><div class="kpi">${progress.total}</div><b>Estudiantes habilitados</b></div><div class="col4 card avoid"><div class="kpi">${progress.completed}</div><b>Respuestas válidas</b></div><div class="col4 card avoid"><div class="kpi">${progress.percent}%</div><b>Cobertura</b></div><div class="col12 card avoid"><h2>Síntesis institucional</h2><table><thead><tr><th>Indicador</th><th>Índice</th><th>Lectura descriptiva</th></tr></thead><tbody>${indicatorRows}</tbody></table></div><div class="col12 card avoid"><h2>Resultados por curso</h2><table><thead><tr><th>Año</th><th>Curso</th><th>N</th><th>Índice general</th><th>Lectura</th></tr></thead><tbody>${courseRows||'<tr><td colspan="5">Sin respuestas registradas.</td></tr>'}</tbody></table></div><div class="col12 card avoid"><h2>Orientaciones para el plan de trabajo</h2>${recs}<p>Se recomienda contrastar estos resultados con asistencia, convivencia, observaciones docentes, participación estudiantil y otros antecedentes institucionales antes de adoptar decisiones.</p></div><div class="col12 privacy"><b>Nota metodológica:</b> instrumento diagnóstico interno. Los rangos de lectura utilizados en este informe son descriptivos y no equivalen a categorías oficiales de la Agencia de Calidad ni a resultados SIMCE. Los resultados por curso se ocultan cuando existen menos de ${MIN_GROUP} respuestas para reducir riesgos de identificación.</div></div></article>`));
      }catch(e){res.status(500).send(page('Informe institucional IDPS',`<div class="card"><h1>No fue posible generar el informe</h1><p>${esc(e.message)}</p></div>`));}
    });
  }
  return originalListen.apply(this,args);
};
