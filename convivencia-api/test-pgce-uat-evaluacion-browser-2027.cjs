'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
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
  const guest=await fetch(origin+'/piloto/uat');
  assert.equal(guest.status,403);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
  let outgoing=0;
  await ctx.route('**/*',route=>{
   if(route.request().url().startsWith(origin+'/'))return route.continue();
   outgoing++;return route.abort('blockedbyclient');
  });
  const page=await ctx.newPage();
  const errors=[];page.on('pageerror',x=>errors.push(x.message));
  await page.goto(origin+'/?perfil=coordinacion');
  await page.goto(origin+'/piloto/uat');
  assert.equal(await page.locator('article').count(),20);
  assert.equal(await page.locator('#counter').innerText(),'Registrados: 0 Pasa, 0 Falla y 20 No probado. Registro manual, sin certificación.');
  await page.locator('#UAT-01-estado').selectOption('Pasa');
  await page.locator('#download').click();
  assert.match(await page.locator('#message').innerText(),/necesita fecha y evidencia/);
  await page.locator('#UAT-01-fecha').fill('2027-04-01');
  await page.locator('#UAT-01-evidencia').fill('ACTA-FICTICIA-01');
  await page.locator('#UAT-01-observacion').fill('Solo una verificación humana sintética');
  await page.locator('#UAT-02-estado').selectOption('Falla');
  await page.locator('#UAT-02-fecha').fill('2027-04-02');
  await page.locator('#UAT-02-evidencia').fill('INC-PRUEBA-02');
  const d=page.waitForEvent('download');
  await page.locator('#download').click();
  const download=await d;
  assert.equal(download.suggestedFilename(),'PGCE-2027-Evaluacion-UAT-SIN-CERTIFICACION.json');
  const tmp=path.join(os.tmpdir(),'pgce-uat-browser-'+process.pid+'.json');
  try{
   await download.saveAs(tmp);
   const json=JSON.parse(fs.readFileSync(tmp,'utf8'));
   assert.equal(json.results.length,20);
   assert.equal(json.results[0].estado,'Pasa');
   assert.equal(json.results[1].estado,'Falla');
   assert.equal(json.authorized_to_deploy,false);
   assert.equal(json.no_automatic_approval,true);
   assert.equal(json.results.filter(x=>x.estado==='No probado').length,18);
   await page.locator('#UAT-01-estado').selectOption('No probado');
   await page.locator('#import-file').setInputFiles({name:'recuperacion.json',
    mimeType:'application/json',buffer:Buffer.from(JSON.stringify(json))});
   await page.getByText(/Evaluación local recuperada/).waitFor();
   assert.equal(await page.locator('#UAT-01-estado').inputValue(),'Pasa');
   assert.equal(await page.locator('#UAT-02-estado').inputValue(),'Falla');
   assert.match(await page.locator('#counter').innerText(),/1 Pasa, 1 Falla y 18 No probado/);
   const bad={...json,results:json.results.map(x=>({...x}))};
   bad.results[2].estado='Pasa';
   bad.results[2].fecha='';
   await page.locator('#import-file').setInputFiles({name:'invalido.json',
    mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
   await page.getByText(/información incompleta o inválida/).waitFor();
   assert.equal(await page.locator('#UAT-01-estado').inputValue(),'Pasa');
  }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
  assert.equal(outgoing,0);
  assert.deepEqual(errors,[]);
  await ctx.close();
  console.log('PGCE_UAT_HUMAN_FORM_BROWSER_OK '+JSON.stringify({
   cases:20,missing_evidence_blocked:true,import_export:true,
   no_automatic_approval:true,external_requests:0,prod_untouched:true
  }));
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
  await db.close();
 }
}
run().catch(e=>{console.error(e);process.exitCode=1});
