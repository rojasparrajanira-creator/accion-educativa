const express = require('express');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || '';
const JWT_SECRET = process.env.JWT_SECRET || '';
const pool = DATABASE_URL ? new Pool({connectionString:DATABASE_URL, ssl:{rejectUnauthorized:false}}) : null;

const INDICATORS = [
  'Autoestima académica y motivación escolar',
  'Clima de convivencia escolar',
  'Participación y formación ciudadana',
  'Hábitos de vida saludable'
];

function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function parseScores(v){if(Array.isArray(v))return v;try{return JSON.parse(v||'[]')}catch{return[]}}
function reading(v){v=Number(v||0);if(v>=75)return 'Fortaleza observada';if(v>=55)return 'Desarrollo en proceso';return 'Oportunidad de fortalecimiento';}
function dateCL(v){if(!v)return '—';return new Date(v).toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric'});}
function courseLabel(g,l){return `${g||''} ${l||''}`.trim();}
function formatRut(run,dv){let r=String(run||''),out='';while(r.length>3){out='.'+r.slice(-3)+out;r=r.slice(0,-3);}return r+out+'-'+String(dv||'').toUpperCase();}
function auth(req){try{return JWT_SECRET?jwt.verify(req.cookies?.idps_session||'',JWT_SECRET):null}catch{return null}}
function requireEst(req,res,next){const a=auth(req);if(!a||a.role!=='establishment')return res.redirect('/');req.auth=a;next();}

async function studentResult(estId,studentId){
  const q=await pool.query(`SELECT r.student_id,r.scores,r.general,r.submitted_at,a.id application_id,a.grade_desc,a.course_letter,a.school_year,s.first_names,s.last_name_paternal,s.last_name_maternal,s.run,s.dv,e.name establishment_name,e.rbd,e.commune FROM idps_responses r JOIN idps_applications a ON a.id=r.application_id JOIN idps_students s ON s.id=r.student_id JOIN idps_establishments e ON e.id=r.establishment_id WHERE r.establishment_id=$1 AND r.student_id=$2 LIMIT 1`,[estId,studentId]);
  return q.rows[0]||null;
}
function fullName(r){return [r.first_names,r.last_name_paternal,r.last_name_maternal].filter(Boolean).join(' ');}
function summary(scores){
  const rows=INDICATORS.map((name,i)=>({name,value:Number(scores[i]||0)})).sort((a,b)=>b.value-a.value);
  return `El perfil muestra mayor desarrollo relativo en ${rows[0].name.toLowerCase()}. El ámbito que requiere mayor acompañamiento corresponde a ${rows[rows.length-1].name.toLowerCase()}. Estos antecedentes pueden orientar acciones de apoyo, seguimiento y planificación educativa.`;
}
function css(){return `:root{--navy:#173b67;--blue:#3E83C8;--turq:#28c1cc;--bg:#f5f7fa;--line:#dfe5eb;--text:#20364b;--muted:#667789}*{box-sizing:border-box}body{margin:0;background:var(--bg);font-family:Inter,Arial,sans-serif;color:var(--text)}header{background:var(--navy);color:#fff;padding:16px 20px}.wrap{max-width:980px;margin:auto}main{padding:28px 14px 60px}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:0 8px 28px #173b6710}h1,h2{color:var(--navy);margin-top:0}.muted{color:var(--muted)}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.meta div{border:1px solid var(--line);border-radius:12px;padding:12px}.meta small{display:block;color:var(--muted);margin-bottom:4px}.score{display:grid;grid-template-columns:1.5fr .4fr .7fr;gap:10px;padding:12px 0;border-bottom:1px solid var(--line)}.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:10px;padding:11px 15px;font-weight:800;text-decoration:none;cursor:pointer}.dark{background:var(--navy);color:#fff}.secondary{background:#fff;color:var(--blue);border:1px solid var(--blue)}.danger{background:#fff;color:#a33;border:1px solid #c88}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}.summary{background:#f4f8fb;border-left:4px solid var(--blue);padding:15px;border-radius:10px;line-height:1.55}@media(max-width:700px){.meta{grid-template-columns:1fr}.score{grid-template-columns:1fr}.card{padding:18px}}@media print{header,.no-print{display:none}body{background:#fff}.card{box-shadow:none;border:0;padding:0}main{padding:0}}`;}
function page(title,body){return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css()}</style></head><body><header><div class="wrap"><b>Material Educativo Chile</b><br><small>Plataforma de diagnóstico y seguimiento IDPS</small></div></header><main><div class="wrap">${body}</div></main></body></html>`;}

const previousListen = express.application.listen;
express.application.listen = function reportResetListen(...args){
  if(!this.__reportResetRoutes){
    this.__reportResetRoutes=true;
    const app=this;

    app.use((req,res,next)=>{
      const send=res.send.bind(res);
      res.send=function(body){
        if(typeof body==='string'){
          body=body.replace(/<div class="warning"><b>Alcance del informe\.<\/b>[\s\S]*?<\/div>/g,'');
          body=body.replace(/<div class="notice"><b>Importante:<\/b>[\s\S]*?<\/div>/g,'');
          if((req.path==='/panel/resultados'||req.path==='/panel/aplicacion')&&body.includes('</main>')&&!body.includes('Reiniciar todas las aplicaciones')){
            const reset=`<div class="wrap no-print" style="margin:0 auto 28px;max-width:1180px"><div class="card" style="border:1px solid #e2b6b6"><h2>Reiniciar aplicaciones</h2><p class="muted">Utiliza esta opción cuando el establecimiento necesite aplicar una nueva versión del instrumento. Se eliminan las respuestas registradas y los estudiantes quedan nuevamente en estado pendiente. Las claves de acceso del curso se mantienen.</p><form method="post" action="/panel/aplicaciones/reiniciar-todas" onsubmit="return confirm('¿Confirma que desea reiniciar todas las encuestas respondidas de este establecimiento? Esta acción eliminará las respuestas actuales.')"><button class="btn" style="background:#fff;color:#a33;border:1px solid #c88">Reiniciar todas las aplicaciones</button></form></div></div>`;
            body=body.replace('</main>',reset+'</main>');
          }
        }
        return send(body);
      };
      next();
    });

    app.get('/panel/resultados/estudiante/:studentId',requireEst,async(req,res)=>{
      try{
        const r=await studentResult(req.auth.establishmentId,req.params.studentId);
        if(!r)return res.status(404).send(page('Resultado no disponible','<div class="card"><h1>Resultado no disponible</h1><p>El estudiante no registra una aplicación vigente.</p></div>'));
        const scores=parseScores(r.scores);
        const detail=INDICATORS.map((n,i)=>`<div class="score"><div><b>${esc(n)}</b></div><div>${Number(scores[i]||0).toFixed(1)}%</div><div>${esc(reading(scores[i]))}</div></div>`).join('');
        res.send(page('Informe individual IDPS',`<div class="card"><h1>Informe individual de resultados</h1><p class="muted">Indicadores de Desarrollo Personal y Social · Resultado descriptivo y orientativo para el acompañamiento educativo.</p><div class="meta"><div><small>Estudiante</small><b>${esc(fullName(r))}</b></div><div><small>RUT</small><b>${esc(formatRut(r.run,r.dv))}</b></div><div><small>Curso</small><b>${esc(courseLabel(r.grade_desc,r.course_letter))}</b></div><div><small>Establecimiento</small><b>${esc(r.establishment_name)}</b></div><div><small>RBD</small><b>${esc(r.rbd)}</b></div><div><small>Fecha de aplicación</small><b>${dateCL(r.submitted_at)}</b></div></div><h2>Resultados por indicador</h2>${detail}<h2 style="margin-top:24px">Síntesis orientativa</h2><div class="summary">${esc(summary(scores))}</div><div class="no-print actions"><a class="btn dark" href="/panel/resultados/estudiante/${encodeURIComponent(r.student_id)}/pdf">Descargar informe PDF</a><button class="btn secondary" onclick="window.print()">Imprimir</button><a class="btn secondary" href="/panel/resultados">Volver a resultados</a><form method="post" action="/panel/resultados/estudiante/${encodeURIComponent(r.student_id)}/reiniciar" onsubmit="return confirm('¿Reiniciar la encuesta de este estudiante? Se eliminará su respuesta actual y podrá responder nuevamente con la misma clave del curso.')"><button class="btn danger">Reiniciar encuesta</button></form></div></div>`));
      }catch(e){console.error('[INDIVIDUAL_REPORT]',e);res.status(500).send(page('Error','<div class="card"><h1>No fue posible cargar el informe.</h1></div>'));}
    });

    app.get('/panel/resultados/estudiante/:studentId/pdf',requireEst,async(req,res)=>{
      try{
        const r=await studentResult(req.auth.establishmentId,req.params.studentId);
        if(!r)return res.status(404).send('Resultado no disponible');
        const scores=parseScores(r.scores);
        const doc=new PDFDocument({size:'A4',margin:48,info:{Title:'Informe individual IDPS',Author:'Material Educativo Chile'}});
        const safe=(fullName(r)||'estudiante').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').replace(/^_|_$/g,'');
        res.setHeader('Content-Type','application/pdf');
        res.setHeader('Content-Disposition',`attachment; filename="Informe_IDPS_${safe}.pdf"`);
        doc.pipe(res);
        doc.fillColor('#173b67').fontSize(19).font('Helvetica-Bold').text('Informe individual de resultados');
        doc.fontSize(10).font('Helvetica').fillColor('#5b6d7e').text('Indicadores de Desarrollo Personal y Social · Material Educativo Chile');
        doc.moveDown(1);
        const meta=[['Estudiante',fullName(r)],['RUT',formatRut(r.run,r.dv)],['Curso',courseLabel(r.grade_desc,r.course_letter)],['Establecimiento',r.establishment_name],['RBD',r.rbd],['Fecha de aplicación',dateCL(r.submitted_at)]];
        for(const [k,v] of meta){doc.fillColor('#657789').fontSize(9).font('Helvetica-Bold').text(k+':',{continued:true});doc.fillColor('#20364b').font('Helvetica').text(' '+String(v||'—'));}
        doc.moveDown(1);
        doc.fillColor('#173b67').fontSize(13).font('Helvetica-Bold').text('Resultados por indicador');doc.moveDown(.5);
        INDICATORS.forEach((n,i)=>{const val=Number(scores[i]||0);doc.fillColor('#20364b').fontSize(10).font('Helvetica-Bold').text(n);doc.font('Helvetica').text(`${val.toFixed(1)}% · ${reading(val)}`);const x=48,y=doc.y+3,w=300;doc.roundedRect(x,y,w,6,3).fill('#e9edf1');doc.roundedRect(x,y,w*Math.max(0,Math.min(100,val))/100,6,3).fill('#3E83C8');doc.y=y+15;});
        doc.moveDown(.5);doc.fillColor('#173b67').fontSize(13).font('Helvetica-Bold').text('Síntesis orientativa');doc.moveDown(.4);doc.fillColor('#20364b').fontSize(10.5).font('Helvetica').text(summary(scores),{lineGap:3});
        doc.moveDown(1.2);doc.fillColor('#657789').fontSize(8.5).text('Resultado descriptivo y orientativo para apoyar el acompañamiento educativo, la planificación de acciones y el seguimiento del estudiante.');
        doc.end();
      }catch(e){console.error('[INDIVIDUAL_PDF]',e);if(!res.headersSent)res.status(500).send('No fue posible generar el PDF.');}
    });

    app.post('/panel/resultados/estudiante/:studentId/reiniciar',requireEst,async(req,res)=>{
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const a=(await client.query(`SELECT a.id FROM idps_applications a WHERE a.establishment_id=$1 AND a.student_id=$2 FOR UPDATE`,[req.auth.establishmentId,req.params.studentId])).rows[0];
        if(!a)throw new Error('Aplicación no encontrada.');
        await client.query('DELETE FROM idps_responses WHERE application_id=$1',[a.id]);
        await client.query("UPDATE idps_applications SET status='pending',opened_at=NULL,completed_at=NULL WHERE id=$1",[a.id]);
        await client.query('DELETE FROM idps_student_sessions WHERE application_id=$1',[a.id]);
        await client.query('COMMIT');
        res.redirect('/panel/aplicacion?msg='+encodeURIComponent('Encuesta reiniciada. El estudiante puede responder nuevamente con la misma clave del curso.'));
      }catch(e){try{await client.query('ROLLBACK')}catch{}res.redirect('/panel/aplicacion?msg='+encodeURIComponent(e.message));}finally{client.release();}
    });

    app.post('/panel/aplicaciones/reiniciar-todas',requireEst,async(req,res)=>{
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        await client.query(`DELETE FROM idps_responses WHERE establishment_id=$1`,[req.auth.establishmentId]);
        await client.query(`DELETE FROM idps_student_sessions WHERE application_id IN (SELECT id FROM idps_applications WHERE establishment_id=$1)`,[req.auth.establishmentId]);
        const q=await client.query(`UPDATE idps_applications SET status='pending',opened_at=NULL,completed_at=NULL WHERE establishment_id=$1 RETURNING id`,[req.auth.establishmentId]);
        await client.query('COMMIT');
        res.redirect('/panel/aplicacion?msg='+encodeURIComponent(`Se reiniciaron ${q.rowCount} aplicaciones. Las claves de curso se mantienen vigentes.`));
      }catch(e){try{await client.query('ROLLBACK')}catch{}console.error('[RESET_ALL]',e);res.redirect('/panel/aplicacion?msg='+encodeURIComponent('No fue posible reiniciar las aplicaciones.'));}finally{client.release();}
    });
  }
  return previousListen.apply(this,args);
};
