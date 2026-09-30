const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || '';
const JWT_SECRET = process.env.JWT_SECRET || '';
const SURVEY_URL = (process.env.SURVEY_URL || 'https://diagnostico-idps-material-educativo.onrender.com').replace(/\/$/, '');
const pool = DATABASE_URL ? new Pool({connectionString:DATABASE_URL, ssl:{rejectUnauthorized:false}}) : null;

function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function norm(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function standardLevel(grade=''){
  const g=norm(grade);
  const basic={
    '1basico':'1° básico','1basic':'1° básico','2basico':'2° básico','2basic':'2° básico',
    '3basico':'3° básico','3basic':'3° básico','4basico':'4° básico','4basic':'4° básico',
    '5basico':'5° básico','5basic':'5° básico','6basico':'6° básico','6basic':'6° básico',
    '7basico':'7° básico','7basic':'7° básico','8basico':'8° básico','8basic':'8° básico'
  };
  const media={'1medio':'1° medio','2medio':'2° medio','3medio':'3° medio','4medio':'4° medio'};
  return basic[g]||media[g]||'';
}
function getAuth(req){try{return JWT_SECRET?jwt.verify(req.cookies?.idps_session||'',JWT_SECRET):null;}catch{return null;}}
function requireEst(req,res,next){const a=getAuth(req);if(!a||a.role!=='establishment')return res.redirect('/');req.auth=a;next();}
function courseLabel(g,l){return `${g||''} ${l||''}`.trim();}
function pct(n,d){return d?Math.round((Number(n)/Number(d))*100):0;}
function formatRut(run,dv){let r=String(run||''),out='';while(r.length>3){out='.'+r.slice(-3)+out;r=r.slice(0,-3);}return r+out+'-'+String(dv||'').toUpperCase();}
function maskRun(run,dv){const r=String(run||'');return '••••'+r.slice(-4)+'-'+String(dv||'').toUpperCase();}

async function ensureTables(){
  if(!pool) throw new Error('Base de datos no disponible.');
  await pool.query(`CREATE TABLE IF NOT EXISTS idps_applications (id uuid PRIMARY KEY,token uuid NOT NULL UNIQUE,establishment_id uuid NOT NULL REFERENCES idps_establishments(id) ON DELETE CASCADE,student_id uuid NOT NULL UNIQUE REFERENCES idps_students(id) ON DELETE CASCADE,school_year integer NOT NULL,level text NOT NULL,grade_desc text NOT NULL,course_letter text,status text NOT NULL DEFAULT 'pending',created_at timestamptz NOT NULL DEFAULT now(),opened_at timestamptz,completed_at timestamptz)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS idps_student_access (student_id uuid PRIMARY KEY REFERENCES idps_students(id) ON DELETE CASCADE,pin_hash text NOT NULL,generated_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`);
}
async function ensureAllApplications(estId){
  await ensureTables();
  const students=(await pool.query(`SELECT id,school_year,grade_desc,course_letter FROM idps_students WHERE establishment_id=$1 AND active=true`,[estId])).rows;
  const eligible=students.map(s=>({...s,level:standardLevel(s.grade_desc)})).filter(s=>s.level);
  if(!eligible.length)return 0;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    for(const s of eligible){
      await client.query(`INSERT INTO idps_applications(id,token,establishment_id,student_id,school_year,level,grade_desc,course_letter,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending')
        ON CONFLICT(student_id) DO UPDATE SET
          school_year=EXCLUDED.school_year,
          level=CASE WHEN idps_applications.status='completed' THEN idps_applications.level ELSE EXCLUDED.level END,
          grade_desc=CASE WHEN idps_applications.status='completed' THEN idps_applications.grade_desc ELSE EXCLUDED.grade_desc END,
          course_letter=CASE WHEN idps_applications.status='completed' THEN idps_applications.course_letter ELSE EXCLUDED.course_letter END`,
        [crypto.randomUUID(),crypto.randomUUID(),estId,s.id,s.school_year,s.level,s.grade_desc,s.course_letter||'']);
    }
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  return eligible.length;
}
async function estInfo(estId){return(await pool.query(`SELECT id,rbd,name,commune FROM idps_establishments WHERE id=$1`,[estId])).rows[0];}
async function activeStudents(estId){return(await pool.query(`SELECT * FROM idps_students WHERE establishment_id=$1 AND active=true ORDER BY school_year DESC,grade_desc,course_letter,last_name_paternal,last_name_maternal,first_names`,[estId])).rows;}
async function appRows(estId){
  await ensureAllApplications(estId);
  return(await pool.query(`SELECT a.id,a.student_id,a.school_year,a.level,a.grade_desc,a.course_letter,a.status,a.opened_at,a.completed_at,s.first_names,s.last_name_paternal,s.last_name_maternal,s.run,s.dv,CASE WHEN ac.student_id IS NULL THEN false ELSE true END AS access_ready FROM idps_applications a JOIN idps_students s ON s.id=a.student_id LEFT JOIN idps_student_access ac ON ac.student_id=s.id WHERE a.establishment_id=$1 AND s.active=true ORDER BY a.school_year DESC,a.grade_desc,a.course_letter,s.last_name_paternal,s.last_name_maternal,s.first_names`,[estId])).rows.filter(r=>standardLevel(r.grade_desc));
}
function groupRows(rows){const m=new Map();for(const r of rows){const k=`${r.school_year}|${r.grade_desc}|${r.course_letter||''}`;if(!m.has(k))m.set(k,{key:k,year:r.school_year,grade:r.grade_desc,letter:r.course_letter||'',total:0,ready:0,completed:0});const g=m.get(k);g.total++;if(r.access_ready)g.ready++;if(r.status==='completed')g.completed++;}return[...m.values()];}
function css(){return `:root{--navy:#0F2D52;--blue:#1E7FBC;--turq:#19C2D1;--bg:#F4F7FA;--line:#E6E8EB;--text:#17324d;--muted:#637083}*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;background:var(--bg);color:var(--text)}header{background:var(--navy);color:#fff;padding:16px 20px}.wrap{max-width:1180px;margin:auto}.brand{display:flex;justify-content:space-between;gap:16px;align-items:center}.brand small{opacity:.82}.topnav{display:flex;gap:14px;flex-wrap:wrap}.topnav a{color:#fff;text-decoration:none;font-weight:750}main{padding:28px 16px 60px}.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:18px}.col3{grid-column:span 3}.col4{grid-column:span 4}.col6{grid-column:span 6}.col12{grid-column:span 12}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:22px;box-shadow:0 8px 28px rgba(15,45,82,.06)}h1,h2,h3{color:var(--navy);margin-top:0}.muted{color:var(--muted)}.kpi{font-size:30px;font-weight:900;color:var(--navy)}.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:11px;padding:11px 15px;font-weight:800;text-decoration:none;cursor:pointer}.primary{background:var(--turq);color:var(--navy)}.dark{background:var(--navy);color:#fff}.secondary{background:#fff;color:var(--blue);border:1px solid var(--blue)}.field{margin:12px 0}.field label{display:block;font-size:12px;font-weight:800;margin-bottom:6px}.field select,.field input{width:100%;padding:12px;border:1px solid #cfd8e3;border-radius:10px;background:#fff}.notice{padding:12px 14px;border-radius:10px;background:#eef9f3;border:1px solid #bfe7cf;margin-bottom:16px}.tag{display:inline-block;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;background:#f1f3f5;color:#65727f}.tag.ok{background:#e7f6ec;color:#166534}.tag.off{background:#f1f3f5;color:#65727f}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;color:var(--muted)}@media(max-width:800px){.col3,.col4,.col6{grid-column:span 12}.brand{align-items:flex-start;flex-direction:column}table{display:block;overflow:auto}.card{padding:18px}}`;}
function page(title,body){return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css()}</style></head><body><header><div class="wrap brand"><div><b>Material Educativo Chile</b><br><small>Diagnóstico IDPS · Gestión de establecimientos</small></div><div class="topnav"><a href="/panel">Panel</a><a href="/panel/estudiantes">Nómina</a><a href="/panel/aplicacion">Aplicación y claves</a><a href="/panel/resultados">Resultados</a><a href="/logout">Cerrar sesión</a></div></div></header><main><div class="wrap">${body}</div></main></body></html>`;}

const previousListen=express.application.listen;
express.application.listen=function allCoursesListen(...args){
  if(!this.__allCoursesRoutes){
    this.__allCoursesRoutes=true;
    const app=this;

    app.get('/panel/estudiantes',requireEst,async(req,res)=>{
      try{
        const est=await estInfo(req.auth.establishmentId),students=await activeStudents(est.id);
        await ensureAllApplications(est.id);
        const groups=new Map();
        for(const s of students){const k=`${s.school_year}|${s.grade_desc}|${s.course_letter||''}`;if(!groups.has(k))groups.set(k,{year:s.school_year,grade:s.grade_desc,letter:s.course_letter||'',count:0,level:standardLevel(s.grade_desc)});groups.get(k).count++;}
        const courses=[...groups.values()],eligible=students.filter(s=>standardLevel(s.grade_desc)).length;
        const msg=req.query.msg?`<div class="notice">${esc(req.query.msg)}</div>`:'';
        const courseHtml=courses.map(c=>`<tr><td>${c.year}</td><td>${esc(courseLabel(c.grade,c.letter))}</td><td>${c.count}</td><td>${c.level?'<span class="tag ok">Encuesta IDPS disponible</span>':'<span class="tag off">Nivel fuera de autoinforme escolar</span>'}</td></tr>`).join('');
        const studentHtml=students.slice(0,700).map(s=>`<tr><td>${esc([s.last_name_paternal,s.last_name_maternal].filter(Boolean).join(' '))}, ${esc(s.first_names||'')}</td><td>${esc(courseLabel(s.grade_desc,s.course_letter))}</td><td>${esc(maskRun(s.run,s.dv))}</td><td>${standardLevel(s.grade_desc)?'<span class="tag ok">IDPS</span>':'—'}</td></tr>`).join('');
        res.send(page('Nómina de estudiantes',`${msg}<div class="grid"><div class="col12"><h1>Nómina de estudiantes</h1><p class="muted"><b>${esc(est.name)}</b> · RBD ${esc(est.rbd)}</p></div><div class="col4 card"><div class="kpi">${students.length}</div><b>Estudiantes activos</b></div><div class="col4 card"><div class="kpi">${courses.length}</div><b>Cursos detectados</b></div><div class="col4 card"><div class="kpi">${eligible}</div><b>Con encuesta IDPS</b></div><div class="col12 card"><h2>Subir nómina SIGE</h2><p>Puede actualizar la nómina mediante el archivo <b>.xls exportado desde SIGE</b>.</p><form method="post" action="/panel/estudiantes/import" enctype="multipart/form-data"><input type="file" name="roster" accept=".xls,application/vnd.ms-excel" required><div style="margin-top:12px"><button class="btn primary">Importar nómina</button></div></form></div><div class="col12 card"><h2>Cursos</h2><p class="muted">Las encuestas están habilitadas desde 1° básico hasta 4° medio, rindan o no SIMCE.</p><table><thead><tr><th>Año</th><th>Curso</th><th>Estudiantes</th><th>Aplicación</th></tr></thead><tbody>${courseHtml}</tbody></table></div><div class="col12 card"><h2>Estudiantes</h2><table><thead><tr><th>Estudiante</th><th>Curso</th><th>RUT</th><th>Instrumento</th></tr></thead><tbody>${studentHtml}</tbody></table></div></div>`));
      }catch(e){res.status(500).send(page('Error',`<div class="card"><h1>No fue posible cargar la nómina</h1><p>${esc(e.message)}</p></div>`));}
    });

    app.get('/panel/aplicacion',requireEst,async(req,res)=>{
      try{
        const est=await estInfo(req.auth.establishmentId),rows=await appRows(est.id),groups=groupRows(rows),total=rows.length,completed=rows.filter(r=>r.status==='completed').length;
        const msg=req.query.msg?`<div class="notice">${esc(req.query.msg)}</div>`:'';
        const opts=groups.map(g=>`<option value="${esc(g.key)}">${g.year} · ${esc(courseLabel(g.grade,g.letter))}</option>`).join('');
        const courseHtml=groups.map(g=>`<tr><td>${g.year}</td><td>${esc(courseLabel(g.grade,g.letter))}</td><td>${g.total}</td><td>${g.ready===g.total&&g.total?'<span class="tag ok">Clave aplicada</span>':'<span class="tag">Sin clave común</span>'}</td><td>${g.completed}</td><td>${pct(g.completed,g.total)}%</td></tr>`).join('');
        const studentHtml=rows.map(r=>`<tr><td>${esc([r.first_names,r.last_name_paternal,r.last_name_maternal].filter(Boolean).join(' '))}</td><td>${esc(courseLabel(r.grade_desc,r.course_letter))}</td><td>${esc(formatRut(r.run,r.dv))}</td><td>${r.access_ready?'<span class="tag ok">Habilitado</span>':'<span class="tag">Pendiente</span>'}</td><td>${r.status==='completed'?'<span class="tag ok">Completada</span>':r.status==='opened'?'Iniciada':'Pendiente'}</td></tr>`).join('');
        res.send(page('Aplicación IDPS',`${msg}<div class="grid"><div class="col12"><h1>Aplicación IDPS</h1><p class="muted"><b>${esc(est.name)}</b> · Todos los cursos escolares cargados, desde 1° básico a 4° medio, pueden aplicar encuesta.</p></div><div class="col3 card"><div class="kpi">${total}</div><b>Habilitados</b></div><div class="col3 card"><div class="kpi">${groups.filter(g=>g.ready===g.total&&g.total).length}</div><b>Cursos con clave</b></div><div class="col3 card"><div class="kpi">${completed}</div><b>Respondidos</b></div><div class="col3 card"><div class="kpi">${pct(completed,total)}%</div><b>Avance</b></div><div class="col12 card"><h2>Asignar clave al curso</h2><p class="muted">El establecimiento define una clave única de 4 dígitos para cada curso. Ejemplo: <b>1° Medio A → 1111</b>.</p><form method="post" action="/panel/accesos/asignar-curso"><div class="grid"><div class="col6 field"><label>Curso</label><select name="course" required><option value="">Seleccionar curso</option>${opts}</select></div><div class="col6 field"><label>Clave de 4 dígitos</label><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" placeholder="Ej.: 1111" required></div></div><button class="btn primary">Aplicar clave al curso</button></form></div><div class="col12 card"><h2>Portal del estudiante</h2><p>El estudiante ingresa con su <b>RUT</b> y la <b>clave común de su curso</b>.</p><a class="btn dark" href="${SURVEY_URL}/encuesta-idps.html" target="_blank" rel="noopener">Abrir portal del estudiante</a></div><div class="col12 card"><h2>Avance por curso</h2><table><thead><tr><th>Año</th><th>Curso</th><th>Habilitados</th><th>Clave</th><th>Respondidos</th><th>Avance</th></tr></thead><tbody>${courseHtml}</tbody></table></div><div class="col12 card"><h2>Estudiantes</h2><table><thead><tr><th>Estudiante</th><th>Curso</th><th>RUT</th><th>Acceso</th><th>Aplicación</th></tr></thead><tbody>${studentHtml}</tbody></table></div></div>`));
      }catch(e){res.status(500).send(page('Error',`<div class="card"><h1>No fue posible cargar la aplicación</h1><p>${esc(e.message)}</p></div>`));}
    });

    app.post('/panel/accesos/asignar-curso',requireEst,express.urlencoded({extended:false}),async(req,res)=>{
      try{
        await ensureAllApplications(req.auth.establishmentId);
        const [year,grade,letter]=String(req.body.course||'').split('|'),pin=String(req.body.pin||'').replace(/\D/g,'');
        if(!year||!grade)throw new Error('Selecciona un curso válido.');
        if(!/^\d{4}$/.test(pin))throw new Error('La clave debe contener exactamente 4 dígitos.');
        const rows=(await appRows(req.auth.establishmentId)).filter(r=>String(r.school_year)===String(year)&&r.grade_desc===grade&&String(r.course_letter||'')===String(letter||''));
        if(!rows.length)throw new Error('No hay estudiantes habilitados en el curso seleccionado.');
        const hash=await bcrypt.hash(pin,10),client=await pool.connect();
        try{await client.query('BEGIN');for(const r of rows){await client.query(`INSERT INTO idps_student_access(student_id,pin_hash,generated_at,updated_at) VALUES($1,$2,now(),now()) ON CONFLICT(student_id) DO UPDATE SET pin_hash=EXCLUDED.pin_hash,generated_at=now(),updated_at=now()`,[r.student_id,hash]);await client.query(`DELETE FROM idps_student_sessions WHERE student_id=$1`,[r.student_id]);}await client.query('COMMIT');}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
        res.redirect('/panel/aplicacion?msg='+encodeURIComponent(`Clave aplicada correctamente a ${courseLabel(grade,letter)}. ${rows.length} estudiantes habilitados.`));
      }catch(e){res.redirect('/panel/aplicacion?msg='+encodeURIComponent(e.message));}
    });
  }
  return previousListen.apply(this,args);
};
