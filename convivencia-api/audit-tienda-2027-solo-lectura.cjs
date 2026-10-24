'use strict';
// Auditoría read-only. Nunca crea pedidos, preferencias, pagos, accesos ni correos.
const API='https://convivencia-escolar-api.onrender.com';
const SITE='https://materialeducativochile.cl';
const slug='plan-de-gestion-de-convivencia-educativa-2027';
async function get(url){
 const response=await fetch(url,{method:'GET',redirect:'follow',signal:AbortSignal.timeout(30000),
  headers:{Accept:'application/json, text/html;q=0.9','User-Agent':'Material-Educativo-Chile-ReadOnly-Verification/1.0'}});
 const raw=await response.text();
 let body={};
 try{body=JSON.parse(raw)}catch{body={}};
 return {status:response.status,body,text:raw.slice(0,600),finalHost:new URL(response.url).hostname};
}
(async()=>{
 let bad=false;
 async function safe(label,url,fn){
  try{const r=await get(url);fn(r);}
  catch(e){bad=true;console.log(label,JSON.stringify({ok:false,error:String(e?.cause?.code||e?.name||'request_failed')}));}
 }
 await safe('CHECKOUT',API+'/api/store/checkout/config',r=>{
  const d=r.body;
  const result={http:r.status,ok:d.ok===true,provider:d.provider||null,mode:d.mode||null,configured:d.configured===true,
   checkout_ready:d.checkout_ready===true,checkout_status:d.checkout_status||null};
  console.log('CHECKOUT',JSON.stringify(result));
  if(r.status!==200||!result.checkout_ready||result.provider!=='mercadopago'||result.mode!=='production')bad=true;
 });
 await safe('PRODUCT',API+'/api/store/products',r=>{
  const list=Array.isArray(r.body.products)?r.body.products:[];
  const p=list.find(x=>String(x.slug)===slug);
  const result={http:r.status,ok:r.body.ok===true,public_count:list.length,found:!!p,
   slug:p?.slug||null,title:p?.title||null,price_clp:p?.price_clp??null,
   compare_at_price_clp:p?.compare_at_price_clp??null};
  console.log('PRODUCT',JSON.stringify(result));
  if(r.status!==200||!p||Number(p.price_clp)!==8990)bad=true;
 });
 await safe('PAGE',SITE+'/tienda.html?producto='+encodeURIComponent(slug)+'#catalogo',r=>{
  const result={http:r.status,final_host:r.finalHost,html:r.text.toLowerCase().includes('<!doctype html')};
  console.log('PAGE',JSON.stringify(result));
  if(r.status!==200||!result.html)bad=true;
 });
 console.log('READ_ONLY_AUDIT',bad?'ISSUES_FOUND':'PUBLIC_CHECKS_PASSED');
 if(bad)process.exitCode=1;
})().catch(e=>{console.error('AUDIT_EXCEPTION',e.name);process.exitCode=1});
