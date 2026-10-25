'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLocalPilot}=require('./piloto-local-pgce-2027.cjs');
test('piloto local sirve el editor real aislado sin acceso a producción y distingue perfiles',async()=>{
 const {app,db,allowedOrigins}=await createLocalPilot();
 const server=app.listen(0,'127.0.0.1');
 try{
  await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  allowedOrigins.add(base);
  const guest=await fetch(base+'/');
  assert.equal(guest.status,403);
  const init=await fetch(base+'/?perfil=coordinacion');
  assert.equal(init.status,200);
  const html=await init.text();
  assert.match(html,/PILOTO LOCAL/);
  assert.match(html,/Abrir pauta UAT \(20 casos\)/);
  const forbiddenForm=await fetch(base+'/piloto/uat');
  assert.equal(forbiddenForm.status,403);
  const formResponse=await fetch(base+'/piloto/uat',{
   headers:{Cookie:'pgce_piloto_ficticio=coordinacion'}});
  assert.equal(formResponse.status,200);
  const formHtml=await formResponse.text();
  assert.match(formHtml,/Evaluación profesional del piloto 2027/);
  assert.match(formHtml,/const CASES=/);

  assert.match(html,/const API=''/);
  assert.ok(!html.includes('https://convivencia-escolar-api.onrender.com'));
  assert.match(init.headers.get('content-security-policy'),/connect-src 'self'/);
  assert.match(init.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
  const health=await fetch(base+'/piloto/salud');
  assert.deepEqual(await health.json(),{ok:true,mode:'local_synthetic_only',
   production_connected:false,school_count:2});
  const list=async name=>{
   const r=await fetch(base+'/api/community-surveys/pgce-pilot-checklist?school_year=2027',
    {headers:{Cookie:'pgce_piloto_ficticio='+name}});
   return {code:r.status,data:await r.json()};
  };
  let r=await list('coordinacion');
  assert.equal(r.code,200);assert.equal(r.data.completed_checks,0);
  r=await list('otra-escuela');
  assert.equal(r.code,200);assert.equal(r.data.completed_checks,0);
  r=await list('profesor');
  assert.equal(r.code,403);
  const doc=await fetch(base+'/api/community-surveys/pgce-governance?school_year=2027',
   {headers:{Cookie:'pgce_piloto_ficticio=directora'}});
  assert.equal(doc.status,200);
  assert.equal((await doc.json()).stages.direction_act.current,false);
  const injection=await fetch(base+'/api/community-surveys/pgce-governance?school_year=2027',{
   method:'PUT',headers:{'Content-Type':'application/json','Origin':'https://malicioso.example',
    Cookie:'pgce_piloto_ficticio=directora'},
   body:JSON.stringify({expected_revision:1,record:{
    stage:'direction_act',document_ref:'ACTA-FICTICIA-2027',
    document_date:'2027-05-01',confirmation:true}})});
  assert.equal(injection.status,403);
  assert.equal((await injection.json()).error,'origin_forbidden');
  const unknown=await fetch(base+'/?perfil=usuario-real');
  assert.equal(unknown.status,403);
 }finally{
  await new Promise(resolve=>server.close(resolve));
  await db.close();
 }
});
