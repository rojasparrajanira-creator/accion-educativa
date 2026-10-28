'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function load(){
 const root={dataset:{reportReady:'false'},style:{visibility:'visible'},innerText:'Informe real de prueba\nEstudiante ficticio\nResultados'};
 const buttons=[{disabled:true,title:''},{disabled:true,title:''}];
 const status={textContent:''};let printCalls=0,downloads=0,alerts=[],contents=[];
 const documentEvents=new Map(),windowEvents=new Map();let reloadCalls=0;
 const anchor={href:'',download:'',click(){downloads++},remove(){}};
 const doc={
  querySelector(q){return q==='.report'?root:null},
  querySelectorAll(q){return q==='[data-report-action]'?buttons:[]},
  getElementById(q){return q==='report-export-status'?status:null},
  createElement(q){assert.equal(q,'a');return anchor},
  addEventListener(name,handler){documentEvents.set(name,handler)},
  body:{appendChild(){}},title:'Informe prueba'
 };
 const window={print(){printCalls++},addEventListener(name,handler){windowEvents.set(name,handler)},location:{reload(){reloadCalls++}}};
 class FakeBlob{constructor(items,options){contents.push(items.join(''));this.type=options.type}}
 const context={window,document:doc,Blob:FakeBlob,alert:s=>alerts.push(s),
  URL:{createObjectURL(){return 'blob:fake'},revokeObjectURL(){}},
  setTimeout(fn){fn()},Date,Math,Number,String};
 const script=fs.readFileSync(path.join(__dirname,'../convivencia-escolar/js/report-export.js'),'utf8');
 vm.runInNewContext(script,context,{filename:'report-export.js'});
 return {exporter:window.MECReportExport,root,buttons,status,events:{documentEvents,windowEvents},metrics:()=>({printCalls,downloads,alerts,contents,reloadCalls})};
}
test('bloquea Word y PDF con informe cargando o inaccesible',()=>{
 const p=load();
 assert.equal(p.exporter.download({filename:'informe-individual'}),false);
 assert.equal(p.exporter.print(),false);
 assert.equal(p.metrics().downloads,0);
 assert.equal(p.metrics().printCalls,0);
 assert.equal(p.metrics().alerts.length,2);
 p.exporter.setReady(false);
 assert.equal(p.buttons.every(b=>b.disabled),true);
 assert.equal(p.root.dataset.reportReady,'false');
});
test('habilita Word y PDF solo tras resultados confirmados',()=>{
 const p=load();p.exporter.setReady(true);
 assert.equal(p.buttons.every(b=>!b.disabled),true);
 assert.equal(p.root.dataset.reportReady,'true');
 assert.equal(p.exporter.download({filename:'informe-curso'}),true);
 assert.equal(p.exporter.print(),true);
 assert.equal(p.metrics().downloads,1);
 assert.equal(p.metrics().printCalls,1);
 assert.match(p.metrics().contents[0],/\\rtf1/);
 assert.match(p.metrics().contents[0],/Estudiante ficticio/);
 assert.match(p.status.textContent,/Informe listo/);
 p.exporter.setReady(false);
 assert.equal(p.exporter.download(),false);
 assert.equal(p.metrics().downloads,1);
});
test('todas las vistas de informe inician con exportación y PDF bloqueados',()=>{
 for(const file of ['informe-individual.html','informe-curso.html','informe-institucional.html']){
  const html=fs.readFileSync(path.join(__dirname,'../convivencia-escolar',file),'utf8');
  assert.match(html,/<article class="report" data-report-ready="false">/);
  assert.match(html,/data-report-action disabled onclick="MECReportExport\.print\(\)"/);
  assert.match(html,/data-report-action disabled onclick="MECReportExport\.download\(/);
  assert.match(html,/@media print\{\.report\[data-report-ready="false"\]\{display:none!important\}/);
 }
});


test('protege informes sensibles al navegar hacia atrás tras salir de la página',()=>{
 const p=load();
 assert.equal(typeof p.events.documentEvents.get('DOMContentLoaded'),'function');
 p.events.documentEvents.get('DOMContentLoaded')();
 assert.equal(typeof p.events.windowEvents.get('pagehide'),'function');
 assert.equal(typeof p.events.windowEvents.get('pageshow'),'function');
 p.exporter.setReady(true);
 p.events.windowEvents.get('pagehide')();
 assert.equal(p.root.dataset.reportReady,'false');
 assert.equal(p.root.style.visibility,'hidden');
 assert.equal(p.buttons.every(b=>b.disabled),true);
 p.events.windowEvents.get('pageshow')({persisted:false});
 assert.equal(p.metrics().reloadCalls,0);
 p.events.windowEvents.get('pageshow')({persisted:true});
 assert.equal(p.metrics().reloadCalls,1);
});
test('los tres informes esperan autenticación validada antes de consultar resultados',()=>{
 for(const file of ['informe-individual.html','informe-curso.html','informe-institucional.html']){
  const html=fs.readFileSync(path.join(__dirname,'../convivencia-escolar',file),'utf8');
  assert.match(html,/<script src="js\/auth-professional\.js"><\/script><script>window\.MECReportAccess=MECAuth\.guard\(\);<\/script>/);
  assert.match(html,/<meta name="referrer" content="no-referrer">/);
  assert.doesNotMatch(html,/<script>MECAuth\.guard\(\);<\/script>/);
  if(file==='informe-individual.html')assert.match(html,/MECReportAccess\.then\(\(\)=>cargarInforme\(\)\)/);
  if(file==='informe-curso.html')assert.match(html,/MECReportAccess\.then\(\(\)=>cargarCurso\(\)\)/);
 }
 const js=fs.readFileSync(path.join(__dirname,'../convivencia-escolar/js/informe-institucional-api.js'),'utf8');
 assert.match(js,/MECReportAccess\.then\(\(\)=>MECInstitution\.load\(\)\)/);
});

test('asignación, diagnóstico y plan no consultan datos antes de validar la sesión',()=>{
 const root=path.join(__dirname,'../convivencia-escolar');
 const assignment=fs.readFileSync(path.join(root,'asignar-encuestas.html'),'utf8');
 const assignmentJs=fs.readFileSync(path.join(root,'js/asignacion-api.js'),'utf8');
 const diagnostic=fs.readFileSync(path.join(root,'diagnostico.html'),'utf8');
 const plan=fs.readFileSync(path.join(root,'plan-gestion.html'),'utf8');
 assert.match(assignment,/window\.MECAssignmentAccess=MECAuth\.guard\(\)/);
 assert.match(assignmentJs,/MECAssignmentAccess\.then\(\(\)=>window\.MECAssign\.init\(\)\)/);
 assert.match(diagnostic,/window\.MECDiagnosticAccess=MECAuth\.guard\(\)/);
 assert.match(diagnostic,/await window\.MECDiagnosticAccess/);
 assert.match(plan,/window\.MECPlanAccess=MECAuth\.guard\(\)/);
 assert.match(plan,/window\.MECPlanAccess\.then\(\(\)=>load\(\)\)/);
 for(const html of [assignment,diagnostic,plan])assert.doesNotMatch(html,/<script>MECAuth\.guard\(\);<\/script>/);
});
