const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || '';
const JWT_SECRET = process.env.JWT_SECRET || '';
const SURVEY_URL = (process.env.SURVEY_URL || 'https://diagnostico-idps-material-educativo.onrender.com').replace(/\/$/, '');
const pool = DATABASE_URL ? new Pool({connectionString:DATABASE_URL, ssl:{rejectUnauthorized:false}}) : null;

function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function getAuth(req){try{return JWT_SECRET ? jwt.verify(req.cookies?.idps_session || '', JWT_SECRET) : null;}catch{return null;}}
function requireEst(req,res,next){const a=getAuth(req);if(!a||a.role!=='establishment')return res.redirect('/');req.auth=a;next();}
function courseLabel(g,l){return `${g||''} ${l||''}`.trim();}
function pct(n,d){return d?Math.round((Number(n)/Number(d))*100):0;}
function norm(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function surveyLevel(grade=''){const g=norm(grade);if(g==='4basico'||g==='4basic')return '4° básico';if(g==='6basico'||g==='6basic')return '6° básico';if(g==='2medio')return '2° medio';return '';}
function formatRut(run,dv){let r=String(run||''),out='';while(r.length>3){out='.'+r.slice(-3)+out;r=r.slice(0,-3);}return r+out+'-'+String(dv||'').toUpperCase();}

async function rowsForEst(estId){
  if(!pool) throw new Error('Base de datos no disponible.');
  const rows=(await pool.query(`
    SELECT a.id,a.student_id,a.school_year,a.level,a.grade_desc,a.course_letter,a.status,
           s.first_names,s.last_name_paternal,s.last_name_maternal,s.run,s.dv,
           CASE WHEN ac.student_id IS NULL THEN false ELSE true END AS access_ready
    FROM idps_applications a
    JOIN idps_students s ON s.id=a.student_id
    LEFT JOIN idps_student_access ac ON ac.student_id=s.id
    WHERE a.establishment_id=$1 AND s.active=true
    ORDER BY a.school_year DESC,a.grade_desc,a.course_letter,s.last_name_paternal,s.last_name_maternal,s.first_names
  `,[estId])).rows;
  return rows.filter(r=>surveyLevel(r.grade_desc));
}
async function estInfo(estId){
  return (await pool.query(`SELECT id,rbd,name,commune FROM idps_establishments WHERE id=$1`,[estId])).rows[0];
}
function groupsFrom(rows){
  const m=new Map();
  for(const r of rows){
    const key=`${r.school_year}|${r.grade_desc}|${r.course_letter||''}`;
    if(!m.has(key))m.set(key,{key,year:r.school_year,grade:r.grade_desc,letter:r.course_letter||'',total:0,ready:0,completed:0});
    const g=m.get(key);g.total++;if(r.access_ready)g.ready++;if(r.status==='completed')g.completed++;
  }
  return [...m.values()];
}
function css(){return `
:root{--navy:#0F2D52;--blue:#1E7FBC;--turq:#19C2D1;--bg:#F4F7FA;--line:#E6E8EB;--text:#17324d;--green:#198754;--muted:#637083}
*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;background:var(--bg);color:var(--text)}
header{background:var(--navy);color:#fff;padding:16px 20px}.wrap{max-width:1180px;margin:auto}.brand{display:flex;justify-content:space-between;gap:16px;align-items:center}.brand small{opacity:.82}
.topnav{display:flex;gap:14px;flex-wrap:wrap}.topnav a{color:#fff;text-decoration:none;font-weight:750}main{padding:28px 16px 60px}
.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:18px}.col3{grid-column:span 3}.col6{grid-column:span 6}.col12{grid-column:span 12}
.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:22px;box-shadow:0 8px 28px rgba(15,45,82,.06)}
h1,h2,h3{color:var(--navy);margin-top:0}.muted{color:var(--muted)}.kpi{font-size:30px;font-weight:900;color:var(--navy)}
.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:11px;padding:11px 15px;font-weight:800;text-decoration:none;cursor:pointer}
.primary{background:var(--turq);color:var(--navy)}.dark{background:var(--navy);color:#fff}.secondary{background:#fff;color:var(--blue);border:1px solid var(--blue)}
.field{margin:12px 0}.field label{display:block;font-size:12px;font-weight:800;margin-bottom:6px}.field select,.field input{width:100%;padding:12px;border:1px solid #cfd8e3;border-radius:10px;background:#fff}
.notice{padding:12px 14px;border-radius:10px;background:#eef9f3;border:1px solid #bfe7cf;margin-bottom:16px}.tag{display:inline-block;padding:4px 8px;border-radius:999px;font-size:12px;font-weight:800;background:#f1f3f5}.tag.ok{background:#e7f6ec;color:#166534}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;padding:10px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;color:var(--muted)}
.actions{display:flex;gap:8px;flex-wrap:wrap}@media(max-width:800px){.col3,.col6{grid-column:span 12}.brand{align-items:flex-start;flex-direction:column}table{display:block;overflow:auto}.card{padding:18px}}
`;}
function page(title,body){return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css()}</style></head><body><header><div class="wrap brand"><div><b>Material Educativo Chile</b><br><small>Diagnóstico IDPS · Gestión de establecimientos</small></div><div class="topnav"><a href="/panel">Panel</a><a href="/panel/estudiantes">Nómina</a><a href="/panel/aplicacion">Aplicación y claves</a><a href="/panel/resultados">Resultados</a><a href="/logout">Cerrar sesión</a></div></div></header><main><div class="wrap">${body}</div></main></body></html>`;}

const previousListen = express.application.listen;
express.application.listen = function courseAccessListen(...args){
  if(!this.__courseAccessRoutes){
    this.__courseAccessRoutes = true;
    const app=this;

    app.get('/panel/aplicacion',requireEst,async(req,res)=>{
      try{
        const est=await estInfo(req.auth.establishmentId);
        const rows=await rowsForEst(est.id);
        const groups=groupsFrom(rows);
        const total=rows.length, completed=rows.filter(r=>r.status==='completed').length;
        const msg=req.query.msg?`<div class="notice">${esc(req.query.msg)}</div>`:'';
        const opts=groups.map(g=>`<option value="${esc(g.key)}">${g.year} · ${esc(courseLabel(g.grade,g.letter))}</option>`).join('');
        const courseRows=groups.map(g=>`<tr><td>${g.year}</td><td>${esc(courseLabel(g.grade,g.letter))}</td><td>${g.total}</td><td>${g.ready===g.total&&g.total?'<span class="tag ok">Clave aplicada</span>':'<span class="tag">Sin clave común</span>'}</td><td>${g.completed}</td><td>${pct(g.completed,g.total)}%</td></tr>`).join('');
        const studentRows=rows.map(r=>`<tr><td>${esc([r.first_names,r.last_name_paternal,r.last_name_maternal].filter(Boolean).join(' '))}</td><td>${esc(courseLabel(r.grade_desc,r.course_letter))}</td><td>${esc(formatRut(r.run,r.dv))}</td><td>${r.access_ready?'<span class="tag ok">Habilitado</span>':'<span class="tag">Pendiente</span>'}</td><td>${r.status==='completed'?'<span class="tag ok">Completada</span>':'Pendiente'}</td></tr>`).join('');
        res.send(page('Aplicación IDPS',`${msg}<div class="grid">
          <div class="col12"><h1>Aplicación IDPS</h1><p class="muted"><b>${esc(est.name)}</b> · El establecimiento define una clave única de 4 dígitos para cada curso.</p></div>
          <div class="col3 card"><div class="kpi">${total}</div><b>Habilitados</b></div>
          <div class="col3 card"><div class="kpi">${groups.filter(g=>g.ready===g.total&&g.total).length}</div><b>Cursos con clave</b></div>
          <div class="col3 card"><div class="kpi">${completed}</div><b>Respondidos</b></div>
          <div class="col3 card"><div class="kpi">${pct(completed,total)}%</div><b>Avance</b></div>

          <div class="col12 card">
            <h2>Asignar clave al curso</h2>
            <p class="muted">Seleccione el curso y escriba la clave que utilizarán todos sus estudiantes. Ejemplo: <b>2° Medio A → 1111</b>. El establecimiento puede cambiarla cuando lo necesite.</p>
            <form method="post" action="/panel/accesos/asignar-curso">
              <div class="grid">
                <div class="col6 field"><label>Curso</label><select name="course" required><option value="">Seleccionar curso</option>${opts}</select></div>
                <div class="col6 field"><label>Clave de 4 dígitos definida por el establecimiento</label><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" placeholder="Ej.: 1111" required></div>
              </div>
              <button class="btn primary">Aplicar clave al curso</button>
            </form>
          </div>

          <div class="col12 card"><h2>Portal del estudiante</h2><p>El estudiante entra con su <b>RUT</b> y la <b>clave común de su curso</b>.</p><a class="btn dark" href="${SURVEY_URL}/encuesta-idps.html" target="_blank" rel="noopener">Abrir portal del estudiante</a></div>

          <div class="col12 card"><h2>Avance por curso</h2><table><thead><tr><th>Año</th><th>Curso</th><th>Habilitados</th><th>Clave</th><th>Respondidos</th><th>Avance</th></tr></thead><tbody>${courseRows||'<tr><td colspan="6">Sin cursos IDPS habilitados.</td></tr>'}</tbody></table></div>
          <div class="col12 card"><h2>Estudiantes</h2><table><thead><tr><th>Estudiante</th><th>Curso</th><th>RUT</th><th>Acceso</th><th>Aplicación</th></tr></thead><tbody>${studentRows||'<tr><td colspan="5">Sin estudiantes.</td></tr>'}</tbody></table></div>
        </div>`));
      }catch(e){res.status(500).send(page('Error',`<div class="card"><h1>No fue posible cargar la aplicación</h1><p>${esc(e.message)}</p></div>`));}
    });

    app.post('/panel/accesos/asignar-curso',requireEst,async(req,res)=>{
      try{
        const [year,grade,letter]=String(req.body.course||'').split('|');
        const pin=String(req.body.pin||'').replace(/\D/g,'');
        if(!year||!grade)throw new Error('Selecciona un curso válido.');
        if(!/^\d{4}$/.test(pin))throw new Error('La clave debe contener exactamente 4 dígitos.');
        const rows=(await rowsForEst(req.auth.establishmentId)).filter(r=>String(r.school_year)===String(year)&&r.grade_desc===grade&&String(r.course_letter||'')===String(letter||''));
        if(!rows.length)throw new Error('No hay estudiantes habilitados en el curso seleccionado.');
        const hash=await bcrypt.hash(pin,10);
        const client=await pool.connect();
        try{
          await client.query('BEGIN');
          for(const r of rows){
            await client.query(`INSERT INTO idps_student_access(student_id,pin_hash,generated_at,updated_at) VALUES($1,$2,now(),now()) ON CONFLICT(student_id) DO UPDATE SET pin_hash=EXCLUDED.pin_hash,generated_at=now(),updated_at=now()`,[r.student_id,hash]);
            await client.query(`DELETE FROM idps_student_sessions WHERE student_id=$1`,[r.student_id]);
          }
          await client.query('COMMIT');
        }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
        res.redirect('/panel/aplicacion?msg='+encodeURIComponent(`Clave aplicada correctamente a ${courseLabel(grade,letter)}. Los ${rows.length} estudiantes del curso ingresarán con su RUT y la misma clave.`));
      }catch(e){res.redirect('/panel/aplicacion?msg='+encodeURIComponent(e.message));}
    });

    app.post('/panel/accesos/generar',requireEst,(req,res)=>{
      res.redirect('/panel/aplicacion?msg='+encodeURIComponent('La plataforma ya no genera claves aleatorias. El establecimiento debe definir una clave única de 4 dígitos para el curso.'));
    });
  }
  return previousListen.apply(this,args);
};
