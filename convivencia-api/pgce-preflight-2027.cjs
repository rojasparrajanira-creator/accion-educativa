'use strict';
/* PREVALIDADOR EDITORIAL DE BORRADORES 2027.
 * No determina cumplimiento legal; no autoriza publicación ni aprobación.
 * No usa información de menores: recibe únicamente registros descriptivos
 * y referencias documentales autorizadas, sin RUN, nombres de estudiantes.
 */
const CLAUSES=Object.freeze(['a','b','c','d','e','f','g']);
const AUDIENCES=Object.freeze(['estudiantes','familia','docente','asistente','directivo']);
const isText=v=>typeof v==='string'&&v.trim().length>0;
const isDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T12:00:00'));
const hasRef=v=>Array.isArray(v)&&v.some(isText);
const filled=(obj,keys)=>keys.filter(key=>!isText(obj?.[key]));
const safeList=x=>Array.isArray(x)?x:[];
const uniq=x=>[...new Set(x)];

/**
 * @returns {{status:'draft_incomplete'|'ready_for_human_review',
 *  missing:string[], warnings:string[], coverage:{...}, disclaimer:string}}
 */
function inspectPgceDraft(plan){
 const p=plan&&typeof plan==='object'&&!Array.isArray(plan)?plan:{};
 const missing=[],warnings=[];
 const metadata=filled(p,['establishment_name','rbd','director','responsible','version']);
 for(const k of metadata)missing.push('ficha.'+k);
 if(p.school_year!==2027)missing.push('ficha.school_year_2027');

 const findings=safeList(p.findings);
 if(!findings.length)missing.push('diagnostico.hallazgos');
 const ids=new Set();
 for(const [i,f] of findings.entries()){
   if(!isText(f?.id)||ids.has(f.id))missing.push('diagnostico.hallazgo_id_'+(i+1));
   if(isText(f?.id))ids.add(f.id);
   if(!isText(f?.need))missing.push('diagnostico.necesidad_'+(i+1));
   if(!hasRef(f?.evidence_refs))missing.push('diagnostico.fuente_'+(i+1));
 }
 const sources=safeList(p.diagnostic_sources);
 const evidencedAudiences=new Set(sources.filter(x=>isText(x?.evidence_ref)&&isText(x?.method)).map(x=>x.audience));
 const missingAudiences=AUDIENCES.filter(x=>!evidencedAudiences.has(x));
 if(missingAudiences.length)warnings.push('Fuentes del diagnóstico por reforzar: '+missingAudiences.join(', ')+'. Pueden usarse entrevistas, actas, observación y registros, no necesariamente solo encuestas.');
 // Calidad del diagnóstico: el indicador de cobertura de fuentes no equivale a obligación de encuestar individualmente a cada persona.
 if(!sources.some(x=>x?.audience==='institutional_records'&&isText(x.evidence_ref)))warnings.push('Conviene triangular resultados de encuestas con registros y datos de contexto institucional.');

 const actions=safeList(p.actions);
 if(!actions.length)missing.push('plan.acciones');
 const covered=new Set();
 const requiredActionFields=['title','objective','strategy','responsible','indicator','baseline','target','place','resources','expected_evidence'];
 for(const [i,a] of actions.entries()){
   const prefix='plan.accion_'+(i+1);
   if(CLAUSES.includes(a?.clause))covered.add(a.clause);
   else missing.push(prefix+'.clausula_16D');
   for(const k of filled(a,requiredActionFields))missing.push(prefix+'.'+k);
   if(!isDate(a?.start_date)||!isDate(a?.end_date)||a.start_date>a.end_date)missing.push(prefix+'.plazo_valido');
   if(!Array.isArray(a?.finding_ids)||!a.finding_ids.length||a.finding_ids.some(id=>!ids.has(id)))missing.push(prefix+'.hallazgo_vinculado');
 }
 for(const c of CLAUSES)if(!covered.has(c))missing.push('plan.contenido_minimo_16D_'+c);

 const participation=safeList(p.participation);
 const participatory=new Set(participation.filter(x=>isText(x?.summary)&&isText(x?.evidence_ref)&&isDate(x?.date)).map(x=>x.audience));
 const missingParticipation=AUDIENCES.filter(x=>!participatory.has(x));
 for(const a of missingParticipation)missing.push('participacion.'+a);
 if(!isText(p?.council_school?.report_ref))missing.push('participacion.informe_al_consejo_escolar');
 if(!isText(p?.council_school?.feedback_or_justification))missing.push('participacion.observaciones_y_respuesta_fundada');
 if(!isText(p?.policy_alignment))missing.push('articulacion.politica_nacional');
 if(!isText(p?.pei_alignment))missing.push('articulacion.PEI');
 if(!isText(p?.rie_alignment))missing.push('articulacion.RIE');
 if(!isText(p?.pme_alignment))warnings.push('Revisar vínculo con PME cuando sea pertinente al establecimiento.');

 // La Ley 21.809 art.16G incluye difusión y constancia de entrega.
 if(!isText(p?.diffusion?.channels))missing.push('difusion.canales');
 if(!isText(p?.diffusion?.calendar))missing.push('difusion.periodo');
 if(!isText(p?.diffusion?.delivery_record_plan))missing.push('difusion.constancia_entrega_prevista');
 if(!isText(p?.follow_up?.frequency))missing.push('seguimiento.periodicidad');
 if(!isText(p?.follow_up?.responsible))missing.push('seguimiento.responsable');
 if(!isText(p?.follow_up?.evaluation_method))missing.push('seguimiento.metodo_evaluacion');
 if(!isText(p?.director_approval?.approval_document_ref))
   warnings.push('El plan todavía no registra el acto de aprobación/dictación de Dirección. Aprobación exclusiva de la persona facultada.');
 if(!isDate(p?.director_approval?.date))
   warnings.push('Falta fecha documental de aprobación de Dirección.');
 const status=missing.length?'draft_incomplete':'ready_for_human_review';
 return {
   status,missing:uniq(missing),warnings,
   coverage:{clauses:CLAUSES.map(c=>({clause:'16D-'+c,has_action:covered.has(c)})),
     missing_diagnostic_audiences:missingAudiences,
     missing_participation:missingParticipation,
     total_actions:actions.length,total_findings:findings.length},
   director_approval_recorded:isText(p?.director_approval?.approval_document_ref)&&isDate(p?.director_approval?.date),
   disclaimer:'Chequeo de integridad del borrador, no certificación normativa; requiere evaluación institucional, Consejo Escolar y acto de aprobación por Dirección. No autoriza publicar ni usar datos personales.'
 };
}
module.exports={inspectPgceDraft,CLAUSES,AUDIENCES};
