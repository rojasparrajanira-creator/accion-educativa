'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const express=require('express');
const {PGlite}=require('@electric-sql/pglite');
const {createCohortGate}=require('./pgce-cohort-gate-2027.cjs');
const {registerCommunitySurveys}=require('./community-surveys');

test('en Render no basta activar flag: sin cohorte todos los establecimientos son denegados',()=>{
 for(const env of [{NODE_ENV:'production'},{RENDER_SERVICE_ID:'srv-test'},{RENDER:'true'}]){
  const empty=createCohortGate(env);
  assert.equal(empty.production,true);
  assert.equal(empty.cohortSize,0);
  assert.equal(empty.permits(1),false);
  assert.equal(empty.permits(9999),false);
 }
 const active=createCohortGate({NODE_ENV:'production',MEC_PGCE_PILOT_ESTABLISHMENT_IDS:'22,35,INVALID,0,35,-8'});
 assert.equal(active.cohortSize,2);
 assert.equal(active.permits(22),true);
 assert.equal(active.permits(35),true);
 assert.equal(active.permits(36),false);
 assert.equal(active.permits(null),false);
 const local=createCohortGate({NODE_ENV:'test'});
 assert.equal(local.permits(1),true);
 assert.equal(local.permits(2),true);
 assert.equal(local.permits('no-id'),false);
});

test('HTTP real del módulo deniega administradores fuera de cohorte Render y default vacío',async()=>{
 const db=new PGlite();let server=null;
 const orig={flag:process.env.MEC_COMMUNITY_SURVEYS_ENABLED,render:process.env.RENDER_SERVICE_ID,
  cohort:process.env.MEC_PGCE_PILOT_ESTABLISHMENT_IDS};
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'community-surveys.sql'),'utf8'));
  const est=(await db.query(
   "INSERT INTO establishments(name,rbd) VALUES('Escuela de laboratorio A','COHORT-A'),('Escuela de laboratorio B','COHORT-B') RETURNING id"
  )).rows.map(x=>Number(x.id));
  process.env.MEC_COMMUNITY_SURVEYS_ENABLED='1';
  process.env.RENDER_SERVICE_ID='srv-synthetic-only';
  process.env.MEC_PGCE_PILOT_ESTABLISHMENT_IDS=String(est[0]);
  const app=express();app.use(express.json());
  const requireRole=(...roles)=>[(req,res,next)=>{
   const role='coordinador_convivencia';
   if(!roles.includes(role))return res.status(403).json({ok:false});
   const id=req.headers['x-demo-school']==='B'?est[1]:est[0];
   req.auth={id:1,establishment_id:id,canonical_role:role};next();
  }];
  const pool={query:(...args)=>db.query(...args),
   connect:async()=>({query:(...args)=>db.query(...args),release(){}})};
  const allowedOrigins=new Set();
  assert.equal(registerCommunitySurveys({app,pool,requireRole,
   rateLimit:()=>((req,res,next)=>next()),
   accessStatus:async()=>true,allowedOrigins}),true);
  server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  allowedOrigins.add(origin);
  const call=async(school)=>{
   const response=await fetch(origin+'/api/community-surveys/pgce-pilot-checklist?school_year=2027',{
    headers:{'x-demo-school':school}});
   return {status:response.status,body:await response.json()};
  };
  const a=await call('A');
  assert.equal(a.status,200);
  const b=await call('B');
  assert.equal(b.status,403);
  assert.equal(b.body.error,'pgce_pilot_cohort_forbidden');
  assert.equal(JSON.stringify(b.body).includes('COHORT-A'),false);
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  await db.close();
  for(const [key,name] of [['flag','MEC_COMMUNITY_SURVEYS_ENABLED'],
    ['render','RENDER_SERVICE_ID'],['cohort','MEC_PGCE_PILOT_ESTABLISHMENT_IDS']]){
   if(orig[key]===undefined)delete process.env[name];else process.env[name]=orig[key];
  }
 }
});
