'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('editor visual 2027: sintaxis, campos y llamadas protegidas',()=>{
 const h=fs.readFileSync(path.join(__dirname,'../convivencia-escolar/editar-plan-gestion-2027.html'),'utf8');
 const block=h.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
 assert.ok(block,'script visible');
 new vm.Script(block[1]);
 assert.match(h,/<html lang="es-CL">/);
 assert.match(h,/name="viewport"/);
 assert.match(h,/role="alert"/);
 for(const k of ['identification','findings','sources','participation','council','plan-actions','closure','approve-panel'])assert.ok(h.includes('id="'+k+'"'));
 assert.match(h,/\/api\/community-surveys\/pgce-scaffold\?school_year=2027&measurement_code=M1/);
 assert.match(h,/\/api\/community-surveys\/pgce-plan\/approve/);
 assert.match(h,/\/api\/community-surveys\/pgce-plan\/history/);
 assert.match(h,/expected_revision:revision/);
 assert.match(h,/role==='director'/);
 assert.match(h,/credentials:'include'/);
 assert.match(h,/referrerPolicy:'no-referrer'/);
 assert.ok(!/innerHTML\s*=/.test(h),'No colocar datos en HTML sin escapar');
 assert.ok(!/localStorage|sessionStorage|indexedDB/.test(h),'No almacenar borrador sensible en el navegador');
});
test('la pantalla de dimensiones enlaza al editor institucional',()=>{
 const h=fs.readFileSync(path.join(__dirname,'../convivencia-escolar/diagnostico-dimensiones-pgce-2027.html'),'utf8');
 assert.match(h,/href="editar-plan-gestion-2027.html"/);
});
