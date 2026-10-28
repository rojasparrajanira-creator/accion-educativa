'use strict';
// Prueba real de Chromium: páginas locales + API ficticia, sin llamar a producción.
// No usa credenciales, estudiantes, tienda, pagos, correo ni base de datos.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {PDFDocument} from 'pdf-lib';

const WEB=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../convivencia-escolar');
const apiOrigin='https://convivencia-escolar-api.onrender.com';
const files={'html':'text/html; charset=utf-8','js':'text/javascript; charset=utf-8','css':'text/css; charset=utf-8','svg':'image/svg+xml'};
function server(){
  return http.createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const file=path.resolve(WEB,'.'+decodeURIComponent(pathname));
    if(!file.startsWith(WEB+path.sep)){res.writeHead(403);res.end();return}
    try{
      const data=await fs.readFile(file);
      const ext=path.extname(file).slice(1);
      res.writeHead(200,{'Content-Type':files[ext]||'application/octet-stream','Cache-Control':'no-store'});
      res.end(data);
    }catch(e){res.writeHead(404);res.end('Not found')}
  });
}
const mockSetup=({authenticated,groupSmall=false,role='coordinador_convivencia',subscriptionActive=true})=>({
  authenticated,groupSmall,role,subscriptionActive,
  school:'Escuela Ficticia para Pruebas',student:'Estudiante Simulado',
  applicationId:123,courseId:51,establishmentId:45,measurementId:90
});
async function mockApi(page,options,events){
  // Bloquea cualquier petición HTTPS real, incluso si cambia una pantalla.
  await page.route('https://**/*',route=>route.abort('blockedbyclient'));
  await page.exposeFunction('mecTestRecord',path=>events.push(path));
  await page.addInitScript(({origin,options})=>{
    const realFetch=window.fetch.bind(window);
    window.fetch=async(input,init)=>{
      const url=new URL(typeof input==='string'?input:input.url,location.href);
      if(url.origin!==origin)return realFetch(input,init);
      await window.mecTestRecord(url.pathname);
      await new Promise(resolve=>setTimeout(resolve,280));
      let status=200,body;
      if(url.pathname==='/api/auth/me'){
        if(options.authenticated){
          body={ok:true,user:{id:7,role:options.role,name:'Profesional de Prueba',
            establishment:options.school,establishment_id:options.establishmentId,
            subscription_active:options.subscriptionActive,must_change_password:false}};
        }else {status=401;body={ok:false,error:'authentication_required'}}
      }else if(!options.authenticated){
        status=401;body={ok:false,error:'authentication_required'};
      }else if(url.pathname==='/api/applications/123/results'){
        body={ok:true,application:{student:options.student,course:'7° A',measurement:'M1',
          establishment:options.school,school_year:2026,survey_level:'7-8'},
          dimension_summary:{D01:{average:4,answered:2},D02:{average:4,answered:2}},
          block_summary:{},professional_review_signals:[],interpretation_note:'Revisión ficticia para ensayo de interfaz.'};
      }else if(url.pathname==='/api/applications/123/review'){
        body={ok:true,review:{status:'reviewed',reviewed_by_name:'Profesional de Prueba'}};
      }else if(url.pathname==='/api/courses/51/results'){
        body={ok:true,course:{name:'7° A',establishment:options.school,rbd:'',school_year:2026},
          measurement:{code:'M1'},completed_students:options.groupSmall?2:10,
          applications:options.groupSmall?2:10,note:'Datos totalmente sintéticos.',
          suppressed:options.groupSmall,minimum_group_size:5,
          dimension_summary:options.groupSmall?{}:{D01:{average:4,answered:10}}};
      }else if(url.pathname==='/api/establishments/45/results'){
        body={ok:true,establishment:{name:options.school,rbd:''},courses:1,
          completed_students:10,applications:10,measurement:{code:'M1',school_year:2026},
          suppressed:false,dimension_summary:{D01:{average:4,answered:10}}};
      }else {status=404;body={ok:false,error:'not_in_fixture'}}
      return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
    };
  },{origin:apiOrigin,options});
}

async function run(){
  const local=server();
  await new Promise(resolve=>local.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+local.address().port;
  const browser=await chromium.launch({headless:true});
  const screenshots=path.resolve('artifacts/informes-convivencia');
  await fs.mkdir(screenshots,{recursive:true});
  let passed=0;
  try{
    const cases=[
      {file:'informe-individual.html',params:'application_id=123&establishment_id=45',expected:'Estudiante Simulado'},
      {file:'informe-curso.html',params:'course_id=51&measurement_id=90&school_year=2026&establishment_id=45',expected:'Escuela Ficticia'},
      {file:'informe-institucional.html',params:'establishment_id=45&measurement_id=90&school_year=2026',expected:'Escuela Ficticia'}
    ];
    for(const info of cases){
      const ctx=await browser.newContext({acceptDownloads:true});
      const page=await ctx.newPage(), events=[];
      page.on('dialog',dialog=>dialog.dismiss());
      await mockApi(page,mockSetup({authenticated:true}),events);
      await page.goto(origin+'/'+info.file+'?'+info.params,{waitUntil:'domcontentloaded'});
      assert.equal(await page.locator('[data-report-action]').count(),2);
      await page.locator('.report[data-report-ready="true"]').waitFor({timeout:12000});
      assert.equal(await page.locator('[data-report-action]:disabled').count(),0);
      const content=await page.locator('.report').innerText();
      assert.ok(content.includes(info.expected),info.file+' sin datos ficticios');
      assert.ok(!content.includes('Cargando resultados reales'),info.file+' exportaría marcador de carga');
      await page.evaluate(()=>{window.__testPrintCalls=0;window.print=()=>window.__testPrintCalls++});
      await page.getByRole('button',{name:/Imprimir|guardar como PDF/}).click();
      assert.equal(await page.evaluate(()=>window.__testPrintCalls),1,info.file+' no invocó imprimir');
      const downloadPromise=page.waitForEvent('download');
      await page.getByRole('button',{name:/Descargar para Word/}).click();
      const download=await downloadPromise;
      assert.match(download.suggestedFilename(),/\.rtf$/);
      const rtf=await fs.readFile(await download.path(),'utf8');
      assert.match(rtf,/^\{\\rtf1/);
      assert.ok(rtf.includes(info.expected.replace(/á|í/g,''))||rtf.includes(info.expected.split(' ')[0]),
        info.file+' no contiene texto esperado en Word');
      assert.ok(events.includes('/api/auth/me'),info.file+' no validó sesión');
      assert.ok(events.some(x=>x.includes('/results')),info.file+' no consultó resultados');
      // A diferencia de interceptar window.print, aquí Chromium produce un PDF real.
      const pdfPath=path.join(screenshots,info.file+'.pdf');
      const pdfBytes=await page.pdf({path:pdfPath,format:'A4',printBackground:true});
      assert.ok(pdfBytes.length>4500,info.file+' produjo PDF vacío o incompleto');
      assert.equal(Buffer.from(pdfBytes).subarray(0,5).toString('ascii'),'%PDF-',info.file+' PDF no válido');
      const pdf=await PDFDocument.load(pdfBytes);
      assert.ok(pdf.getPageCount()>=1,info.file+' PDF sin páginas');
      await page.screenshot({path:path.join(screenshots,info.file+'.png'),fullPage:true});
      await ctx.close();
      console.log('NAVEGADOR_CONVIVENCIA_OK '+info.file+' · sesión, pantalla, Word y PDF real ('+pdf.getPageCount()+' página(s))');
      passed++;
    }

    // Sesión sin autenticar: debe redirigir al ingreso sin consultar resultados.
    {
      const ctx=await browser.newContext(),page=await ctx.newPage(),events=[];
      await mockApi(page,mockSetup({authenticated:false}),events);
      await page.goto(origin+'/informe-individual.html?application_id=123&establishment_id=45');
      await page.waitForURL('**/ingreso.html?next=*',{timeout:12000});
      assert.deepEqual(events.filter(p=>p.includes('/results')),[],
        'Una sesión anónima consultó resultados sensibles');
      await ctx.close();
      console.log('NAVEGADOR_CONVIVENCIA_OK anónimo redirigido sin resultados');
      passed++;
    }

    // Los perfiles fuera del módulo y las suscripciones vencidas no deben consultar resultados.
    for(const scenario of [
      {name:'rol no autorizado',opts:{authenticated:true,role:'asistente_educacion'},redirect:'**/notificaciones.html*'},
      {name:'suscripción vencida',opts:{authenticated:true,subscriptionActive:false},redirect:'**/cuenta-vencida.html*'}
    ]){
      const ctx=await browser.newContext(),page=await ctx.newPage(),events=[];
      await mockApi(page,mockSetup(scenario.opts),events);
      await page.goto(origin+'/informe-individual.html?application_id=123&establishment_id=45');
      await page.waitForURL(scenario.redirect,{timeout:12000});
      assert.deepEqual(events.filter(p=>p.includes('/results')),[],
        scenario.name+' consultó resultados escolares antes de bloquear el acceso');
      await ctx.close();
      console.log('NAVEGADOR_CONVIVENCIA_OK '+scenario.name+' sin fuga de resultados');
      passed++;
    }
    // Privacidad en grupos pequeños: documento descargable con supresión y sin promedios.
    {
      const ctx=await browser.newContext({acceptDownloads:true}),page=await ctx.newPage(),events=[];
      await mockApi(page,mockSetup({authenticated:true,groupSmall:true}),events);
      await page.goto(origin+'/informe-curso.html?course_id=51&measurement_id=90&school_year=2026&establishment_id=45');
      await page.locator('.report[data-report-ready="true"]').waitFor({timeout:12000});
      const text=await page.locator('.report').innerText();
      assert.match(text,/protegidos por privacidad/);
      assert.doesNotMatch(text,/promedio descriptivo 4/);
      await ctx.close();
      console.log('NAVEGADOR_CONVIVENCIA_OK supresión de grupos pequeños');
      passed++;
    }
    // Vista celular para detectar desbordes que dificultan leer informes en móviles.
    for(const info of cases){
      const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true});
      const page=await ctx.newPage(),events=[];
      await mockApi(page,mockSetup({authenticated:true}),events);
      await page.goto(origin+'/'+info.file+'?'+info.params,{waitUntil:'domcontentloaded'});
      await page.locator('.report[data-report-ready="true"]').waitFor({timeout:12000});
      const geometry=await page.evaluate(()=>({
        viewportWidth:document.documentElement.clientWidth,
        documentWidth:document.documentElement.scrollWidth
      }));
      assert.ok(geometry.documentWidth<=geometry.viewportWidth+3,
        info.file+' presenta scroll horizontal en celular: '+JSON.stringify(geometry));
      assert.ok((await page.locator('.report').innerText()).includes(info.expected),
        info.file+' no muestra resultados en celular');
      await page.screenshot({path:path.join(screenshots,info.file+'-movil.png'),fullPage:true});
      await ctx.close();
      console.log('NAVEGADOR_CONVIVENCIA_OK '+info.file+' · visualización celular sin desborde');
      passed++;
    }
    // Recorrido de navegación protegido: no consultar matrículas ni PGCE sin sesión.
    for(const file of ['asignar-encuestas.html','diagnostico.html','plan-gestion.html']){
      const ctx=await browser.newContext(),page=await ctx.newPage(),events=[];
      await mockApi(page,mockSetup({authenticated:false}),events);
      await page.goto(origin+'/'+file+'?establishment_id=45',{waitUntil:'domcontentloaded'});
      await page.waitForURL('**/ingreso.html?next=*',{timeout:12000});
      assert.equal(events.filter(x=>x!=='/api/auth/me').length,0,
        file+' consultó antecedentes escolares antes de autenticar: '+events.join(','));
      await ctx.close();
      console.log('NAVEGADOR_CONVIVENCIA_OK '+file+' bloquea consultas anónimas');
      passed++;
    }
    console.log('BROWSER_REPORTS_PASSED '+passed+' controles · datos ficticios, PDF real y móvil');
  }finally{
    await browser.close();
    await new Promise(resolve=>local.close(resolve));
  }
}
run().catch(err=>{console.error('BROWSER_REPORTS_FAILED:',err.stack||err);process.exitCode=1});
