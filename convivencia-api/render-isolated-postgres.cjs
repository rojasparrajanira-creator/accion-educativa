'use strict';
// Aceptación autenticada de Convivencia en PostgreSQL 18 real, pero TEMPORAL y local.
// Se bloquea cualquier API pública y toda integración comercial.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {createRequire}=require('node:module');
const express=require('express');
const expected='postgres://postgres@127.0.0.1:5432/postgres';
if(process.env.DATABASE_URL!==expected){
  throw new Error('STAGING_ABORTED: prohibida cualquier base ajena al contenedor');
}
const prohibited=Object.keys(process.env).filter(k=>
  /^(MEC_STORE_|MEC_MERCADOPAGO_|MEC_SUBSCRIPTION_|MEC_CONTACT_|MEC_PLATFORM_ADMIN_|MEC_GOOGLE_)/.test(k)
  && process.env[k] && k!=='MEC_STAGING_ONLY'
);
if(prohibited.length)throw new Error('STAGING_ABORTED: no se aceptan credenciales comerciales');
process.env.MEC_ENABLE_PILOT='true';
process.env.RUN_PILOT_SELFTEST='1';
process.env.MEC_PILOT_TEST_KEY=crypto.randomBytes(48).toString('hex');
process.env.MEC_STORE_DELIVERY_ENABLED='0';
process.env.MEC_STORE_PAYMENT_PROVIDER='webpay';
process.env.MEC_WEBPAY_MODE='integration';
process.env.MEC_MERCADOPAGO_CHECKOUT_ENABLED='0';
process.env.RUN_WEBPAY_SELFTEST='0';
process.env.MEC_ONECLICK_MODE='integration';
process.env.MEC_SUBSCRIPTION_USE_STORE_EMAIL='0';
process.env.TZ='America/Santiago';
function localOnlyExpress(...args){
 const app=express(...args);
 app.use((req,res,next)=>{
   const remote=String(req.socket.remoteAddress||'');
   if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)){
     res.setHeader('Cache-Control','no-store');
     return res.status(404).end();
   }
   next();
 });
 return app;
}
Object.assign(localOnlyExpress,express);
const file=path.join(__dirname,'server.js'),realRequire=createRequire(file);
console.log('CONVIVENCIA_POSTGRES_ISOLATED: PostgreSQL 18 localhost, datos temporales, sin credenciales comerciales');
vm.runInNewContext(fs.readFileSync(file,'utf8'),{
  require:name=>name==='express'?localOnlyExpress:realRequire(name),
  __dirname,console,process,Buffer,URL,URLSearchParams,Intl,fetch,
  FormData,Blob,AbortSignal,setTimeout,setInterval,clearTimeout,clearInterval
},{filename:'server.js'});
