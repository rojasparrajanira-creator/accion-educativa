'use strict';
// Laboratorio aislado: recorridos UAT-16 y UAT-18 con teclado y zoom de navegador.
// Pruebas técnicas parciales: NO sustituyen usuario con lector de pantalla o móvil físico.
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
  for(const width of [320,390]){
   const ctx=await browser.newContext({viewport:{width,height:844}});
   let external=0;
   await ctx.route('**/*',route=>{
    if(route.request().url().startsWith(origin+'/'))return route.continue();
    external++;return route.abort('blockedbyclient');
   });
   const page=await ctx.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(origin+'/?perfil=coordinacion');
   // El primer control de la pantalla se puede alcanzar y operar solo con teclado.
   await page.keyboard.press('Tab');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'measurement');
   await page.keyboard.press('Tab');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'load');
   await page.keyboard.press('Enter');
   await page.locator('#body').waitFor({state:'visible'});
   assert.equal(await page.locator('main#body').count(),1);
   await page.getByText(/0 de 5 antecedentes registrados/).waitFor();
   // Los campos agregados cuentan con etiqueta vinculada y botón con nombre específico.
   await page.locator('#add-source').focus();
   await page.keyboard.press('Enter');
   await page.locator('#add-participation').focus();
   await page.keyboard.press('Enter');
   const labels=await page.evaluate(()=>{
    const ids=['diagnostic_sources-0-audience','participation-0-audience'];
    return ids.map(id=>{
     const control=document.getElementById(id);
     return {id,exists:!!control,labels:control?[...control.labels].map(x=>x.textContent):[]};
    });
   });
   assert.ok(labels.every(x=>x.exists&&x.labels.some(label=>/Estamento o fuente/.test(label))));
   assert.equal(await page.getByRole('button',{name:'Quitar fuente 1'}).count(),1);
   assert.equal(await page.getByRole('button',{name:'Quitar participación 1'}).count(),1);
   // Eliminar con teclado no activa acciones de otra sección.
   await page.getByRole('button',{name:'Quitar fuente 1'}).focus();
   await page.keyboard.press('Enter');
   assert.equal(await page.locator('#diagnostic-sources-editor .review-row').count(),0);
   assert.equal(await page.locator('#participation-editor .review-row').count(),1);
   // Zoom visual de 200 %, combinado con ancho móvil; controles deben ser accesibles.
   await page.evaluate(()=>{document.documentElement.style.zoom='2'});
   for(const id of ['#measurement','#load','#save-draft','#governance-ref','#save-governance']){
    const control=page.locator(id);
    await control.scrollIntoViewIfNeeded();
    const box=await control.boundingBox();
    assert.ok(box&&box.width>0&&box.height>0,'hidden or zero-sized control '+id);
    assert.ok(box.x>=-2&&box.x+box.width<=width+2,
     'control clipped at '+width+'px zoom 200%: '+id+' '+JSON.stringify(box));
   }
   assert.equal(external,0);
   assert.deepEqual(errors,[]);
   await ctx.close();
  }
  console.log('PGCE_UAT_ACCESSIBILITY_TECHNICAL_OK keyboard focus/activation; dynamic labels; button names; 200-percent browser zoom; 320px and 390px viewport; no external calls.');
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
  await db.close();
 }
}
run().catch(e=>{console.error(e);process.exitCode=1});
