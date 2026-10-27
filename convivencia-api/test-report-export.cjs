'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function load(){
 const root={dataset:{reportReady:'false'},innerText:'Informe real de prueba\nEstudiante ficticio\nResultados'};
 const buttons=[{disabled:true,title:''},{disabled:true,title:''}];
 const status={textContent:''};let printCalls=0,downloads=0,alerts=[],contents=[];
 const anchor={href:'',download:'',click(){downloads++},remove(){}};
 const doc={
  querySelector(q){return q==='.report'?root:null},
  querySelectorAll(q){return q==='[data-report-action]'?buttons:[]},
  getElementById(q){return q==='report-export-status'?status:null},
  createElement(q){assert.equal(q,'a');return anchor},
  body:{appendChild(){}},title:'Informe prueba'
 };
 const window={print(){printCalls++}};
 class FakeBlob{constructor(items,options){contents.push(items.join(''));this.type=options.type}}
 const context={window,document:doc,Blob:FakeBlob,alert:s=>alerts.push(s),
  URL:{createObjectURL(){return 'blob:fake'},revokeObjectURL(){}},
  setTimeout(fn){fn()},Date,Math,Number,String};
 const script=fs.readFileSync(path.join(__dirname,'../convivencia-escolar/js/report-export.js'),'utf8');
 vm.runInNewContext(script,context,{filename:'report-export.js'});
 return {exporter:window.MECReportExport,root,buttons,status,metrics:()=>({printCalls,downloads,alerts,contents})};
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
