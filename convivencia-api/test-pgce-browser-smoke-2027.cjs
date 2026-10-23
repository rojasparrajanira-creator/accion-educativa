'use strict';
// Prueba de navegador aislada: nunca consulta Render ni datos reales.
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,firefox,webkit}=require('playwright');
const AxeBuilder=require('@axe-core/playwright').default;
const PGCE=require('./pgce-dimensions-integrated-2027.cjs');
const html=fs.readFileSync(path.join(__dirname,'../convivencia-escolar/diagnostico-dimensiones-pgce-2027.html'),'utf8')
 .replace("const API='https://convivencia-escolar-api.onrender.com'","const API=''");
if(!html.includes("const API=''"))throw Error('smoke_must_not_contact_production');
const makeReport=()=>{const r=PGCE.buildDimensionReport();r.student_measurement_code='M1';return r};
let currentDraft=null,revision=0,privacyReviewed=false,saveCalls=0,governanceRecords=[];
function reply(res,status,data,contentType='application/json'){
 res.writeHead(status,{'Content-Type':contentType,'Cache-Control':'no-store'});
 res.end(contentType==='application/json'?JSON.stringify(data):data);
}
function mockHandler(req,res){
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname==='/'){return reply(res,200,html,'text/html; charset=utf-8')}
 if(pathname==='/api/community-surveys/pgce-scaffold'){
  const dimensions=makeReport();
  const plan=PGCE.buildPgceScaffold(dimensions);
  if(currentDraft)plan.draft=currentDraft;
  plan.saved_revision=revision;plan.saved_at=null;
  return reply(res,200,{ok:true,dimensions,plan});
 }
 if(pathname==='/api/community-surveys/pgce-followup')return reply(res,200,{ok:true,records:[]});
 if(pathname==='/api/community-surveys/pgce-pilot-checklist'&&req.method==='GET'){
  const checks=[
   {code:'draft_saved',label:'Borrador institucional guardado',complete:revision>0},
   {code:'editorial_complete',label:'Campos completos para revisión',complete:false},
   {code:'council_reference',label:'Referencia de Consejo Escolar',complete:governanceRecords.some(x=>x.stage==='council_review'&&x.revision===revision)},
   {code:'direction_reference',label:'Referencia de Dirección',complete:false},
   {code:'privacy_review',label:'Revisión vigente de privacidad',complete:privacyReviewed}
  ];
  return reply(res,200,{ok:true,school_year:2027,status:'manual_review_pending',
   checks,completed_checks:checks.filter(x=>x.complete).length,total_checks:5,
   can_publish:false,can_certify_compliance:false});
 }
 if(pathname==='/api/community-surveys/pgce-governance'&&req.method==='GET'){
  const stages={};
  for(const stage of ['council_review','direction_act']){
   const entry=governanceRecords.find(x=>x.stage===stage&&x.revision===revision);
   stages[stage]={current:!!entry,status:entry?'document_reference_current':'not_recorded',
    document_ref:entry?.document_ref||null};
  }
  return reply(res,200,{ok:true,draft_revision:revision,stages,can_publish:false});
 }
 if(pathname==='/api/community-surveys/pgce-export-review'&&req.method==='GET'){
  return reply(res,200,{ok:true,can_export:privacyReviewed,initialized:revision>0,
   status:revision?'privacy_review_required':'save_draft_first',
   draft_revision:revision,followup_fingerprint:'a'.repeat(64)});
 }
 if(pathname==='/api/community-surveys/pgce-export'&&req.method==='GET'){
  if(!privacyReviewed)return reply(res,409,{ok:false,error:'pgce_export_review_required'});
  return reply(res,200,'\ufeff"Prueba";"PGCE 2027"\r\n',
   'text/csv; charset=utf-8');
 }
 if(req.method==='PUT'&&(pathname==='/api/community-surveys/pgce-draft'||
  pathname==='/api/community-surveys/pgce-export-review'||
  pathname==='/api/community-surveys/pgce-governance')){
  const chunks=[];
  req.on('data',x=>chunks.push(x));
  req.on('end',()=>{
   const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(pathname.endsWith('pgce-draft')){
    if(body.expected_revision!==revision)return reply(res,409,{ok:false});
    revision++;currentDraft=body.draft;privacyReviewed=false;saveCalls++;
    return reply(res,200,{ok:true,saved_revision:revision,preflight:{missing:[]}});
   }
   if(pathname.endsWith('pgce-governance')){
    if(body.expected_revision!==revision||!revision||
     body.record?.confirmation!==true||body.record?.stage!=='council_review')
     return reply(res,409,{ok:false});
    governanceRecords.push({...body.record,revision});
    return reply(res,200,{ok:true,recorded:true,status:'document_reference_recorded_unverified'});
   }
   if(body.confirmation!==true||body.draft_revision!==revision||!revision)
    return reply(res,409,{ok:false});
   privacyReviewed=true;
   return reply(res,200,{ok:true,can_export:true,institutional_approval:false});
  });return;
 }
 return reply(res,404,{ok:false,error:'unknown_fixture'});
}
async function run(){
 const server=http.createServer(mockHandler);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port;
 let browser;
 try{
  for(const [browserName,engine] of Object.entries({chromium,firefox,webkit})){
   browser=await engine.launch(browserName==='chromium'
    ?{headless:true,args:['--no-sandbox']}:{headless:true});
   for(const viewport of [{width:390,height:844},{width:768,height:1024}]){
   // Each viewport uses its own synthetic empty establishment state.
   currentDraft=null;revision=0;privacyReviewed=false;governanceRecords=[];
   const context=await browser.newContext({viewport,acceptDownloads:true});
   const page=await context.newPage();
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'load'});
   await page.locator('#load').click();
   await page.locator('#body').waitFor({state:'visible'});
   await page.getByText(/0 de 5 antecedentes registrados/).waitFor();
   assert.match(await page.locator('#pilot-summary').innerText(),/0 de 5/);
   assert.equal(await page.locator('#pilot-checks li').count(),5);
   // Automated WCAG A/AA checks on the loaded pilot editor. The axe rules
   // supplement, rather than replace, keyboard and assistive-device reviews.
   const accessibility=await new AxeBuilder({page})
    .withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])
    .analyze();
   assert.deepEqual(accessibility.violations.map(v=>({id:v.id,impact:v.impact,
    nodes:v.nodes.map(n=>n.target)})),[],
    'Accessibility issues detected at '+viewport.width+'px');
   const measures=await page.evaluate(()=>({
    contentWidth:document.documentElement.scrollWidth,
    viewportWidth:document.documentElement.clientWidth,
    culprits:[...document.querySelectorAll('body *')].filter(e=>{
     const r=e.getBoundingClientRect();
     return r.right>document.documentElement.clientWidth+3||r.left< -3;
    }).slice(0,8).map(e=>({tag:e.tagName,id:e.id,
     cls:String(e.className).slice(0,80),right:Math.round(e.getBoundingClientRect().right)}))
   }));
   assert.ok(measures.contentWidth<=measures.viewportWidth+2,
    'Horizontal overflow '+JSON.stringify({browserName,viewport,measures}));
   await page.locator('#new-action-clause').selectOption('c');
   await page.locator('#add-action').click();
   assert.equal(await page.locator('#action-clause').inputValue(),'ACT-c-002');
   await page.locator('#edit-title').fill('Acción institucional ficticia');
   await page.locator('#finding-dimension').selectOption('SEG');
   await page.locator('#finding-need').fill('Necesidad colectiva de convivencia');
   await page.locator('#finding-evidence').fill('ACTA-PRUEBA-2027');
   await page.locator('#add-finding').click();
   assert.ok(await page.locator('#findings-list').getByText('Necesidad institucional').count());
   await page.locator('#save-draft').click();
   await page.getByText(/Borrador guardado: revisión/).waitFor();
   await page.locator('#refresh-pilot').click();
   await page.getByText(/1 de 5 antecedentes registrados/).waitFor();
   assert.match(await page.locator('#pilot-summary').innerText(),/1 de 5/);
   await page.locator('#governance-stage').selectOption('council_review');
   await page.locator('#governance-ref').fill('ACTA-CE-2027-01');
   await page.locator('#governance-date').fill('2027-05-01');
   await page.locator('#governance-confirm').check();
   await page.locator('#save-governance').click();
   await page.getByText(/Referencia registrada para el borrador/).waitFor();
   assert.match(await page.locator('#governance-list').innerText(),/ACTA-CE-2027-01/);
   assert.equal(await page.locator('#privacy-confirm').isChecked(),false);
   await page.locator('#download-csv').click();
   await page.getByText(/Debes registrar una revisión vigente de privacidad/).waitFor();
   await page.locator('#privacy-confirm').check();
   await page.locator('#review-export').click();
   await page.getByText(/Revisión registrada/).waitFor();
   const downloadPromise=page.waitForEvent('download');
   await page.locator('#download-csv').click();
   const download=await downloadPromise;
   assert.match(download.suggestedFilename(),/convivencia-pgce-2027-M1-borrador\.csv/);
   // Keyboard focus must be visible on institutional controls.
   await page.locator('#governance-ref').focus();
   const focus=await page.evaluate(()=>{
    const node=document.activeElement;
    const style=getComputedStyle(node);
    return {id:node.id,outlineStyle:style.outlineStyle,outlineWidth:style.outlineWidth};
   });
   assert.equal(focus.id,'governance-ref');
   assert.notEqual(focus.outlineStyle,'none');
   assert.notEqual(focus.outlineWidth,'0px');
   assert.deepEqual(errors,[],'Browser JavaScript errors: '+errors.join(', '));
   await context.close();
   }
   await browser.close();
   browser=null;
  }
  assert.equal(saveCalls,6);
  console.log('PGCE 2027 browser smoke OK: Chromium, Firefox and WebKit; 390px and 768px; keyboard focus, axe WCAG A/AA, pilot, edit/save, Council, privacy and CSV.');
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
run().catch(e=>{console.error(e);process.exitCode=1});
