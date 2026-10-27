'use strict';
// Inventario de protección de datos de CONVIVENCIA únicamente.
// Solo consultas agregadas y sin borrado. Nunca incluye tablas de tienda ni pagos.
const DATASETS=Object.freeze([
 {code:'students',label:'Matrícula de estudiantes',category:'identificadores de menores',purpose:'Aplicación, seguimiento y trayectoria escolar',table:'students',timestamp:'created_at'},
 {code:'survey_applications',label:'Aplicaciones de encuestas',category:'participación de estudiantes',purpose:'Asignar instrumentos M1–M3 y registrar su aplicación',table:'survey_applications',timestamp:'started_at'},
 {code:'responses',label:'Respuestas de encuestas',category:'respuestas y bienestar escolar',purpose:'Calcular resultados educativos y apoyar intervención profesional',table:'responses',timestamp:'created_at'},
 {code:'response_drafts',label:'Borradores de respuesta',category:'respuestas temporales',purpose:'Continuar encuestas sin perder progreso',table:'response_drafts',timestamp:'updated_at'},
 {code:'case_records',label:'Casos de convivencia',category:'antecedentes sensibles de convivencia',purpose:'Seguimiento y acciones de protección',table:'case_records',timestamp:'opened_at'},
 {code:'pgce_interventions',label:'Intervenciones del plan de gestión',category:'seguimiento institucional',purpose:'Planificación, evidencias y evaluación de acciones PGCE',table:'pgce_interventions',timestamp:'created_at'},
 {code:'professional_audit_events',label:'Auditoría de actuaciones profesionales',category:'trazabilidad y responsabilidad',purpose:'Control de accesos y actuaciones autorizadas',table:'professional_audit_events',timestamp:'created_at'},
 {code:'professional_notifications',label:'Notificaciones profesionales',category:'comunicaciones internas',purpose:'Informar tareas y acciones a profesionales autorizados',table:'professional_notifications',timestamp:'created_at'}
]);
function registerPrivacyInventory({app,pool,requireRole}){
 app.get('/api/platform/privacy-inventory',...requireRole('platform_admin'),async(req,res)=>{
  try{
   const rows=[];
   for(const dataset of DATASETS){
    // Tabla y columna pertenecen exclusivamente al catálogo constante, nunca vienen del cliente.
    const sql='select count(*)::integer total, min('+dataset.timestamp+') oldest, max('+dataset.timestamp+') latest from '+dataset.table;
    const result=await pool.query(sql);
    const agg=result.rows[0]||{};
    rows.push({code:dataset.code,label:dataset.label,category:dataset.category,
      purpose:dataset.purpose,count:Number(agg.total||0),oldest:agg.oldest||null,latest:agg.latest||null,
      retention_status:'pending_institutional_legal_review'});
   }
   res.setHeader('Cache-Control','private, no-store');
   res.json({ok:true,mode:'read_only',scope:'convivencia_only',retention_automated:false,
     retention_period_defined:false,datasets:rows});
  }catch(e){
   console.error('Privacy inventory aggregation failed');
   res.status(503).json({ok:false,error:'privacy_inventory_unavailable'});
  }
 });
}
module.exports={registerPrivacyInventory,DATASETS};
