'use strict';
// Render staging EXCLUSIVO: autenticación real por HTTP con datos ficticios y PGlite temporal.
// Prohibido utilizar DATABASE_URL o credenciales del entorno comercial; no iniciar con datos reales.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {createRequire}=require('node:module');
const {PGlite}=require('@electric-sql/pglite');
const express=require('express');

if(process.env.DATABASE_URL && process.env.DATABASE_URL!=='pglite://aislado'){
  throw new Error('STAGING_ABORTED: la prueba no acepta conexiones a bases externas');
}
const prohibited=Object.keys(process.env).filter(key=>
 /^(?:MEC_STORE_|MEC_MERCADOPAGO_|MEC_SUBSCRIPTION_|MEC_CONTACT_|MEC_PLATFORM_ADMIN_|MEC_GOOGLE_|MEC_WEBPAY_)/.test(key)
 && process.env[key] && !(['MEC_STORE_DELIVERY_ENABLED','MEC_STORE_PAYMENT_PROVIDER','MEC_WEBPAY_MODE'].includes(key))
);
if(prohibited.length)throw new Error('STAGING_ABORTED: credenciales comerciales no permitidas');
process.env.DATABASE_URL='pglite://aislado';
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

const db=new PGlite();
const pool={
 async query(sql,params){
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{held:true}],rowCount:1};
  if(sql.includes('pg_advisory_unlock'))return {rows:[],rowCount:0};
  if(!params&&sql.split(';').length>3){await db.exec(sql);return {rows:[],rowCount:0}}
  const r=await db.query(sql,params);
  return {rows:r.rows,rowCount:r.rows.length||r.affectedRows||0};
 },
 async connect(){return {...this,release(){}}}
};
function isolatedExpress(...args){
 const app=express(...args);
 app.use((req,res,next)=>{
   // La prueba se ejecuta dentro de Render por localhost; nadie debe usar esta API públicamente.
   const ip=String(req.socket.remoteAddress||'');
   if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(ip)){
     res.setHeader('Cache-Control','no-store');
     return res.status(404).end();
   }
   next();
 });
 return app;
}
Object.assign(isolatedExpress,express);
const modulePath=path.join(__dirname,'server.js');
const realRequire=createRequire(modulePath);
function isolatedRequire(name){
 if(name==='pg')return {Pool:class{constructor(){return pool}}};
 if(name==='express')return isolatedExpress;
 return realRequire(name);
}
console.log('CONVIVENCIA_STAGING_ISOLATED: PGlite temporal; comercio y correo deshabilitados; sólo localhost');
vm.runInNewContext(fs.readFileSync(modulePath,'utf8'),{
  require:isolatedRequire,__dirname,console,process,Buffer,URL,URLSearchParams,
  Intl,fetch,FormData,Blob,setTimeout,setInterval,clearInterval,clearTimeout,AbortSignal
},{filename:'server.js'});
