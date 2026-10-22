'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
test('panel de 10 dimensiones exige ingreso profesional y no publica respuestas individuales',()=>{
 const page=fs.readFileSync(path.join(__dirname,'../convivencia-escolar/diagnostico-dimensiones-pgce-2027.html'),'utf8');
 assert.match(page,/lang="es-CL"/);
 assert.match(page,/name="viewport"/);
 assert.match(page,/role="alert"/);
 assert.match(page,/\/api\/community-surveys\/pgce-scaffold\?school_year=2027/);
 assert.match(page,/credentials:'include'/);
 assert.match(page,/referrerPolicy:'no-referrer'/);
 assert.match(page,/textContent=val/);
 assert.match(page,/textContent=d\.label/);
 assert.match(page,/plan\.preflight\.status/);
 assert.match(page,/id="suggestions"/);
 assert.match(page,/result\.suggested_actions/);
 assert.match(page,/textContent=a\.proposed_title/);
 assert.ok(!/innerHTML\s*=/.test(page));
 assert.ok(!/\blocalStorage\b|\bsessionStorage\b/.test(page));
 assert.ok(!/\bwindow\.print\s*\(/.test(page));
 assert.ok(!/\binnerHTML\s*=/.test(page));
 const m=page.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
 assert.ok(m);
 new vm.Script(m[1]);
});

test('editor de Plan 2027 muestra todos los apartados, guarda versión con protección y no aprueba',()=>{
 const page=fs.readFileSync(path.join(__dirname,'../convivencia-escolar/editar-plan-pgce-2027.html'),'utf8');
 assert.match(page,/lang="es-CL"/);
 assert.match(page,/name="viewport"/);
 assert.match(page,/id="main-editor" hidden/);
 assert.match(page,/Plan de Gestión 2027/);
 assert.match(page,/id="actions"/);
 assert.match(page,/id="findings"/);
 assert.match(page,/id="participation"/);
 assert.match(page,/id="governance"/);
 assert.match(page,/expected_revision:revision/);
 assert.match(page,/\/api\/community-surveys\/pgce-draft/);
 assert.match(page,/credentials:'include'/);
 assert.match(page,/revision_conflict|Existe una versión más reciente/);
 assert.match(page,/No aprobado/);
 assert.ok(!/\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/.test(page));
 assert.ok(!/\binnerHTML\s*=/.test(page));
 const js=page.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
 assert.ok(js);
 new vm.Script(js[1]);
});

test('panel de diagnóstico ofrece enlace al editor sin aplicar sugerencias automáticamente',()=>{
 const page=fs.readFileSync(path.join(__dirname,'../convivencia-escolar/diagnostico-dimensiones-pgce-2027.html'),'utf8');
 assert.match(page,/href="editar-plan-pgce-2027.html"/);
 assert.match(page,/Las propuestas anteriores no se incorporan sin revisión/);
});
