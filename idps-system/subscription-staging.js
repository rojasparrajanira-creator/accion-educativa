'use strict';

// Restricted, free-tier staging boot for the IDPS subscription module.
// This process NEVER connects to the live institution/student database.
const express = require('express');
const crypto = require('node:crypto');
const {Pool} = require('pg');
const registerPaymentPage = require('./monthly-payment');
const registerBilling = require('./subscription-billing');

const STAGING_DB_NAME = 'idps_suscripciones_pruebas_db';
const STAGING_ACCESS_USERNAME = 'idps-pruebas';

function checkStagingConfiguration(env) {
  if(env.NODE_ENV !== 'staging')throw Error('Staging requires NODE_ENV=staging');
  if(env.DATABASE_URL) {
    let url;
    try{url=new URL(env.DATABASE_URL);}catch{throw Error('Invalid staging DATABASE_URL');}
    if(!['postgres:','postgresql:'].includes(url.protocol) ||
       decodeURIComponent(url.pathname.slice(1)) !== STAGING_DB_NAME)
      throw Error('Refusing to connect to a database other than the isolated IDPS test DB');
  }
  if(env.MERCADOPAGO_ACCESS_TOKEN &&
      !/^TEST[-_]/.test(env.MERCADOPAGO_ACCESS_TOKEN))
    throw Error('Refusing production Mercado Pago credentials in staging');
  if(env.IDPS_BILLING_ENABLED === 'true' && !env.MERCADOPAGO_ACCESS_TOKEN)
    throw Error('Billing enabled without a Mercado Pago TEST access token');
}

function constantTimeEqual(a,b) {
  const aa=crypto.createHash('sha256').update(String(a)).digest();
  const bb=crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(aa,bb);
}

function requireStagingLogin(env) {
  return (req,res,next)=>{
    if(req.path === '/health' || req.path === '/webhooks/mercadopago/subscriptions')return next();
    const password=env.STAGING_ACCESS_PASSWORD || '';
    const raw=req.get('authorization') || '';
    let username='',presented='';
    if(raw.startsWith('Basic ') && raw.length<4096){
      try {
        const decoded=Buffer.from(raw.slice(6),'base64').toString('utf8');
        const n=decoded.indexOf(':');
        if(n>=0){username=decoded.slice(0,n);presented=decoded.slice(n+1);}
      }catch{}
    }
    if(!password || !constantTimeEqual(username,STAGING_ACCESS_USERNAME) ||
        !constantTimeEqual(presented,password)){
      res.set('WWW-Authenticate','Basic realm="IDPS Sandbox", charset="UTF-8"');
      return res.status(401).send('Acceso restringido: entorno de prueba');
    }
    return next();
  };
}

const layout=(title,body)=>'<!doctype html><html lang="es"><head><meta charset="utf-8">'+
  '<meta name="viewport" content="width=device-width,initial-scale=1">'+
  '<meta name="robots" content="noindex,nofollow"><title>'+title+'</title>'+
  '<style>body{font:16px system-ui;max-width:740px;margin:35px auto;padding:16px;color:#17324d}'+
  '.card{background:#f3fafc;border:1px solid #b9dce4;border-radius:16px;padding:24px}'+
  'input{padding:10px;max-width:100%}.btn{padding:10px 16px;background:#1e7fbc;color:white;border-radius:8px}'+
  '.notice{background:#fff4d6;padding:14px}</style></head><body>'+
  '<strong>IDPS · ENTORNO AISLADO DE PRUEBAS</strong><hr>'+body+
  '<p>Sin estudiantes, encuestas ni establecimientos reales.</p></body></html>';

function createApp(env=process.env){
  checkStagingConfiguration(env);
  const app=express();
  const pool=env.DATABASE_URL?new Pool({
    connectionString:env.DATABASE_URL,
    ssl:{rejectUnauthorized:false},
    max:2,
    connectionTimeoutMillis:6000,
    idleTimeoutMillis:10000
  }):null;
  app.disable('x-powered-by');
  app.use(express.urlencoded({extended:false,limit:'12kb'}));
  app.use(express.json({limit:'64kb'}));
  app.use(requireStagingLogin(env));
  app.use((_req,res,next)=>{res.set('Cache-Control','no-store');res.set('X-Robots-Tag','noindex, nofollow');next();});
  app.get('/health',async(_req,res)=>{
    let connected=false;
    if(pool){
      try{await pool.query('SELECT 1');connected=true;}catch{}
    }
    res.json({ok:true,environment:'staging',plan:'free',databaseConfigured:Boolean(pool),
      databaseConnected:connected,paymentsEnabled:registerBilling.ready(),
      productionTokensBlocked:true,containsRealStudentData:false});
  });
  app.get('/',(_req,res)=>res.send(layout('Pruebas de suscripciones IDPS',
    '<section class="card"><h1>Prueba aislada de suscripciones</h1>'+
    '<p>El sistema público IDPS no está conectado a esta página.</p>'+
    '<p>El pago queda inhabilitado hasta que se completen todas las verificaciones con credenciales de prueba.</p>'+
    '<a href="/pago-mensual">Ver estado del checkout de prueba</a></section>')));
  registerPaymentPage(app,{layout});
  let initBilling=null;
  if(pool){initBilling=registerBilling(app,{pool,layout});}
  const start=async()=>{
    if(pool){
      await pool.query(
        'CREATE TABLE IF NOT EXISTS idps_establishments ('+
        'id uuid PRIMARY KEY,rbd_norm text UNIQUE NOT NULL,email text NOT NULL,'+
        "status text NOT NULL DEFAULT 'active',expires_at timestamptz)");
      await initBilling();
    }
    return app;
  };
  return {app,pool,start};
}

if(require.main===module){
  const {app,start}=createApp(process.env);
  start().then(()=>app.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>
    console.log('IDPS subscription STAGING listening. Live charges disabled by default.')))
  .catch(error=>{console.error('IDPS staging startup failed:',error.message);process.exit(1);});
}
module.exports={createApp,checkStagingConfiguration,requireStagingLogin};
