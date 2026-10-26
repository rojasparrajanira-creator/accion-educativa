'use strict';
// Smoke del laboratorio localhost real con navegador: no accede a Render.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createLocalPilot}=require('./piloto-local-pgce-2027.cjs');

async function run(){
 const {app,db,allowedOrigins}=await createLocalPilot();
 const server=app.listen(0,'127.0.0.1');
 let browser=null;
 try{
  await new Promise(resolve=>server.once('listening',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  allowedOrigins.add(origin);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  let blockedExternal=0;
  await context.route('**/*',route=>{
   if(route.request().url().startsWith(origin+'/'))return route.continue();
   blockedExternal++;
   return route.abort('blockedbyclient');
  });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/?perfil=coordinacion',{waitUntil:'load'});
  await page.locator('#load').click();
  await page.locator('#body').waitFor({state:'visible'});
  await page.getByText(/0 de 5 antecedentes registrados/).waitFor();
  assert.match(await page.locator('body').innerText(),/PILOTO LOCAL/);
  await page.locator('#new-action-clause').selectOption('c');
  await page.locator('#add-action').click();
  await page.locator('#edit-title').fill('Acción sintética para navegador local');
  await page.locator('#save-draft').click();
  await page.getByText(/Borrador guardado: revisión/).waitFor();
  await page.reload();await page.locator('#load').click();
  await page.getByText(/1 de 5 antecedentes registrados/).waitFor();
  const state=await page.evaluate(async()=>{
   const r=await fetch('/api/community-surveys/pgce-scaffold?school_year=2027&measurement_code=M1');
   return (await r.json()).plan;
  });
  assert.equal(state.saved_revision,1);
  assert.ok(state.draft.actions.some(x=>x.title==='Acción sintética para navegador local'));
  assert.equal(blockedExternal,0,'el piloto intentó usar recursos de terceros');
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('PILOTO_LOCAL_PGCE_2027_BROWSER_OK '+JSON.stringify({
   external_network_requests:0,real_local_http:true,editor_saved:true,school_data_synthetic:true
  }));
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
  await db.close();
 }
}
run().catch(e=>{console.error(e);process.exitCode=1});
