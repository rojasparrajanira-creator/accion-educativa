'use strict';
// Verifica menú institucional en Chromium con API sintética local; sin Render.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {chromium}=require('playwright');
async function run(){
 const html=fs.readFileSync(path.join(__dirname,'../convivencia-escolar/inicio.html'),'utf8');
 const app=express();let allow=false,requests=0;
 app.get('/inicio.html',(req,res)=>res.type('html').send(html));
 app.get('/js/auth-professional.js',(req,res)=>res.type('js').send(
  "window.MECAuth={API:'',guard:()=>{},logout:()=>{}};"));
 app.get('/api/community-surveys/pgce-pilot-checklist',(req,res)=>{
  requests++;
  if(!allow)return res.status(403).json({ok:false,error:'pgce_pilot_cohort_forbidden'});
  res.json({ok:true,checks:[],can_publish:false,can_certify_compliance:false});
 });
 app.get('*',(req,res)=>res.json({ok:false}));
 const server=app.listen(0,'127.0.0.1');let browser;
 try{
  await new Promise(resolve=>server.once('listening',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  let outside=0;
  await ctx.route('**/*',route=>{
   if(route.request().url().startsWith(origin+'/'))return route.continue();
   outside++;return route.abort('blockedbyclient');
  });
  const page=await ctx.newPage();
  await page.goto(origin+'/inicio.html?establishment_id=1',{waitUntil:'networkidle'});
  const card=page.locator('#pgce-2027-card'),nav=page.locator('#pgce-2027-nav');
  const surveysCard=page.locator('#pgce-2027-surveys-card'),
    surveysNav=page.locator('#pgce-2027-surveys-nav');
  assert.equal(await card.count(),1);
  assert.equal(await nav.count(),1);
  assert.equal(await card.isVisible(),false);
  assert.equal(await nav.isVisible(),false);
  assert.equal(await surveysCard.isVisible(),false);
  assert.equal(await surveysNav.isVisible(),false);
  assert.equal(await surveysCard.getAttribute('href'),'gestionar-encuestas-estamentos-2027.html');
  assert.equal(await card.getAttribute('href'),'diagnostico-dimensiones-pgce-2027.html');
  allow=true;
  await page.goto(origin+'/inicio.html?establishment_id=1',{waitUntil:'networkidle'});
  await card.waitFor({state:'visible'});
  await surveysCard.waitFor({state:'visible'});
  // En 390px el aside queda oculto por diseño, aunque los permisos sean correctos.
  // Se verifica que el atributo hidden sea retirado; la navegación móvil usa las tarjetas.
  await assert.equal(await nav.getAttribute('hidden'),null);
  await assert.equal(await surveysNav.getAttribute('hidden'),null);
  assert.equal(await nav.isVisible(),false);
  assert.equal(await surveysNav.isVisible(),false);
  assert.equal(await card.getAttribute('hidden'),null);
  assert.equal(await surveysCard.getAttribute('hidden'),null);
  assert.ok(requests>=2);
  assert.equal(outside,0);
  await ctx.close();
  console.log('PGCE_PILOT_NAVIGATION_OK hidden for rejected cohort; visible only on authorized API; zero external requests');
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
run().catch(err=>{console.error(err);process.exitCode=1});
