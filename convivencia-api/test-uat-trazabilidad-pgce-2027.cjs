'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildReport,parseActa}=require('./uat-trazabilidad-pgce-2027.cjs');

test('trazabilidad cubre exactamente los 20 UAT del acta sin inventar resultados humanos',()=>{
 const report=buildReport({sha:'a'.repeat(40),runId:'40000012345'});
 assert.equal(parseActa().length,20);
 assert.equal(report.cases.length,20);
 assert.deepEqual(report.cases.map(c=>c.id),Array.from({length:20},(_,i)=>'UAT-'+String(i+1).padStart(2,'0')));
 assert.equal(Object.values(report.counts).reduce((a,b)=>a+b,0),20);
 assert.equal(report.cases.every(x=>x.estado_humano==='NO EVALUADO'&&x.aceptado_por_profesional===false),true);
 assert.equal(report.human_accepted,0);
 assert.equal(report.can_deploy,false);
 assert.equal(report.can_approve_pilot,false);
 assert.match(report.markdown,/NO es aceptación humana/);
 assert.match(report.markdown,/0 de 20/);
 assert.match(report.markdown,/40000012345/);
 assert.ok(!report.markdown.includes('UAT aprobado'));
 assert.deepEqual(report.cases.filter(x=>x.cobertura==='manual').map(x=>x.id),['UAT-17','UAT-20']);
});

test('el reporte no reutiliza referencias de ejecución GitHub inválidas ni presenta aprobación legal',()=>{
 const report=buildReport({sha:'NO SHA',runId:'https://externo.example/suspicious'});
 assert.equal(report.sha,'sin SHA confirmado');
 assert.equal(report.run,'sin enlace de ejecución identificado');
 assert.match(report.markdown,/NO EVALUADO/);
 assert.match(report.markdown,/no fusionar ni desplegar/i);
 assert.equal(report.cases.find(x=>x.id==='UAT-18').cobertura,'parcial');
 assert.equal(report.cases.find(x=>x.id==='UAT-16').cobertura,'parcial');
});
