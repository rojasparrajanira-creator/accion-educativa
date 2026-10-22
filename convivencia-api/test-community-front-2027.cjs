'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

test('pantalla de comunidad es responsive, no envía códigos en URL y no retiene respuestas',()=>{
 const p=path.join(__dirname,'../convivencia-escolar/encuesta-estamentos-2027.html');
 const h=fs.readFileSync(p,'utf8');
 const script=h.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
 assert.ok(script,'Debe existir lógica de cliente');
 new vm.Script(script[1]);
 assert.match(h,/name="viewport"/);
 assert.match(h,/lang="es-CL"/);
 assert.match(h,/type="password" inputmode="numeric"/);
 assert.match(h,/credentials:'omit'/);
 assert.match(h,/referrerPolicy:'no-referrer'/);
 assert.match(h,/headers:\{'Content-Type':'application\/json','X-Community-Access':token\}/);
 assert.ok(!/\bsessionStorage\b|\blocalStorage\b|\bindexedDB\b|\bsendBeacon\b/.test(h));
 assert.ok(!/location\.href\s*=/.test(h));
 assert.ok(!/invite_code=.*?\+/.test(h));
 assert.match(h,/answers=Object\.create\(null\)/);
 assert.match(h,/token='';answers=Object\.create\(null\)/);
 assert.match(h,/id="skip"/);
 assert.match(h,/role="radiogroup"/);
 assert.match(h,/role="progressbar"/);
});
test('API de adultos sigue desactivada salvo autorización opt-in explícita',()=>{
 const s=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
 assert.match(s,/if\(process\.env\.MEC_COMMUNITY_SURVEYS_ENABLED==='1'\)/);
 assert.match(s,/community-surveys\.sql/);
 assert.match(s,/registerCommunitySurveys\(/);
 assert.match(s,/X-Student-Access, X-Community-Access/);
 assert.match(s,/accessStatus:id=>subscriptions\.accessStatus\(id\),allowedOrigins/);
 const m=fs.readFileSync(path.join(__dirname,'community-surveys.js'),'utf8');
 assert.match(m,/if\(process\.env\.MEC_COMMUNITY_SURVEYS_ENABLED!=='1'\)return false/);
});
test('banco backend coincide íntegramente con preguntas visibles en vista previa',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../convivencia-escolar/js/instrumentos-estamentos-2027.js'),'utf8');
 const data={window:{}};
 vm.runInNewContext(src,data,{timeout:1500});
 const original=data.window.MECEncuestasEstamentos2027;
 const backend=require('./community-surveys-bank-2027.json');
 assert.equal(JSON.stringify(original),JSON.stringify(backend));
});

test('panel profesional solo consulta listado segregado y no filtra RUN al público',()=>{
 const page=fs.readFileSync(path.join(__dirname,'../convivencia-escolar/gestionar-encuestas-estamentos-2027.html'),'utf8');
 const script=page.match(/<script>\s*([\s\S]*?)\s*<\/script>/);
 assert.ok(script);
 new vm.Script(script[1]);
 assert.match(page,/\/api\/community-surveys\/targets\?audience=/);
 assert.ok(!page.includes('/api/students?'));
 assert.ok(!page.includes("api('/api/users"));
 assert.match(page,/relation_verified:true/);
 assert.match(page,/verification_reference:reference/);
 assert.match(page,/currentCode='';currentPin=''/);
});
