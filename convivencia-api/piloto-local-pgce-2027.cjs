'use strict';
/*
 * Piloto de Convivencia Educativa 2027 completamente aislado.
 * NO utiliza Render, Postgres productivo, sesiones reales, cobros ni correos.
 * Acceso solo por loopback y usuarios sintéticos. Los datos viven en RAM.
 */
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {registerCommunitySurveys}=require('./community-surveys');
const {renderPage:renderUatReview}=require('./pgce-uat-evaluacion-local-2027.cjs');

const SOURCE=path.join(__dirname,'../convivencia-escolar/diagnostico-dimensiones-pgce-2027.html');
const REMOTE="const API='https://convivencia-escolar-api.onrender.com'";
const profiles=[
 ['coordinacion','LAB-2027-A','coordinador_convivencia'],
 ['directora','LAB-2027-A','directora'],
 ['profesor','LAB-2027-A','profesor'],
 ['otra-escuela','LAB-2027-B','coordinador_convivencia']
];
const banner='<aside role="note" style="position:sticky;top:0;z-index:999999;padding:12px 18px;'+
 'background:#0b3664;color:#fff;font:600 14px Arial;text-align:center">'+
 'PILOTO LOCAL · DATOS FICTICIOS · SIN CONEXIÓN A PRODUCCIÓN · NO USAR DATOS REALES</aside>';

async function createLocalPilot(){
 if(process.env.NODE_ENV==='production'||process.env.DATABASE_URL||
    process.env.RENDER==='true'||process.env.RENDER_SERVICE_ID)
  throw Error('piloto_local_entorno_productivo_prohibido');
 const original=fs.readFileSync(SOURCE,'utf8');
 if(!original.includes(REMOTE))throw Error('endpoint_produccion_no_identificado');
 const page=original.replace(REMOTE,"const API=''");
 if(page.includes('https://convivencia-escolar-api.onrender.com'))
  throw Error('endpoint_productivo_en_pagina');
 if(!/<body(?:\s[^>]*)?>/i.test(page))throw Error('html_sin_body');
 const safeHtml=page.replace(/<body(?:\s[^>]*)?>/i,x=>x+banner);
 const db=new PGlite();
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'community-surveys.sql'),'utf8'));
  const schools=(await db.query(
   "INSERT INTO establishments(name,rbd) VALUES('Escuela sintética A','LAB-2027-A'),('Escuela sintética B','LAB-2027-B') RETURNING id"
  )).rows;
  const schoolByCode=new Map([['LAB-2027-A',Number(schools[0].id)],
   ['LAB-2027-B',Number(schools[1].id)]]);
  const sessions=Object.create(null);
  for(const [key,school,role] of profiles){
   const establishmentId=schoolByCode.get(school);
   const user=(await db.query(
    'INSERT INTO users(establishment_id,email,name,role) VALUES($1,$2,$3,$4) RETURNING id',
    [establishmentId,key+'@test.invalid','Persona ficticia '+key,role]
   )).rows[0];
   sessions[key]={id:Number(user.id),establishment_id:establishmentId,role};
  }
  for(const school of schools){
   const establishmentId=Number(school.id);
   const course=(await db.query(
    "INSERT INTO courses(establishment_id,name,school_year) VALUES($1,'7° A',2027) RETURNING id",
    [establishmentId])).rows[0];
   await db.query("INSERT INTO students(establishment_id,course_id,rut,name) VALUES($1,$2,$3,$4)",
    [establishmentId,course.id,'FICTICIO-'+establishmentId,'Estudiante sintético']);
  }
  const app=express();
  app.disable('x-powered-by');
  app.use((req,res,next)=>{
   res.setHeader('Cache-Control','no-store');
   res.setHeader('X-Robots-Tag','noindex, nofollow');
   res.setHeader('X-Content-Type-Options','nosniff');
   res.setHeader('Referrer-Policy','no-referrer');
   res.setHeader('Content-Security-Policy',
    "default-src 'none'; connect-src 'self'; script-src 'self' 'unsafe-inline';"+
    " style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;"+
    " frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
   next();
  });
  app.use(express.json({limit:'128kb'}));
  const cookieFor=req=>{
   const match=String(req.headers.cookie||'').match(/(?:^|;\s*)pgce_piloto_ficticio=([a-z-]+)/);
   return sessions[match?.[1]]||null;
  };
  const requireRole=(...roles)=>[(req,res,next)=>{
   const actor=cookieFor(req);
   if(!actor||!roles.includes(actor.role))
    return res.status(403).json({ok:false,error:'role_forbidden'});
   req.auth={id:actor.id,establishment_id:actor.establishment_id,
    canonical_role:actor.role};
   next();
  }];
  const allowedOrigins=new Set();
  const pool={query:(...args)=>db.query(...args),
   connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
  // Opt-in en proceso local únicamente; nunca se cambia el entorno global del usuario.
  const originalFlag=process.env.MEC_COMMUNITY_SURVEYS_ENABLED;
  process.env.MEC_COMMUNITY_SURVEYS_ENABLED='1';
  try{
   if(!registerCommunitySurveys({app,pool,requireRole,
     rateLimit:()=>((req,res,next)=>next()),accessStatus:async()=>true,allowedOrigins}))
     throw Error('modulo_de_piloto_no_inicializado');
  }finally{
   if(originalFlag===undefined)delete process.env.MEC_COMMUNITY_SURVEYS_ENABLED;
   else process.env.MEC_COMMUNITY_SURVEYS_ENABLED=originalFlag;
  }
  app.get('/',(req,res)=>{
   const profile=String(req.query.perfil||'');
   if(!Object.hasOwn(sessions,profile))
    return res.status(403).type('text').send('Usa un perfil ficticio permitido: coordinacion, directora, profesor, otra-escuela.');
   res.setHeader('Set-Cookie','pgce_piloto_ficticio='+profile+
    '; Path=/; HttpOnly; SameSite=Strict');
   res.type('html').send(safeHtml);
  });
  app.get('/piloto/uat',(req,res)=>{
   // El panel nunca almacena evaluaciones en el servidor. Cada persona puede
   // descargar y reimportar su propio JSON para continuar posteriormente.
   if(!cookieFor(req))return res.status(403).type('text')
    .send('Selecciona antes un perfil ficticio desde la página principal.');
   res.type('html').send(renderUatReview());
  });
  app.get('/piloto/salud',(req,res)=>res.json({ok:true,mode:'local_synthetic_only',
   production_connected:false,school_count:2}));
  return {app,db,allowedOrigins,profiles:profiles.map(p=>p[0])};
 }catch(e){await db.close();throw e}
}
async function main(){
 if(process.env.PGCE_PILOT_LOCAL!=='1')
  throw Error('activa_PGCE_PILOT_LOCAL_1_para_ejecutar');
 const p=Number(process.env.PGCE_PILOT_PORT||4173);
 if(!Number.isSafeInteger(p)||p<1024||p>65535)throw Error('puerto_piloto_invalido');
 const {app,db,allowedOrigins,profiles:keys}=await createLocalPilot();
 const server=app.listen(p,'127.0.0.1');
 server.on('error',async e=>{console.error('PILOTO ERROR',e.code);await db.close();process.exitCode=1});
 await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
 const base='http://127.0.0.1:'+server.address().port;
 allowedOrigins.add(base);
 console.log('PILOTO_PGCE_2027_LOCAL '+base+'/?perfil=coordinacion');
 console.log('Perfiles ficticios: '+keys.join(', '));
 console.log('Datos temporales. Ctrl+C detiene el piloto. NO compartir por Internet.');
 process.once('SIGINT',()=>server.close(async()=>{await db.close();process.exit(0)}));
}
if(require.main===module)main().catch(e=>{console.error('PILOTO ERROR',e.message);process.exitCode=1});
module.exports={createLocalPilot};
