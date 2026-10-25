'use strict';
// Formulario HUMANO de evaluación en localhost; no guarda contenido en el servidor,
// no recopila datos personales, ni autentica actas o habilita producción.
const {parseActa}=require('./uat-trazabilidad-pgce-2027.cjs');
const CASE_IDS=Array.from({length:20},(_,i)=>'UAT-'+String(i+1).padStart(2,'0'));
const STATUSES=new Set(['No probado','Pasa','Falla']);
const EVIDENCE_RE=/^[A-Za-z0-9_.\/-]{0,80}$/;
function catalog(){
 const data=parseActa();
 if(data.length!==20||data.map(x=>x.id).join('|')!==CASE_IDS.join('|'))
  throw Error('catalogo_uat_2027_incompleto');
 return data.map(x=>({id:x.id,descripcion:x.description}));
}
function validateReview(doc){
 const cases=catalog();
 if(!doc||doc.schema!=='mec-pgce-uat-v1'||doc.school_year!==2027||
  !Array.isArray(doc.results)||doc.results.length!==20)throw Error('uat_entrada_invalida');
 const entries=[];
 for(let i=0;i<cases.length;i++){
  const item=doc.results[i];
  if(!item||typeof item!=='object'||Array.isArray(item)||
    item.id!==cases[i].id||!STATUSES.has(item.estado)||
    typeof item.evidencia!=='string'||!EVIDENCE_RE.test(item.evidencia)||
    typeof item.observacion!=='string'||item.observacion.length>360||
    typeof item.fecha!=='string'||(item.fecha!==''&&!/^20\d\d-\d\d-\d\d$/.test(item.fecha)))
   throw Error('uat_resultados_invalidos');
  if(item.estado!=='No probado'&&(!item.evidencia||!item.fecha))
   throw Error('uat_resultado_sin_fecha_o_evidencia');
  entries.push({id:item.id,estado:item.estado,evidencia:item.evidencia,
   observacion:item.observacion,fecha:item.fecha});
 }
 return {
  schema:'mec-pgce-uat-v1',school_year:2027,
  resultado:'REGISTRO DE EVALUACION HUMANA - SIN CERTIFICACION',
  no_automatic_approval:true,authorized_to_deploy:false,
  results:entries
 };
}
function renderPage(){
 const items=catalog();
 const json=JSON.stringify(items).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
 return `<!doctype html>
<html lang="es-CL"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>Evaluación UAT 2027 — Material Educativo Chile</title>
<style>
:root{font-family:Inter,system-ui,-apple-system,sans-serif;color:#183650;background:#f1f8fc}
*{box-sizing:border-box}body{margin:0}main{max-width:1100px;padding:18px;margin:auto}
header,section{background:#fff;border:1px solid #c9e5ef;border-radius:16px;padding:20px;margin:12px 0}
header{border-top:7px solid #0c81cb}h1{font-size:clamp(25px,4vw,35px);margin:8px 0}
h2{font-size:19px;margin:0 0 8px}p{line-height:1.5}p.note{color:#294c67}
.notice{background:#eaf7fc;border-left:4px solid #0c81cb;padding:12px 15px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
label{display:block;font-weight:650;margin:8px 0 5px}
input,select,textarea{font:inherit;width:100%;max-width:100%;padding:10px;border:1px solid #7894ab;border-radius:8px;background:white}
textarea{min-height:72px;resize:vertical}
button{font:inherit;border:0;border-radius:10px;background:#1459bd;color:white;padding:11px 14px;min-height:44px;cursor:pointer}
button.secondary{color:#124c70;background:#dbf0f8}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #087f94;outline-offset:2px}
article{padding:16px 0;border-top:1px solid #e1eaf0}
article h3{font-size:16px;margin:4px 0;color:#13539d}
.actions{display:flex;gap:10px;flex-wrap:wrap}
.stat{font-weight:650}#message{min-height:28px;color:#6d2a2a;font-weight:700}
small{color:#4a6273}
@media(max-width:600px){.grid{grid-template-columns:1fr}main{padding:8px}header,section{padding:15px}}
@media print{button,#import-label,#import-file{display:none!important}main{max-width:none}article{break-inside:avoid}}
</style></head><body><main>
<header>
 <p><strong>Material Educativo Chile · Laboratorio aislado</strong></p>
 <h1>Evaluación profesional del piloto 2027</h1>
 <p class="notice">Pauta de 20 casos. Este formulario no verifica identidades, actas ni cumplimiento normativo.
 No publica resultados ni habilita Render. No incluir nombres, RUN, expedientes ni datos reales.</p>
 <p>Los registros se mantienen <strong>solo en esta pestaña</strong>. Descarga el archivo JSON para conservar tu evaluación.
 La descarga no significa aprobación institucional.</p>
 <p id="counter" role="status" aria-live="polite">20 casos no probados.</p>
 <div class="actions">
  <button id="download" type="button">Descargar evaluación JSON</button>
  <button id="print" type="button" class="secondary">Imprimir pauta</button>
  <button id="reset" type="button" class="secondary">Limpiar respuestas</button>
 </div>
 <label id="import-label" for="import-file">Recuperar evaluación JSON guardada en este computador (opcional)</label>
 <input id="import-file" type="file" accept="application/json,.json">
 <p id="message" role="alert" aria-live="assertive"></p>
</header>
<section aria-labelledby="cases-heading">
 <h2 id="cases-heading">Verificaciones individuales</h2>
 <p class="note">Para registrar Pasa o Falla, indica fecha y una referencia <strong>ficticia</strong> de evidencia.
 No se aceptan casos como Pasa automáticamente; el resultado debe establecerlo la persona que realiza la prueba.</p>
 <div id="cases"></div>
</section>
<footer><small>PGCE 2027 — Evaluación manual sin certificación ni autorización de despliegue.</small></footer>
</main>
<script>
'use strict';
const CASES=${json};
const DEFAULT='No probado';
const items=Object.fromEntries(CASES.map(x=>[x.id,{id:x.id,estado:DEFAULT,evidencia:'',observacion:'',fecha:''}]));
const root=document.getElementById('cases'),msg=document.getElementById('message');
const make=(tag,attributes,text)=>{const e=document.createElement(tag);
 for(const [k,v] of Object.entries(attributes||{}))e.setAttribute(k,v);
 if(text!==undefined)e.textContent=text;
 return e;};
function draw(){
 root.replaceChildren();
 for(const c of CASES){
  const data=items[c.id],a=make('article',{'aria-labelledby':'heading-'+c.id});
  a.append(make('h3',{id:'heading-'+c.id},c.id),
   make('p',{},c.descripcion));
  const grid=make('div',{class:'grid'});
  const fields=[
   {label:'Resultado',type:'select',key:'estado',options:['No probado','Pasa','Falla']},
   {label:'Fecha de comprobación',type:'date',key:'fecha'},
   {label:'Referencia ficticia de evidencia (sin datos personales)',type:'text',key:'evidencia',maxlength:'80'},
   {label:'Observación sin identificadores reales',type:'textarea',key:'observacion',maxlength:'360'}
  ];
  for(const f of fields){
   const wrap=make('div',{}),id=c.id+'-'+f.key;
   wrap.append(make('label',{for:id},f.label));
   const ctl=make(f.type==='textarea'?'textarea':f.type==='select'?'select':'input',{id});
   if(f.type==='select'){
    for(const option of f.options){
     const element=make('option',{value:option},option);ctl.append(element);
    }
   }else if(f.type==='date'){ctl.type='date';}
   else if(f.type==='text'){ctl.type='text';}
   if(f.maxlength)ctl.maxLength=Number(f.maxlength);
   ctl.value=data[f.key];
   ctl.addEventListener('input',()=>{
    items[c.id][f.key]=ctl.value;updateCounter();msg.textContent='';
   });
   ctl.addEventListener('change',()=>{
    items[c.id][f.key]=ctl.value;updateCounter();msg.textContent='';
   });
   wrap.append(ctl);grid.append(wrap);
  }
  a.append(grid);root.append(a);
 }
 updateCounter();
}
function updateCounter(){
 const values=Object.values(items);
 const p=values.filter(v=>v.estado==='Pasa').length,
       f=values.filter(v=>v.estado==='Falla').length,
       n=values.filter(v=>v.estado===DEFAULT).length;
 document.getElementById('counter').textContent=
  'Registrados: '+p+' Pasa, '+f+' Falla y '+n+' No probado. Registro manual, sin certificación.';
}
function documentData(){
 const entries=CASES.map(c=>items[c.id]);
 for(const item of entries){
  if(!/^[A-Za-z0-9_.\\/-]{0,80}$/.test(item.evidencia)||
    item.observacion.length>360){
   throw Error('Usa únicamente referencias ficticias sin espacios ni datos personales ('+item.id+').');
  }
  if(item.estado!==DEFAULT&&(!item.fecha||!item.evidencia))
   throw Error(item.id+' necesita fecha y evidencia ficticia antes de descargar.');
 }
 return {schema:'mec-pgce-uat-v1',school_year:2027,
  resultado:'REGISTRO DE EVALUACION HUMANA - SIN CERTIFICACION',
  no_automatic_approval:true,authorized_to_deploy:false,
  exported_at:new Date().toISOString(),
  results:entries.map(x=>({...x}))};
}
document.getElementById('download').addEventListener('click',()=>{
 try{
  const data=documentData();
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const u=URL.createObjectURL(blob);
  const a=make('a',{href:u,download:'PGCE-2027-Evaluacion-UAT-SIN-CERTIFICACION.json'});
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(u),1000);
  msg.style.color='#126052';msg.textContent='Archivo de evaluación generado. No equivale a aprobación institucional.';
 }catch(e){msg.style.color='#922d2d';msg.textContent=e.message;}
});
document.getElementById('print').addEventListener('click',()=>window.print());
document.getElementById('reset').addEventListener('click',()=>{
 if(!window.confirm('¿Limpiar todas las respuestas de esta pestaña? Descarga antes si deseas conservarlas.'))return;
 for(const item of Object.values(items))Object.assign(item,{estado:DEFAULT,evidencia:'',observacion:'',fecha:''});
 draw();msg.textContent='Pauta reiniciada localmente.';
});
document.getElementById('import-file').addEventListener('change',async ev=>{
 try{
  const file=ev.target.files?.[0];
  if(!file)return;
  if(file.size>32000)throw Error('El archivo supera el límite de 32 KB.');
  const raw=JSON.parse(await file.text());
  if(raw.schema!=='mec-pgce-uat-v1'||raw.school_year!==2027||
    !Array.isArray(raw.results)||raw.results.length!==20)
   throw Error('Formato de evaluación incompatible.');
  for(let i=0;i<CASES.length;i++){
   const v=raw.results[i];
   if(!v||v.id!==CASES[i].id||!['No probado','Pasa','Falla'].includes(v.estado)||
    typeof v.fecha!=='string'||!/^$|^20\\d\\d-\\d\\d-\\d\\d$/.test(v.fecha)||
    typeof v.evidencia!=='string'||!/^[A-Za-z0-9_.\\/-]{0,80}$/.test(v.evidencia)||
    typeof v.observacion!=='string'||v.observacion.length>360||
    (v.estado!==DEFAULT&&(!v.evidencia||!v.fecha)))
    throw Error('El archivo contiene información incompleta o inválida: '+CASES[i].id);
  }
  for(const v of raw.results)Object.assign(items[v.id],{
   estado:v.estado,fecha:v.fecha,evidencia:v.evidencia,observacion:v.observacion});
  draw();
  msg.style.color='#126052';msg.textContent='Evaluación local recuperada. Revisa sus resultados antes de continuar.';
 }catch(e){msg.style.color='#922d2d';msg.textContent=e.message;}
 ev.target.value='';
});
draw();
</script></body></html>`;
}
module.exports={catalog,renderPage,validateReview};
