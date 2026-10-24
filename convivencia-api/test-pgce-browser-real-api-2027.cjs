'use strict';
// Prueba integrada del editor con sus rutas REALES, sesión únicamente ficticia
// y PostgreSQL efímero. Nunca conecta a Render ni a datos institucionales.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {chromium}=require('playwright');
const {registerCommunitySurveys}=require('./community-surveys');

const html=fs.readFileSync(path.join(__dirname,'../convivencia-escolar/diagnostico-dimensiones-pgce-2027.html'),'utf8')
 .replace("const API='https://convivencia-escolar-api.onrender.com'","const API=''");
if(!html.includes("const API=''"))throw Error('external_api_not_disabled');

async function run(){
 const db=new PGlite();
 let server=null,browser=null;
 const previousFlag=process.env.MEC_COMMUNITY_SURVEYS_ENABLED;
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'community-surveys.sql'),'utf8'));
  const schools=(await db.query(
   "INSERT INTO establishments(name,rbd) VALUES('Escuela ficticia A','UAT-BROWSER-A'),('Escuela ficticia B','UAT-BROWSER-B') RETURNING id"
  )).rows;
  const identities=Object.create(null);
  for(const entry of [
   ['coordA',schools[0].id,'coordinador_convivencia'],
   ['directorA',schools[0].id,'directora'],
   ['profesorA',schools[0].id,'profesor'],
   ['coordB',schools[1].id,'coordinador_convivencia']
  ]){
   const [key,schoolId,role]=entry;
   const user=(await db.query(
    'INSERT INTO users(establishment_id,email,name,role) VALUES($1,$2,$3,$4) RETURNING id',
    [schoolId,key+'@invalid.example','Persona de ensayo '+key,role]
   )).rows[0];
   identities[key]={id:Number(user.id),establishment_id:Number(schoolId),role};
  }
  const pool={query:(...args)=>db.query(...args),
   connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
  const app=express();
  app.disable('x-powered-by');
  app.use(express.json());
  const pilotCookie=req=>{
   const cookies=String(req.headers.cookie||'');
   const match=cookies.match(/(?:^|;\s*)pgce_test_identity=([a-zA-Z0-9]+)/);
   return identities[match?.[1]]||null;
  };
  const requireRole=(...allowed)=>[(req,res,next)=>{
   const actor=pilotCookie(req);
   if(!actor||!allowed.includes(actor.role))
    return res.status(403).json({ok:false,error:'role_forbidden'});
   req.auth={id:actor.id,establishment_id:actor.establishment_id,
    canonical_role:actor.role};
   next();
  }];
  const allowedOrigins=new Set();
  process.env.MEC_COMMUNITY_SURVEYS_ENABLED='1';
  assert.equal(registerCommunitySurveys({app,pool,requireRole,
   rateLimit:()=>((req,res,next)=>next()),
   accessStatus:async()=>true,allowedOrigins}),true);
  // Este servidor responde SOLO en la interfaz loopback y con datos sintéticos.
  app.get('/',(req,res)=>{
   const persona=String(req.query.as||'');
   if(!Object.hasOwn(identities,persona))return res.status(403).send('pilot_identity_required');
   res.setHeader('Cache-Control','no-store');
   res.setHeader('Set-Cookie','pgce_test_identity='+persona+'; Path=/; HttpOnly; SameSite=Strict');
   res.type('html').send(html);
  });
  server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  allowedOrigins.add(origin);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
  await context.route('**/*',route=>{
   if(route.request().url().startsWith(origin+'/'))return route.continue();
   return route.abort('blockedbyclient');
  });
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(String(e.message)));
  async function login(persona){
   await page.goto(origin+'/?as='+persona,{waitUntil:'load'});
   await page.locator('#load').click();
  }
  const status=async endpoint=>{
   return page.evaluate(async endpoint=>{
    const r=await fetch('/api/community-surveys/'+endpoint+'?school_year=2027',
     {credentials:'same-origin'});
    return {status:r.status,body:await r.json()};
   },endpoint);
  };
  await login('coordA');
  await page.locator('#body').waitFor({state:'visible'});
  await page.getByText(/0 de 5 antecedentes registrados/).waitFor();
  assert.equal((await status('pgce-pilot-checklist')).body.completed_checks,0);
  await page.locator('#new-action-clause').selectOption('c');
  await page.locator('#add-action').click();
  assert.equal(await page.locator('#action-clause').inputValue(),'ACT-c-002');
  await page.locator('#edit-title').fill('Acción sintética con persistencia real');
  await page.locator('#finding-dimension').selectOption('SEG');
  await page.locator('#finding-need').fill('Necesidad colectiva estrictamente ficticia');
  await page.locator('#finding-evidence').fill('ACTA-SINTETICA-2027');
  await page.locator('#add-finding').click();
  await page.locator('#save-draft').click();
  await page.getByText(/Borrador guardado: revisión/).waitFor();
  let plan=await page.evaluate(async()=>{
   const r=await fetch('/api/community-surveys/pgce-scaffold?school_year=2027&measurement_code=M1');
   return {status:r.status,body:await r.json()};
  });
  assert.equal(plan.status,200);
  assert.equal(plan.body.plan.saved_revision,1);
  assert.ok(plan.body.plan.draft.actions.some(a=>a.action_id==='ACT-c-002'&&
   a.title==='Acción sintética con persistencia real'));
  assert.equal(plan.body.plan.preflight.status==='ready_for_human_review',false);
  assert.equal((await status('pgce-pilot-checklist')).body.can_publish,false);
  await page.reload();
  await page.locator('#load').click();
  await page.getByText(/1 de 5 antecedentes registrados/).waitFor();
  // El editor puede recargar datos guardados sin perder el identificador de acción.
  const saved=await page.evaluate(async()=>{
   const r=await fetch('/api/community-surveys/pgce-scaffold?school_year=2027&measurement_code=M1');
   return (await r.json()).plan.draft.actions;
  });
  assert.ok(saved.find(a=>a.action_id==='ACT-c-002'));
  await page.locator('#governance-stage').selectOption('council_review');
  await page.locator('#governance-ref').fill('ACTA-ENSAYO-CE-2027');
  await page.locator('#governance-date').fill('2027-05-01');
  await page.locator('#governance-confirm').check();
  await page.locator('#save-governance').click();
  await page.getByText(/Referencia registrada para el borrador/).waitFor();
  assert.equal((await status('pgce-governance')).body.stages.council_review.current,true);
  // Coordinación no puede registrar acta de Dirección ni siquiera por API directa.
  let response=await page.evaluate(async()=>{
   const r=await fetch('/api/community-surveys/pgce-governance?school_year=2027',{
    method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({
     expected_revision:1,record:{stage:'direction_act',document_ref:'RES-ENSAYO-2027',
      document_date:'2027-05-02',confirmation:true}})});
   return {status:r.status,data:await r.json()};
  });
  assert.equal(response.status,403);
  assert.equal(response.data.error,'pgce_governance_forbidden');
  await page.locator('#download-csv').click();
  await page.getByText(/Debes registrar una revisión vigente de privacidad/).waitFor();
  await page.locator('#privacy-confirm').check();
  await page.locator('#review-export').click();
  await page.getByText(/Revisión registrada/).waitFor();
  const downloadEvent=page.waitForEvent('download');
  await page.locator('#download-csv').click();
  const download=await downloadEvent;
  assert.match(download.suggestedFilename(),/convivencia-pgce-2027-M1-borrador\.csv/);
  const fsTemp=path.join(__dirname,'pgce-uat-evidence.tmp.csv');
  await download.saveAs(fsTemp);
  const csv=fs.readFileSync(fsTemp,'utf8');
  fs.unlinkSync(fsTemp);
  assert.ok(csv.startsWith('\ufeff'));
  assert.ok(!csv.includes('coordA@invalid.example'));
  assert.ok(!csv.includes('ACTA-ENSAYO-CE-2027'));
  assert.equal((await status('pgce-pilot-checklist')).body.can_publish,false);
  // Otra institución NO debe ver el borrador, referencias ni revision del A.
  await login('coordB');
  await page.getByText(/0 de 5 antecedentes registrados/).waitFor();
  const other=await page.evaluate(async()=>{
   const r=await fetch('/api/community-surveys/pgce-scaffold?school_year=2027&measurement_code=M1');
   return (await r.json()).plan;
  });
  assert.equal(other.saved_revision,0);
  assert.ok(!JSON.stringify(other).includes('ACTA-ENSAYO-CE-2027'));
  assert.ok(!JSON.stringify(other).includes('Acción sintética con persistencia real'));
  assert.equal((await status('pgce-pilot-checklist')).body.completed_checks,0);
  await login('profesorA');
  assert.equal((await status('pgce-pilot-checklist')).status,403);
  assert.equal((await status('pgce-governance')).status,403);
  await login('coordA');
  await page.getByText(/3 de 5 antecedentes registrados/).waitFor();
  assert.equal((await status('pgce-governance')).body.stages.council_review.current,true);
  assert.deepEqual(pageErrors,[]);
  console.log('PGCE_BROWSER_REAL_API_OK '+JSON.stringify({
   real_http_routes:true,ephemeral_pg:true,role_separation:true,
   cross_school_isolation:true,persisted_action_ids:true,council_provenance:true,
   privacy_gated_csv:true,no_production:true}));
  await context.close();
 }finally{
  if(browser)await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  if(previousFlag===undefined)delete process.env.MEC_COMMUNITY_SURVEYS_ENABLED;
  else process.env.MEC_COMMUNITY_SURVEYS_ENABLED=previousFlag;
  await db.close();
 }
}
run().catch(err=>{console.error(err);process.exitCode=1});
