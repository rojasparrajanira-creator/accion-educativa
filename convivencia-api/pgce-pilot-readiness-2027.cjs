'use strict';
// Lista orientativa del piloto, nunca certificación normativa ni autorización
// de producción. El resultado no sustituye revisión documental humana.
const {inspectPgceDraft}=require('./pgce-preflight-2027.cjs');
const {governanceStatus}=require('./pgce-governance-2027.cjs');
const {reviewStatus}=require('./pgce-export-review-2027.cjs');
const {loadPgceDraft}=require('./pgce-planning-drafts-2027.cjs');
async function assessPilotReadiness(pool,establishmentId){
 if(!Number.isSafeInteger(establishmentId)||establishmentId<=0)
  throw Error('invalid_pilot_scope');
 const saved=await loadPgceDraft(pool,establishmentId);
 const [governance,privacy]=await Promise.all([
  governanceStatus(pool,establishmentId),reviewStatus(pool,establishmentId)
 ]);
 const preflight=saved?inspectPgceDraft(saved.draft):null;
 const items=[
  {code:'draft_saved',label:'Borrador institucional guardado',
   complete:!!saved},
  {code:'editorial_complete',label:'Campos del borrador completos para revisión profesional',
   complete:preflight?.status==='ready_for_human_review'},
  {code:'council_reference',label:'Referencia vigente a la revisión del Consejo Escolar',
   complete:governance.stages.council_review.current===true},
  {code:'direction_reference',label:'Referencia vigente al acto emitido por Dirección',
   complete:governance.stages.direction_act.current===true},
  {code:'privacy_review',label:'Revisión vigente de privacidad antes de exportar',
   complete:privacy.can_export===true}
 ];
 return {school_year:2027,draft_revision:saved?.revision||0,
  status:'manual_review_pending',checks:items,
  completed_checks:items.filter(x=>x.complete).length,total_checks:items.length,
  editorial_pending_count:preflight?.missing.length??null,
  can_publish:false,can_certify_compliance:false,
  disclaimer:'Checklist administrativo orientativo, no validación legal, autorización de publicación ni confirmación de autenticidad documental.'};
}
module.exports={assessPilotReadiness};
