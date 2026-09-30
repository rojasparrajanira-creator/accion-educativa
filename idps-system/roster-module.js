const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');
const crypto = require('crypto');

const DATABASE_URL = process.env.DATABASE_URL || '';
const pool = DATABASE_URL ? new Pool({connectionString:DATABASE_URL, ssl:{rejectUnauthorized:false}}) : null;
const upload = multer({storage:multer.memoryStorage(), limits:{fileSize:8*1024*1024}});
let requireEst = null;

function esc(v=''){
  return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function stripAccents(v=''){
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function norm(v=''){
  return stripAccents(v).toLowerCase().replace(/[^a-z0-9]/g,'');
}
function decodeEntities(v=''){
  return String(v)
    .replace(/<br\s*\/?>/gi,' ')
    .replace(/<[^>]+>/g,'')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/\s+/g,' ')
    .trim();
}
function decodeBuffer(buf){
  const utf8=buf.toString('utf8');
  const bad=(utf8.match(/\uFFFD/g)||[]).length;
  return bad ? buf.toString('latin1') : utf8;
}
function parseSigeRoster(buf){
  const html=decodeBuffer(buf);
  if(!/<table\b/i.test(html) || !/<th\b/i.test(html)) throw new Error('El archivo no corresponde al formato de nómina SIGE .xls esperado.');
  const headers=[...html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(m=>decodeEntities(m[1]));
  const indexes={}; headers.forEach((h,i)=>indexes[norm(h)]=i);
  const required={
    year:'ano', rbd:'rbd', grade:'descgrado', letter:'letracurso', run:'run', dv:'digitover', gender:'genero',
    names:'nombres', paternal:'apellidopaterno', maternal:'apellidomaterno', birth:'fechanacimiento'
  };
  for(const [key,h] of Object.entries(required)) if(indexes[h]===undefined) throw new Error('Falta la columna requerida: '+h+'.');
  const rows=[];
  for(const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...tr[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>decodeEntities(m[1]));
    if(!cells.length) continue;
    const get=k=>cells[indexes[required[k]]]||'';
    const run=get('run').replace(/[^0-9]/g,'');
    if(!run) continue;
    const year=parseInt(get('year'),10);
    if(!Number.isFinite(year) || year<2000 || year>2100) continue;
    rows.push({
      school_year:year,
      source_rbd:get('rbd').replace(/[^0-9]/g,''),
      grade_desc:get('grade'),
      course_letter:get('letter').toUpperCase(),
      run,
      dv:get('dv').toUpperCase().replace(/[^0-9K]/g,''),
      gender:get('gender').toUpperCase(),
      first_names:get('names'),
      last_name_paternal:get('paternal'),
      last_name_maternal:get('maternal'),
      birth_date:/^\d{4}-\d{2}-\d{2}$/.test(get('birth'))?get('birth'):null
    });
  }
  if(!rows.length) throw new Error('No se encontraron estudiantes válidos en la nómina.');
  return rows;
}
function surveyLevel(grade=''){
  const g=norm(grade);
  if(g==='4basico'||g==='4basic') return '4° básico';
  if(g==='6basico'||g==='6basic') return '6° básico';
  if(g==='2medio') return '2° medio';
  return '';
}
function rbdBase(raw=''){
  const s=String(raw).trim();
  if(s.includes('-')) return s.split('-')[0].replace(/\D/g,'');
  return s.replace(/\D/g,'');
}
async function ensureTable(){
  if(!pool) throw new Error('La base de datos central no está disponible.');
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
  await pool.query(`CREATE INDEX IF NOT EXISTS idps_students_est_course_idx ON idps_students(establishment_id,school_year,grade_desc,course_letter) WHERE active=true`);
}
async function getEst(id){
  return (await pool.query('SELECT id,rbd,name,commune FROM idps_establishments WHERE id=$1',[id])).rows[0];
}
async function getStats(estId){
  await ensureTable();
  const students=(await pool.query('SELECT * FROM idps_students WHERE establishment_id=$1 AND active=true ORDER BY school_year DESC,grade_desc,course_letter,last_name_paternal,last_name_maternal,first_names',[estId])).rows;
  const courses=new Map();
  for(const s of students){
    const key=`${s.school_year}|${s.grade_desc}|${s.course_letter||''}`;
    if(!courses.has(key)) courses.set(key,{year:s.school_year,grade:s.grade_desc,letter:s.course_letter||'',count:0,eligible:surveyLevel(s.grade_desc)});
    courses.get(key).count++;
  }
  return {students,courses:[...courses.values()],eligible:students.filter(s=>surveyLevel(s.grade_desc)).length};
}
async function importRoster(est,rows){
  await ensureTable();
  const expected=rbdBase(est.rbd);
  const fileRbds=[...new Set(rows.map(r=>r.source_rbd).filter(Boolean))];
  if(expected && fileRbds.length && !fileRbds.includes(expected)) throw new Error(`El RBD de la nómina (${fileRbds.join(', ')}) no corresponde al establecimiento (${est.rbd}).`);
  const years=[...new Set(rows.map(r=>r.school_year))];
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    for(const y of years) await client.query('UPDATE idps_students SET active=false,updated_at=now() WHERE establishment_id=$1 AND school_year=$2',[est.id,y]);
    for(const s of rows){
      await client.query(`INSERT INTO idps_students(id,establishment_id,school_year,source_rbd,grade_desc,course_letter,run,dv,gender,first_names,last_name_paternal,last_name_maternal,birth_date,active)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true)
        ON CONFLICT(establishment_id,school_year,run,dv) DO UPDATE SET source_rbd=EXCLUDED.source_rbd,grade_desc=EXCLUDED.grade_desc,course_letter=EXCLUDED.course_letter,gender=EXCLUDED.gender,first_names=EXCLUDED.first_names,last_name_paternal=EXCLUDED.last_name_paternal,last_name_maternal=EXCLUDED.last_name_maternal,birth_date=EXCLUDED.birth_date,active=true,updated_at=now()`,
        [crypto.randomUUID(),est.id,s.school_year,s.source_rbd,s.grade_desc,s.course_letter,s.run,s.dv,s.gender,s.first_names,s.last_name_paternal,s.last_name_maternal,s.birth_date]);
    }
    await client.query('COMMIT');
  }catch(e){
    try{await client.query('ROLLBACK')}catch{}
    throw e;
  }finally{client.release();}
  return rows.length;
}
function baseCss(){return `
:root{--navy:#0F2D52;--blue:#1E7FBC;--turq:#19C2D1;--bg:#F4F7FA;--line:#E6E8EB;--text:#17324d;--green:#198754}
*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;background:var(--bg);color:var(--text)}header{background:var(--navy);color:#fff;padding:18px 24px}.wrap{max-width:1180px;margin:auto}.brand{display:flex;align-items:center;justify-content:space-between;gap:16px}.brand small{opacity:.8}.topnav a{color:#fff;text-decoration:none;margin-left:14px;font-weight:700}main{padding:34px 18px}.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:20px}.col4{grid-column:span 4}.col12{grid-column:span 12}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:0 8px 28px rgba(15,45,82,.07)}h1,h2{color:var(--navy);margin-top:0}.muted{color:#637083}.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:12px;padding:11px 18px;font-weight:800;text-decoration:none;cursor:pointer}.primary{background:var(--turq);color:var(--navy)}.secondary{background:#fff;color:var(--blue);border:1px solid var(--blue)}.notice{padding:12px 14px;border-radius:10px;margin:12px 0;background:#eef9f3;border:1px solid #bfe7cf}.error{background:#fff0ef;border-color:#f0b8b3}.kpi{font-size:30px;font-weight:900;color:var(--navy)}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--line)}th{font-size:12px;color:#637083}input[type=file]{width:100%;padding:14px;border:1px dashed #9fb2c4;border-radius:12px;background:#f9fbfd}.tag{display:inline-block;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;background:#e7f6ec;color:#166534}.tag.off{background:#f1f3f5;color:#65727f}@media(max-width:780px){.col4{grid-column:span 12}.brand{flex-direction:column;align-items:flex-start}table{display:block;overflow:auto}.card{padding:18px}}`}
function page(title,body){return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${baseCss()}</style></head><body><header><div class="wrap brand"><div><b>Material Educativo Chile</b><br><small>Diagnóstico IDPS · Gestión de establecimientos</small></div><div class="topnav"><a href="/panel">Panel</a><a href="/logout">Cerrar sesión</a></div></div></header><main><div class="wrap">${body}</div></main></body></html>`}
function maskRun(run,dv){const r=String(run||'');return '••••'+r.slice(-4)+'-'+esc(dv||'');}

const originalGet=express.application.get;
express.application.get=function patchedGet(path,...handlers){
  if(path==='/panel' && handlers.length>=2){
    requireEst=handlers[0];
    const originalPanel=handlers[handlers.length-1];
    handlers[handlers.length-1]=async function rosterAwarePanel(req,res,next){
      let stats={students:[],courses:[],eligible:0};
      try{stats=await getStats(req.auth.establishmentId);}catch(e){console.error('[ROSTER_STATS]',e.message);}
      const send=res.send.bind(res);
      res.send=function(body){
        if(typeof body==='string'){
          body=body.replace('<div class="kpi">0</div><b>Estudiantes cargados</b><p class="muted">La carga de nómina se habilitará en el siguiente módulo.</p>',`<div class="kpi">${stats.students.length}</div><b>Estudiantes cargados</b><p class="muted">${stats.courses.length} curso(s) detectado(s) en la nómina.</p>`);
          body=body.replace('<button class="btn secondary" disabled>Cargar nómina Excel · próximo módulo</button>','<a class="btn secondary" href="/panel/estudiantes">Cargar / revisar nómina SIGE</a>');
          body=body.replace('<div class="kpi">0%</div><b>Aplicación</b><p class="muted">Seguimiento por curso y nivel.</p>',`<div class="kpi">${stats.eligible}</div><b>Estudiantes en niveles IDPS</b><p class="muted">4° básico, 6° básico y 2° medio.</p>`);
        }
        return send(body);
      };
      return originalPanel(req,res,next);
    };
  }
  return originalGet.call(this,path,...handlers);
};

const originalListen=express.application.listen;
express.application.listen=function patchedListen(...args){
  if(requireEst && !this.__rosterModuleRoutes){
    this.__rosterModuleRoutes=true;
    this.get('/panel/estudiantes',requireEst,async(req,res)=>{
      try{
        const est=await getEst(req.auth.establishmentId); if(!est) return res.redirect('/logout');
        const stats=await getStats(est.id);
        const msg=req.query.msg?`<div class="notice ${req.query.err?'error':''}">${esc(req.query.msg)}</div>`:'';
        const courseRows=stats.courses.map(c=>`<tr><td>${c.year}</td><td>${esc(c.grade)} ${esc(c.letter)}</td><td>${c.count}</td><td>${c.eligible?'<span class="tag">Encuesta IDPS disponible</span>':'<span class="tag off">Sin instrumento IDPS en esta versión</span>'}</td></tr>`).join('');
        const studentRows=stats.students.slice(0,500).map(s=>`<tr><td>${esc(s.last_name_paternal)} ${esc(s.last_name_maternal)}, ${esc(s.first_names)}</td><td>${esc(s.grade_desc)} ${esc(s.course_letter||'')}</td><td>${maskRun(s.run,s.dv)}</td><td>${surveyLevel(s.grade_desc)?'<span class="tag">IDPS</span>':'<span class="tag off">—</span>'}</td></tr>`).join('');
        res.send(page('Nómina de estudiantes',`${msg}<div class="grid"><div class="col12"><h1>Nómina de estudiantes</h1><p class="muted"><b>${esc(est.name)}</b> · RBD ${esc(est.rbd)}</p></div><div class="col4 card"><div class="kpi">${stats.students.length}</div><b>Estudiantes activos</b></div><div class="col4 card"><div class="kpi">${stats.courses.length}</div><b>Cursos detectados</b></div><div class="col4 card"><div class="kpi">${stats.eligible}</div><b>En niveles IDPS</b></div><div class="col12 card"><h2>Subir nómina SIGE</h2><p>La plataforma acepta directamente el archivo <b>.xls exportado desde SIGE</b>, como el formato que utiliza el establecimiento.</p><form method="post" action="/panel/estudiantes/import" enctype="multipart/form-data"><input type="file" name="roster" accept=".xls,.html" required><p class="muted">Se importan únicamente datos necesarios para identificar estudiante, curso y nivel. No se almacenan dirección, teléfonos, correo, etnia, asistencia ni calificaciones.</p><button class="btn primary">Importar nómina</button></form></div><div class="col12 card"><h2>Cursos</h2><table><thead><tr><th>Año</th><th>Curso</th><th>Estudiantes</th><th>Aplicación</th></tr></thead><tbody>${courseRows||'<tr><td colspan="4">Aún no hay estudiantes cargados.</td></tr>'}</tbody></table></div><div class="col12 card"><h2>Estudiantes</h2><table><thead><tr><th>Estudiante</th><th>Curso</th><th>RUN</th><th>Instrumento</th></tr></thead><tbody>${studentRows||'<tr><td colspan="4">Aún no hay estudiantes cargados.</td></tr>'}</tbody></table></div></div>`));
      }catch(e){res.redirect('/panel?err=1&msg='+encodeURIComponent(e.message));}
    });
    this.post('/panel/estudiantes/import',requireEst,upload.single('roster'),async(req,res)=>{
      try{
        if(!req.file) throw new Error('Seleccione una nómina SIGE .xls.');
        const est=await getEst(req.auth.establishmentId); if(!est) throw new Error('Establecimiento no encontrado.');
        const rows=parseSigeRoster(req.file.buffer);
        const total=await importRoster(est,rows);
        const courses=new Set(rows.map(r=>`${r.school_year}|${r.grade_desc}|${r.course_letter}`)).size;
        res.redirect('/panel/estudiantes?msg='+encodeURIComponent(`Nómina importada correctamente: ${total} estudiantes en ${courses} curso(s).`));
      }catch(e){res.redirect('/panel/estudiantes?err=1&msg='+encodeURIComponent(e.message));}
    });
  }
  return originalListen.apply(this,args);
};
