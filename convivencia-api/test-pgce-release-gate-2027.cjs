'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspectRelease,VALIDATIONS}=require('./pgce-release-gate-2027.cjs');
const {catalog}=require('./pgce-uat-evaluacion-local-2027.cjs');
const sha='a'.repeat(40);
const uat=()=>({schema:'mec-pgce-uat-v1',school_year:2027,results:catalog().map(x=>({
 id:x.id,estado:'Pasa',evidencia:'TEST-2027-'+x.id,
 fecha:'2027-04-01',observacion:'Ensayo enteramente sintético'
}))});
const fakeChecks=()=>Object.fromEntries(VALIDATIONS.map(([key])=>[key,{completed:true,evidence_ref:'REF-SINT-'+key.toUpperCase()}]));
test('despliegue del PGCE permanece bloqueado sin evaluaciones y revisiones',()=>{
 const r=inspectRelease({candidateSha:sha});
 assert.equal(r.status,'NOT_READY_FOR_RELEASE');
 assert.equal(r.release_authorized,false);
 assert.equal(r.auto_deploy_permitted,false);
 assert.equal(r.uat.no_probado,20);
 assert.equal(r.completed.backup,false);
 assert.equal(r.completed.legal,false);
 assert.ok(r.issues.some(x=>x.includes('respaldo')||x.includes('Respaldo')));
});
test('ni 20 aprobaciones declaradas ni comprobaciones autocumplidas certifican la publicación',()=>{
 const r=inspectRelease({candidateSha:sha,uat:uat(),validations:fakeChecks(),approvedByHuman:true});
 assert.equal(r.uat.pasa,20);
 assert.equal(r.uat.no_probado,0);
 assert.equal(r.issues.length,0);
 assert.equal(r.status,'REQUIRES_INDEPENDENT_VERIFICATION');
 assert.equal(r.release_authorized,false);
 assert.equal(r.technical_claims_not_verified,true);
 assert.equal(r.auto_deploy_permitted,false);
});
test('rechaza referencias incompletas, sha inválido, incidencias y estados no probados',()=>{
 const items=uat(),v=fakeChecks();
 items.results[3].estado='Falla';
 assert.equal(inspectRelease({uat:items,validations:v,candidateSha:'INVALID',approvedByHuman:true}).status,'NOT_READY_FOR_RELEASE');
 items.results[3].estado='No probado';items.results[3].fecha='';items.results[3].evidencia='';
 v.backup={completed:true,evidence_ref:'bad user input'};
 const r=inspectRelease({uat:items,validations:v,candidateSha:sha,approvedByHuman:true});
 assert.equal(r.uat.no_probado,1);
 assert.equal(r.completed.backup,false);
 assert.ok(r.issues.length>=2);
});
