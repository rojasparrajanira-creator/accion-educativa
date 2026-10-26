'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {generate}=require('./generar-paquete-inicio-pgce-2027.cjs');

test('kit inicial contiene formulario real offline y guia sin endpoints productivos',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'pgce-start-'));
 try{
  const result=generate(folder);
  assert.equal(result.count,20);
  const html=fs.readFileSync(result.htmlFile,'utf8');
  const guide=fs.readFileSync(result.guideFile,'utf8');
  assert.match(html,/Evaluación profesional del piloto 2027/);
  assert.match(html,/UAT-01/);
  assert.match(html,/UAT-20/);
  assert.match(html,/authorized_to_deploy:false/);
  assert.match(html,/Descargar evaluación JSON/);
  assert.match(guide,/INICIAR-PILOTO-CONVIVENCIA-2027\.cmd/);
  assert.match(guide,/LA PAUTA NO REALIZA PRUEBAS POR SI SOLA/);
  assert.ok(!html.includes('https://convivencia-escolar-api.onrender.com'));
  assert.ok(!html.includes('<script src='));
 }finally{fs.rmSync(folder,{recursive:true,force:true})}
});

test('el iniciador para Windows no utiliza ramas de producción ni variables de pago',()=>{
 const f=fs.readFileSync(path.join(__dirname,'../INICIAR-PILOTO-CONVIVENCIA-2027.cmd'),'utf8');
 assert.match(f,/PGCE_PILOT_LOCAL=1/);
 assert.match(f,/127\.0\.0\.1:4173/);
 assert.match(f,/convivencia-api\\piloto-local-pgce-2027\.cjs/);
 assert.doesNotMatch(f,/DATABASE_URL=|MERCADOPAGO_ACCESS_TOKEN=|RENDER_API_KEY=/);
 assert.doesNotMatch(f,/git\s+push|render\s+deploy|curl\s+https:\/\//i);
});
