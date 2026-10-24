'use strict';
// Exportación CSV para equipo profesional autorizado, nunca publicación oficial.
// El contenido proviene de agregados ya protegidos + borrador institucional.
const PERIODS=new Set(['M1','M2','M3']);
const HEADERS=Object.freeze([
 'Tipo de registro','Medición','Apartado 16D','Identificador','Dimensión / acción',
 'Detalle institucional','Estado','Indicador / avance','Meta','Referencia documental',
 'Observaciones'
]);
function cell(value){
 const clean=String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,1800);
 // Los campos editados por profesionales nunca deben convertirse en fórmulas de Excel.
 const safe=/^[\s\u200b\ufeff]*[=+\-@]/u.test(clean)?"'"+clean:clean;
 return '"'+safe.replace(/"/g,'""')+'"';
}
function toCsv(rows){return '\ufeff'+rows.map(row=>row.map(cell).join(';')).join('\r\n')+'\r\n'}
function buildPgceExportCsv({report,draft,followups,preflight,measurementCode}){
 if(!PERIODS.has(measurementCode)||
   !report||report.year!==2027||report.student_measurement_code!==measurementCode||
   !Array.isArray(report.dimensions)||report.dimensions.length!==10||
   !draft||draft.school_year!==2027||!Array.isArray(draft.actions)||
   !Array.isArray(draft.findings)||!Array.isArray(followups)||
   !preflight||!Array.isArray(preflight.missing))throw Error('invalid_pgce_export');
 const rows=[HEADERS];
 const append=(type,period,clause,id,title,detail,status,indicator,target,evidence,notes)=>
  rows.push([type,period,clause,id,title,detail,status,indicator,target,evidence,notes]);
 append('AVISO','','','','INFORME PRELIMINAR · PGCE 2027',
  'Documento de trabajo para revisión profesional. No certifica cumplimiento ni aprobación.',
  'BORRADOR','','','','Sin respuestas individuales ni nombres de estudiantes.');
 append('ESTABLECIMIENTO','','','','Nombre institucional',draft.establishment_name||'Sin completar',
  'BORRADOR','','','','Año 2027; no publicar sin revisión y aprobación formal.');
 append('MEDICIÓN',measurementCode,'','','Resultados por dimensión',
  'Bandas agregadas del corte seleccionado, sin conteos exactos ni puntaje oficial.',
  report.status||'preliminary_dimensions_only','','','','No mezclar escalas ni niveles.');
 for(const dim of report.dimensions){
  append('DIMENSIÓN',measurementCode,(dim.legal_links||[]).join(' / '),dim.id,
   dim.label||'', 'Síntesis institucional de área temática',dim.status||'sin_datos',
   '', '', '', 'Requiere interpretación profesional con otras fuentes.');
  for(const item of dim.review_topics||[]){
   // Fuente agregada y banda, no filas por persona ni respuestas individuales.
   append('SEÑAL AGREGADA',measurementCode,item.clause||'',dim.id,
    dim.label||'',String(item.audience||'')+(item.level?' · nivel '+item.level:''),
    item.review_category||'requires_contextual_interpretation',
    item.favorable_band||'', '',item.evidence_ref||'', 'Banda indicativa, no diagnóstico clínico.');
  }
 }
 for(const finding of draft.findings){
  append('HALLAZGO','',finding.dimension_id||'',finding.id||'',
   'Necesidad de revisión profesional',finding.need||'','PENDIENTE DE APROBACIÓN',
   '', '',(finding.evidence_refs||[]).join(' / '),finding.professional_validation_note||'');
 }
 for(const action of draft.actions){
  append('ACCIÓN','',action.clause||'',action.action_id||'',action.title||'Sin completar',
   action.objective||'','BORRADOR',action.indicator||'',action.target||'',
   action.expected_evidence||'',
   'Responsable: '+(action.responsible||'pendiente')+
   ' · Fecha: '+(action.start_date||'?')+' a '+(action.end_date||'?'));
 }
 const actionIds=new Set(draft.actions.map(a=>a.action_id));
 const seen=new Set();
 for(const item of followups){
  if(!item||!actionIds.has(item.action_id)||!PERIODS.has(item.measurement_code))continue;
  const key=item.action_id+'|'+item.measurement_code;
  if(seen.has(key))continue;
  seen.add(key);
  const action=draft.actions.find(a=>a.action_id===item.action_id);
  if(action.clause!==item.clause)continue;
  append('SEGUIMIENTO',item.measurement_code,item.clause,item.action_id,
   action.title||'Acción institucional',
   item.adjustment_note||'',item.status||'pending',
   Number.isInteger(Number(item.progress_percent))?String(item.progress_percent)+' %':'',
   '',Array.isArray(item.evidence_refs)?item.evidence_refs.join(' / '):'',
   item.professional_note||'');
 }
 append('CONTROL EDITORIAL','','','','Revisión del borrador',
  'Campos pendientes: '+preflight.missing.length,preflight.status||'draft_incomplete',
  '', '', '', 'No acredita aprobación de Dirección ni del Consejo Escolar.');
 return toCsv(rows);
}
module.exports={buildPgceExportCsv,cell,HEADERS};
