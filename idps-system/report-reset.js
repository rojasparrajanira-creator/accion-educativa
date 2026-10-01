const express = require('express');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL || '';
const JWT_SECRET = process.env.JWT_SECRET || '';
const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } }) : null;
const LOGO_PATH = path.join(__dirname, 'logo-oficial.jpg');

const INDICATORS = [
  'Autoestima académica y motivación escolar',
  'Clima de convivencia escolar',
  'Participación y formación ciudadana',
  'Hábitos de vida saludable'
];

const DESCRIPTIONS = [
  'Percepción de las propias capacidades académicas, motivación por aprender, perseverancia y disposición frente a los desafíos escolares.',
  'Percepción de las relaciones interpersonales, el buen trato, la seguridad y la calidad del ambiente de convivencia escolar.',
  'Disposición a participar, expresar opiniones, involucrarse en la comunidad educativa y asumir progresivamente responsabilidades ciudadanas.',
  'Prácticas vinculadas al descanso, actividad física, alimentación, autocuidado y bienestar cotidiano.'
];

const ACTIONS = [
  'Generar experiencias de logro alcanzables, retroalimentación formativa frecuente y reconocimiento explícito de avances y esfuerzos.',
  'Sostener acuerdos de buen trato, espacios de diálogo, resolución colaborativa de conflictos y acciones que refuercen la percepción de seguridad.',
  'Ampliar oportunidades reales de participación, expresión de opiniones, toma de decisiones y protagonismo estudiantil en el curso y establecimiento.',
  'Fortalecer rutinas de autocuidado, descanso, actividad física y hábitos protectores que favorezcan el bienestar y la disposición para aprender.'
];

function esc(v = '') {
  return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function parseScores(v) {
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v || '[]'); } catch { return []; }
}
function reading(v) {
  const n = Number(v || 0);
  if (n >= 75) return 'Fortaleza observada';
  if (n >= 55) return 'Desarrollo favorable';
  return 'Requiere fortalecimiento';
}
function dateCL(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function courseLabel(g, l) { return `${g || ''} ${l || ''}`.trim(); }
function formatRut(run, dv) {
  let r = String(run || ''), out = '';
  while (r.length > 3) { out = '.' + r.slice(-3) + out; r = r.slice(0, -3); }
  return r + out + '-' + String(dv || '').toUpperCase();
}
function auth(req) {
  try { return JWT_SECRET ? jwt.verify(req.cookies?.idps_session || '', JWT_SECRET) : null; } catch { return null; }
}
function requireEst(req, res, next) {
  const a = auth(req);
  if (!a || a.role !== 'establishment') return res.redirect('/');
  req.auth = a;
  next();
}

async function studentResult(estId, studentId) {
  const q = await pool.query(`SELECT r.student_id,r.scores,r.general,r.submitted_at,a.id application_id,a.grade_desc,a.course_letter,a.school_year,s.first_names,s.last_name_paternal,s.last_name_maternal,s.run,s.dv,e.name establishment_name,e.rbd,e.commune FROM idps_responses r JOIN idps_applications a ON a.id=r.application_id JOIN idps_students s ON s.id=r.student_id JOIN idps_establishments e ON e.id=r.establishment_id WHERE r.establishment_id=$1 AND r.student_id=$2 LIMIT 1`, [estId, studentId]);
  return q.rows[0] || null;
}
function fullName(r) {
  return [r.first_names, r.last_name_paternal, r.last_name_maternal].filter(Boolean).join(' ');
}
function indicatorRows(scores) {
  return INDICATORS.map((name, i) => ({ name, value: Number(scores[i] || 0), i })).sort((a, b) => b.value - a.value);
}
function summary(scores) {
  const rows = indicatorRows(scores);
  const strengths = rows.filter(r => r.value >= 55).slice(0, 2);
  const priorities = [...rows].sort((a, b) => a.value - b.value).slice(0, 2);
  const strengthText = strengths.length
    ? strengths.map(r => `${r.name} (${r.value.toFixed(1)}%)`).join(' y ')
    : `${rows[0].name} (${rows[0].value.toFixed(1)}%)`;
  const priorityText = priorities.map(r => `${r.name} (${r.value.toFixed(1)}%)`).join(' y ');
  return `El perfil de resultados muestra un desempeño relativamente más favorable en ${strengthText}. Los puntajes comparativamente más bajos se concentran en ${priorityText}, ámbitos que se sugieren como focos prioritarios de acompañamiento. La lectura debe complementarse con antecedentes del curso, trayectoria escolar y observación profesional para orientar acciones pedagógicas y de convivencia pertinentes.`;
}
function interpretation(index, value) {
  const pct = Number(value || 0).toFixed(1);
  if (Number(value || 0) >= 75) {
    return `El resultado obtenido (${pct}%) sugiere una percepción favorable en este ámbito. Se recomienda mantener las condiciones y prácticas que están favoreciendo su desarrollo, procurando ofrecer oportunidades de continuidad y profundización.`;
  }
  if (Number(value || 0) >= 55) {
    return `El resultado obtenido (${pct}%) refleja un desarrollo favorable, aunque todavía susceptible de consolidación. Se recomienda sostener los avances observados e incorporar apoyos preventivos que permitan fortalecer este ámbito de manera sistemática.`;
  }
  return `El resultado obtenido (${pct}%) se ubica entre los ámbitos que requieren mayor fortalecimiento. Se recomienda priorizar acciones de acompañamiento, seguimiento y retroalimentación, considerando el contexto del estudiante y evitando interpretar este resultado de forma aislada.`;
}
function actionFor(index, value) {
  const prefix = Number(value || 0) >= 75 ? 'Para sostener esta fortaleza: ' : Number(value || 0) >= 55 ? 'Para consolidar este ámbito: ' : 'Como foco de intervención: ';
  return prefix + ACTIONS[index];
}

function css() {
  return `:root{--navy:#0F2D52;--blue:#1E7FBC;--turq:#19C2D1;--bg:#f5f7fa;--line:#dfe5eb;--text:#20364b;--muted:#667789}*{box-sizing:border-box}body{margin:0;background:var(--bg);font-family:Inter,Arial,sans-serif;color:var(--text)}header{background:var(--navy);color:#fff;padding:16px 20px}.wrap{max-width:980px;margin:auto}main{padding:28px 14px 60px}.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:24px;box-shadow:0 8px 28px #173b6710}h1,h2{color:var(--navy);margin-top:0}.muted{color:var(--muted)}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.meta div{border:1px solid var(--line);border-radius:12px;padding:12px}.meta small{display:block;color:var(--muted);margin-bottom:4px}.score{display:grid;grid-template-columns:1.5fr .4fr .7fr;gap:10px;padding:12px 0;border-bottom:1px solid var(--line)}.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:10px;padding:11px 15px;font-weight:800;text-decoration:none;cursor:pointer}.dark{background:var(--navy);color:#fff}.secondary{background:#fff;color:var(--blue);border:1px solid var(--blue)}.danger{background:#fff;color:#a33;border:1px solid #c88}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}.summary{background:#f4f8fb;border-left:4px solid var(--blue);padding:15px;border-radius:10px;line-height:1.55}@media(max-width:700px){.meta{grid-template-columns:1fr}.score{grid-template-columns:1fr}.card{padding:18px}}@media print{header,.no-print{display:none}body{background:#fff}.card{box-shadow:none;border:0;padding:0}main{padding:0}}`;
}
function page(title, body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css()}</style></head><body><header><div class="wrap"><b>Material Educativo Chile</b><br><small>Plataforma de diagnóstico y seguimiento IDPS</small></div></header><main><div class="wrap">${body}</div></main></body></html>`;
}

const previousListen = express.application.listen;
express.application.listen = function reportResetListen(...args) {
  if (!this.__reportResetRoutes) {
    this.__reportResetRoutes = true;
    const app = this;

    app.use((req, res, next) => {
      const send = res.send.bind(res);
      res.send = function (body) {
        if (typeof body === 'string') {
          body = body.replace(/<div class="warning">[\s\S]*?<\/div>/g, '');
          body = body.replace(/<div class="notice"><b>Importante:<\/b>[\s\S]*?<\/div>/g, '');
          body = body.replace(/<p[^>]*>[^<]*(?:diagnóstico clínico|resultado oficial Mineduc|Agencia de Calidad)[\s\S]*?<\/p>/gi, '');
          body = body.replace(/Los perfiles individuales son descriptivos[^<]*/gi, '');
          if ((req.path === '/panel/resultados' || req.path === '/panel/aplicacion') && body.includes('</main>') && !body.includes('Reiniciar todas las aplicaciones')) {
            const reset = `<div class="wrap no-print" style="margin:0 auto 28px;max-width:1180px"><div class="card" style="border:1px solid #e2b6b6"><h2>Reiniciar aplicaciones</h2><p class="muted">Utiliza esta opción cuando el establecimiento necesite aplicar una nueva versión del instrumento. Se eliminan las respuestas registradas y los estudiantes quedan nuevamente en estado pendiente. Las claves de acceso del curso se mantienen.</p><form method="post" action="/panel/aplicaciones/reiniciar-todas" onsubmit="return confirm('¿Confirma que desea reiniciar todas las encuestas respondidas de este establecimiento? Esta acción eliminará las respuestas actuales.')"><button class="btn" style="background:#fff;color:#a33;border:1px solid #c88">Reiniciar todas las aplicaciones</button></form></div></div>`;
            body = body.replace('</main>', reset + '</main>');
          }
        }
        return send(body);
      };
      next();
    });

    app.get('/panel/resultados/estudiante/:studentId', requireEst, async (req, res) => {
      try {
        const r = await studentResult(req.auth.establishmentId, req.params.studentId);
        if (!r) return res.status(404).send(page('Resultado no disponible', '<div class="card"><h1>Resultado no disponible</h1><p>El estudiante no registra una aplicación vigente.</p></div>'));
        const scores = parseScores(r.scores);
        const detail = INDICATORS.map((n, i) => `<div class="score"><div><b>${esc(n)}</b></div><div>${Number(scores[i] || 0).toFixed(1)}%</div><div>${esc(reading(scores[i]))}</div></div>`).join('');
        res.send(page('Informe individual IDPS', `<div class="card"><h1>Informe individual de resultados</h1><p class="muted"><b>${esc(r.establishment_name)}</b> · Indicadores de Desarrollo Personal y Social · Síntesis para el acompañamiento educativo.</p><div class="meta"><div><small>Estudiante</small><b>${esc(fullName(r))}</b></div><div><small>RUT</small><b>${esc(formatRut(r.run, r.dv))}</b></div><div><small>Curso</small><b>${esc(courseLabel(r.grade_desc, r.course_letter))}</b></div><div><small>Establecimiento</small><b>${esc(r.establishment_name)}</b></div><div><small>RBD</small><b>${esc(r.rbd)}</b></div><div><small>Fecha de aplicación</small><b>${dateCL(r.submitted_at)}</b></div></div><h2>Resultados por indicador</h2>${detail}<h2 style="margin-top:24px">Síntesis interpretativa</h2><div class="summary">${esc(summary(scores))}</div><div class="no-print actions"><a class="btn dark" href="/panel/resultados/estudiante/${encodeURIComponent(r.student_id)}/pdf">Descargar informe PDF</a><button class="btn secondary" onclick="window.print()">Imprimir</button><a class="btn secondary" href="/panel/resultados">Volver a resultados</a><form method="post" action="/panel/resultados/estudiante/${encodeURIComponent(r.student_id)}/reiniciar" onsubmit="return confirm('¿Reiniciar la encuesta de este estudiante? Se eliminará su respuesta actual y podrá responder nuevamente con la misma clave del curso.')"><button class="btn danger">Reiniciar encuesta</button></form></div></div>`));
      } catch (e) {
        console.error('[INDIVIDUAL_REPORT]', e);
        res.status(500).send(page('Error', '<div class="card"><h1>No fue posible cargar el informe.</h1></div>'));
      }
    });

    app.get('/panel/resultados/estudiante/:studentId/pdf', requireEst, async (req, res) => {
      try {
        const r = await studentResult(req.auth.establishmentId, req.params.studentId);
        if (!r) return res.status(404).send('Resultado no disponible');
        const scores = parseScores(r.scores).map(Number);
        const ranked = indicatorRows(scores);
        const priorities = [...ranked].sort((a, b) => a.value - b.value).slice(0, 2);
        const safe = (fullName(r) || 'estudiante').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: 40, left: 46, right: 46, bottom: 24 },
          bufferPages: true,
          info: {
            Title: 'Informe Individual de Resultados - Desarrollo Personal y Social',
            Author: 'Material Educativo Chile',
            Subject: 'Informe individual IDPS'
          }
        });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Informe_IDPS_${safe}.pdf"`);
        res.setHeader('Cache-Control', 'private, no-store');
        doc.pipe(res);

        const W = doc.page.width, H = doc.page.height, M = 46, CW = W - M * 2;
        const navy = '#0F2D52', blue = '#1E7FBC', turq = '#19C2D1', yellow = '#FFD200';
        const graphite = '#4A4D57', muted = '#667789', light = '#F4F6F8', line = '#D9E0E6', paleBlue = '#EEF5FA', paleGreen = '#F1F8F0';

        function header() {
          const top = 12;
          if (fs.existsSync(LOGO_PATH)) {
            try { doc.image(LOGO_PATH, M, top, { fit: [38, 38] }); } catch {}
          }
          const textX = fs.existsSync(LOGO_PATH) ? M + 48 : M;
          doc.fillColor(navy).font('Helvetica-Bold').fontSize(10.5).text('MATERIAL EDUCATIVO CHILE', textX, top + 2, { width: 245, lineBreak: false });
          doc.fillColor(blue).font('Helvetica-Bold').fontSize(9.2).text(String(r.establishment_name || 'Establecimiento educacional').toUpperCase(), textX, top + 18, { width: 300, lineBreak: false, ellipsis: true });
          doc.fillColor(muted).font('Helvetica').fontSize(7.7).text(`RBD ${r.rbd || '—'}${r.commune ? ' · ' + r.commune : ''}`, textX, top + 32, { width: 300, lineBreak: false });
          doc.fillColor(navy).font('Helvetica-Bold').fontSize(9).text('INFORME INDIVIDUAL IDPS', W - M - 165, top + 5, { width: 165, align: 'right', lineBreak: false });
          doc.fillColor(muted).font('Helvetica').fontSize(7.5).text('Desarrollo Personal y Social', W - M - 165, top + 21, { width: 165, align: 'right', lineBreak: false });
          doc.save().moveTo(M, 61).lineTo(W - M, 61).lineWidth(2.3).strokeColor(turq).stroke().restore();
          doc.save().moveTo(M, 64).lineTo(M + 78, 64).lineWidth(2.3).strokeColor(yellow).stroke().restore();
          doc.y = 78;
        }
        function footer(pageNo, total) {
          doc.save();
          doc.fillColor('#7A8794').font('Helvetica').fontSize(7.2)
            .text(`Material Educativo Chile · ${r.establishment_name} · Página ${pageNo} de ${total}`, M, H - 31, { width: CW, align: 'center', lineBreak: false });
          doc.restore();
        }
        function section(title, y) {
          doc.fillColor(navy).font('Helvetica-Bold').fontSize(11.4).text(title, M, y, { width: CW, lineBreak: false });
          doc.save().moveTo(M, y + 17).lineTo(W - M, y + 17).lineWidth(.7).strokeColor(line).stroke().restore();
          return y + 25;
        }
        function metaCell(x, y, w, label, value) {
          doc.save().roundedRect(x, y, w, 40, 5).fill(light).strokeColor(line).stroke().restore();
          doc.fillColor(muted).font('Helvetica-Bold').fontSize(7.1).text(label, x + 7, y + 7, { width: w - 14, lineBreak: false });
          doc.fillColor(graphite).font('Helvetica').fontSize(8.4).text(String(value || '—'), x + 7, y + 19, { width: w - 14, height: 16, ellipsis: true, lineBreak: false });
        }
        function wrappedHeight(text, width, fontSize, lineGap = 1.5, font = 'Helvetica') {
          doc.font(font).fontSize(fontSize);
          return doc.heightOfString(text, { width, lineGap });
        }

        header();
        doc.fillColor(navy).font('Helvetica-Bold').fontSize(18).text('Informe Individual de Resultados', M, 79, { width: CW, lineBreak: false });
        doc.fillColor(graphite).font('Helvetica').fontSize(9.2).text('Indicadores de Desarrollo Personal y Social · Síntesis para el acompañamiento educativo', M, 104, { width: CW, lineBreak: false });

        const gap = 6, cellW = (CW - gap * 2) / 3, metaY = 128;
        metaCell(M, metaY, cellW, 'ESTUDIANTE', fullName(r));
        metaCell(M + cellW + gap, metaY, cellW, 'RUT', formatRut(r.run, r.dv));
        metaCell(M + (cellW + gap) * 2, metaY, cellW, 'CURSO', courseLabel(r.grade_desc, r.course_letter));
        metaCell(M, metaY + 46, cellW, 'ESTABLECIMIENTO', r.establishment_name);
        metaCell(M + cellW + gap, metaY + 46, cellW, 'RBD', r.rbd);
        metaCell(M + (cellW + gap) * 2, metaY + 46, cellW, 'FECHA DE APLICACIÓN', dateCL(r.submitted_at));

        let y = section('1. Síntesis interpretativa', 224);
        const summaryText = summary(scores);
        doc.fillColor(graphite).font('Helvetica').fontSize(9).text(summaryText, M, y, { width: CW, lineGap: 2 });
        y += wrappedHeight(summaryText, CW, 9, 2) + 12;

        y = section('2. Resultados por ámbito', y);
        const col = [CW * .54, CW * .16, CW * .30], rowH = 30, tableY = y;
        doc.save().rect(M, tableY, CW, 26).fill(paleBlue).restore();
        let xx = M;
        ['Ámbito evaluado', 'Resultado', 'Lectura orientativa'].forEach((t, i) => {
          doc.fillColor(navy).font('Helvetica-Bold').fontSize(7.8).text(t, xx + 6, tableY + 8, { width: col[i] - 12, lineBreak: false });
          xx += col[i];
        });
        let yy = tableY + 26;
        INDICATORS.forEach((name, i) => {
          doc.save().rect(M, yy, CW, rowH).strokeColor(line).stroke().restore();
          doc.fillColor(graphite).font('Helvetica').fontSize(7.9).text(name, M + 6, yy + 7, { width: col[0] - 12, height: 18, ellipsis: true });
          doc.font('Helvetica-Bold').fontSize(8.1).text(`${Number(scores[i] || 0).toFixed(1)}%`, M + col[0] + 6, yy + 9, { width: col[1] - 12, lineBreak: false });
          doc.font('Helvetica').fontSize(7.7).text(reading(scores[i]), M + col[0] + col[1] + 6, yy + 7, { width: col[2] - 12, height: 18, ellipsis: true });
          yy += rowH;
        });

        y = yy + 14;
        y = section('3. Perfil gráfico de resultados', y);
        const barLabelW = 160, barX = M + barLabelW, barW = CW - barLabelW - 48;
        INDICATORS.forEach((name, i) => {
          const val = Math.max(0, Math.min(100, Number(scores[i] || 0)));
          doc.fillColor(graphite).font('Helvetica').fontSize(7.5).text(name, M, y, { width: barLabelW - 10, height: 18, ellipsis: true });
          doc.save().roundedRect(barX, y + 2, barW, 9, 4).fill('#E9EDF1').restore();
          if (val > 0) doc.save().roundedRect(barX, y + 2, barW * val / 100, 9, 4).fill(blue).restore();
          doc.fillColor(graphite).font('Helvetica-Bold').fontSize(7.5).text(`${val.toFixed(1)}%`, barX + barW + 6, y + 1, { width: 42, lineBreak: false });
          y += 24;
        });

        doc.addPage();
        header();
        doc.fillColor(navy).font('Helvetica-Bold').fontSize(16).text('Interpretación y orientaciones de acompañamiento', M, 80, { width: CW, lineBreak: false });
        doc.fillColor(muted).font('Helvetica').fontSize(8.5).text('Lectura pedagógica de los resultados para apoyar la planificación de acciones y el seguimiento educativo.', M, 103, { width: CW, lineBreak: false });

        y = section('4. Lectura por ámbito', 130);
        INDICATORS.forEach((name, i) => {
          const interp = interpretation(i, scores[i]);
          const action = actionFor(i, scores[i]);
          const textW = CW - 24;
          const h1 = wrappedHeight(interp, textW, 8.1, 1.4);
          const h2 = wrappedHeight(action, textW, 8.1, 1.4, 'Helvetica-Bold');
          const cardH = Math.max(70, 30 + h1 + h2);
          doc.save().roundedRect(M, y, CW, cardH, 6).fill('#FAFBFC').strokeColor(line).stroke().restore();
          doc.fillColor(navy).font('Helvetica-Bold').fontSize(8.9).text(name, M + 10, y + 9, { width: CW - 20, lineBreak: false, ellipsis: true });
          doc.fillColor(graphite).font('Helvetica').fontSize(8.1).text(interp, M + 10, y + 25, { width: textW, lineGap: 1.4 });
          const actionY = y + 25 + h1 + 5;
          doc.fillColor(blue).font('Helvetica-Bold').fontSize(8.1).text(action, M + 10, actionY, { width: textW, lineGap: 1.4 });
          y += cardH + 8;
        });

        y = section('5. Prioridades de acompañamiento', y + 2);
        priorities.forEach((p, idx) => {
          const action = ACTIONS[p.i];
          const cardH = 52;
          doc.save().roundedRect(M, y, CW, cardH, 6).fill(paleGreen).strokeColor('#C8DCC4').stroke().restore();
          doc.fillColor(navy).font('Helvetica-Bold').fontSize(8.3).text(`PRIORIDAD ${idx + 1}`, M + 9, y + 9, { width: 72, lineBreak: false });
          doc.fillColor(graphite).font('Helvetica-Bold').fontSize(8.2).text(`${p.name} · ${p.value.toFixed(1)}%`, M + 88, y + 8, { width: CW - 97, lineBreak: false, ellipsis: true });
          doc.fillColor(graphite).font('Helvetica').fontSize(7.8).text(action, M + 88, y + 24, { width: CW - 97, height: 22, ellipsis: true });
          y += cardH + 7;
        });

        const useY = Math.min(y + 4, H - 112);
        doc.save().roundedRect(M, useY, CW, 60, 6).fill('#F7FAFC').strokeColor('#D8E3EA').stroke().restore();
        doc.fillColor(navy).font('Helvetica-Bold').fontSize(8.3).text('Uso del informe', M + 9, useY + 9, { lineBreak: false });
        doc.fillColor(graphite).font('Helvetica').fontSize(7.8).text('Este informe sistematiza las respuestas obtenidas mediante el instrumento de Desarrollo Personal y Social de Material Educativo Chile. Su propósito es apoyar la toma de decisiones educativas y el seguimiento del estudiante. Los resultados deben analizarse junto con otros antecedentes pedagógicos, de convivencia y del contexto escolar.', M + 9, useY + 23, { width: CW - 18, lineGap: 1.3 });

        const range = doc.bufferedPageRange();
        const totalPages = range.count;
        for (let i = 0; i < totalPages; i++) {
          doc.switchToPage(range.start + i);
          footer(i + 1, totalPages);
        }
        doc.end();
      } catch (e) {
        console.error('[INDIVIDUAL_PDF]', e);
        if (!res.headersSent) res.status(500).send('No fue posible generar el PDF.');
      }
    });

    app.post('/panel/resultados/estudiante/:studentId/reiniciar', requireEst, async (req, res) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const a = (await client.query(`SELECT a.id FROM idps_applications a WHERE a.establishment_id=$1 AND a.student_id=$2 FOR UPDATE`, [req.auth.establishmentId, req.params.studentId])).rows[0];
        if (!a) throw new Error('Aplicación no encontrada.');
        await client.query('DELETE FROM idps_responses WHERE application_id=$1', [a.id]);
        await client.query("UPDATE idps_applications SET status='pending',opened_at=NULL,completed_at=NULL WHERE id=$1", [a.id]);
        await client.query('DELETE FROM idps_student_sessions WHERE application_id=$1', [a.id]);
        await client.query('COMMIT');
        res.redirect('/panel/aplicacion?msg=' + encodeURIComponent('Encuesta reiniciada. El estudiante puede responder nuevamente con la misma clave del curso.'));
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        res.redirect('/panel/aplicacion?msg=' + encodeURIComponent(e.message));
      } finally {
        client.release();
      }
    });

    app.post('/panel/aplicaciones/reiniciar-todas', requireEst, async (req, res) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM idps_responses WHERE establishment_id=$1`, [req.auth.establishmentId]);
        await client.query(`DELETE FROM idps_student_sessions WHERE application_id IN (SELECT id FROM idps_applications WHERE establishment_id=$1)`, [req.auth.establishmentId]);
        const q = await client.query(`UPDATE idps_applications SET status='pending',opened_at=NULL,completed_at=NULL WHERE establishment_id=$1 RETURNING id`, [req.auth.establishmentId]);
        await client.query('COMMIT');
        res.redirect('/panel/aplicacion?msg=' + encodeURIComponent(`Se reiniciaron ${q.rowCount} aplicaciones. Las claves de curso se mantienen vigentes.`));
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        console.error('[RESET_ALL]', e);
        res.redirect('/panel/aplicacion?msg=' + encodeURIComponent('No fue posible reiniciar las aplicaciones.'));
      } finally {
        client.release();
      }
    });
  }
  return previousListen.apply(this, args);
};
