'use strict';
/**
 * Orientaciones temáticas, originales, no clínicas y sin prometer resultados.
 * Las recomendaciones NO reemplazan deliberación, diagnóstico cualitativo,
 * el PGCE aprobado, protocolos ni acciones legales obligatorias.
 */
const {DIMENSIONS}=require('./pgce-dimensions-integrated-2027.cjs');
const TEMPLATES=Object.freeze({
 SEG:{title:'Fortalecimiento de espacios escolares seguros',
  objective:'Fortalecer la percepción de seguridad y los canales de protección en los espacios educativos.',
  strategy:'Mapeo participativo de espacios seguros, revisión de supervisión en recreos y difusión de canales de ayuda.',
  indicator:'Ejecución documentada de acciones preventivas y contraste posterior de percepción de seguridad.',
  evidence:'Actas de recorridos participativos, ajustes de supervisión, materiales de difusión y evaluación.',
  audience:'Estudiantes, docentes, asistentes y familias'},
 RESP:{title:'Buen trato, inclusión y prevención de discriminación',
  objective:'Promover relaciones respetuosas e inclusivas entre integrantes de la comunidad.',
  strategy:'Acuerdos de buen trato por ciclo, actividades de sensibilización y prácticas pedagógicas inclusivas.',
  indicator:'Participación en acciones de buen trato y seguimiento de acuerdos de convivencia.',
  evidence:'Acuerdos por ciclo, registros de talleres y revisión de indicadores de convivencia.',
  audience:'Estudiantes y comunidad educativa'},
 ORG:{title:'Comprensión y aplicación formativa de las normas',
  objective:'Mejorar el conocimiento, la claridad y la aplicación coherente de normas de convivencia.',
  strategy:'Revisión participativa de normas y protocolos, orientación a estudiantes y formación de personas adultas.',
  indicator:'Participación en instancias de difusión y comprensión declarada de normas.',
  evidence:'Actas de socialización, materiales y registros de participación por estamento.',
  audience:'Todos los estamentos'},
 CONF:{title:'Gestión colaborativa de conflictos',
  objective:'Fortalecer la prevención, gestión y reparación formativa de conflictos, protegiendo derechos.',
  strategy:'Capacitación en resolución pacífica, rutas de derivación y acompañamiento profesional cuando corresponda. No mediar situaciones que requieren protección.',
  indicator:'Capacitaciones ejecutadas y revisión documentada de procedimientos preventivos.',
  evidence:'Protocolos revisados, actas formativas, seguimiento profesional y evaluación de acciones.',
  audience:'Estudiantes, profesionales y familias'},
 PAR:{title:'Participación y sentido de pertenencia',
  objective:'Ampliar oportunidades de participación efectiva, escucha y pertenencia.',
  strategy:'Consejos de curso, consultas por ciclo, representantes estudiantiles y devolución de decisiones.',
  indicator:'Instancias participativas ejecutadas y propuestas con respuesta institucional.',
  evidence:'Actas, acuerdos de curso, síntesis de propuestas y comunicaciones de respuesta.',
  audience:'Estudiantes por nivel y equipos profesionales'},
 BIE:{title:'Promoción del bienestar y apoyo socioemocional',
  objective:'Promover el bienestar socioemocional de la comunidad y el acceso oportuno a apoyos institucionales.',
  strategy:'Talleres socioemocionales adaptados por edad, orientación a adultos significativos y difusión de redes de apoyo.',
  indicator:'Cobertura de acciones preventivas y evaluación participativa de bienestar.',
  evidence:'Talleres, registros agregados, encuestas de seguimiento y material de apoyo.',
  audience:'Estudiantes, trabajadores y familias'},
 DIG:{title:'Ciudadanía digital y prevención del ciberacoso',
  objective:'Fortalecer prácticas de cuidado y convivencia en espacios digitales.',
  strategy:'Educación digital por ciclo, formación a apoderados, privacidad y orientación sobre canales de ayuda.',
  indicator:'Actividades de ciudadanía digital aplicadas y evaluación de aprendizajes preventivos.',
  evidence:'Planificaciones, materiales, registros de participación y evaluación de talleres.',
  audience:'Estudiantes y familias según nivel'},
 FORM:{title:'Difusión y formación en convivencia',
  objective:'Fortalecer el conocimiento de normas, enfoques de buen trato y responsabilidades institucionales.',
  strategy:'Plan formativo diferenciado por estamento, formatos accesibles y evaluación de difusión.',
  indicator:'Instancias realizadas y participación por estamento.',
  evidence:'Programa formativo, materiales difundidos y actas de participación.',
  audience:'Docentes, asistentes, familias y directivos'},
 GEST:{title:'Articulación UTP y gestión institucional',
  objective:'Coordinar la incorporación transversal de convivencia en la planificación institucional.',
  strategy:'Mesa de trabajo UTP-convivencia-dirección, coordinación PEI/PME/RIE y monitoreo periódico M1/M2/M3.',
  indicator:'Reuniones de coordinación realizadas y acciones del PGCE con responsables asignados.',
  evidence:'Actas de coordinación, cronograma, monitoreo y actualización de acuerdos.',
  audience:'UTP, equipo directivo y profesionales de convivencia'},
 FAM:{title:'Vinculación y formación de apoderados',
  objective:'Fortalecer la comunicación, formación y participación de madres, padres y apoderados.',
  strategy:'Encuentros de buen trato, prevención del acoso, resolución de conflictos y horarios accesibles.',
  indicator:'Participación de familias y valoración de actividades formativas.',
  evidence:'Convocatorias, materiales, registros de asistencia agregados y actas de evaluación.',
  audience:'Familias y comunidad escolar'}
});
function proposeEvidenceBasedActions(report){
 const dimensions=Array.isArray(report?.dimensions)?report.dimensions:[];
 const proposals=[];
 for(const dim of dimensions){
  if(!Object.hasOwn(TEMPLATES,dim.id)||!Object.hasOwn(DIMENSIONS,dim.id))continue;
  const low=(dim.review_topics||[]).filter(x=>x.favorable_band==='0–24 %'||x.favorable_band==='25–49 %');
  if(!low.length)continue;
  const tpl=TEMPLATES[dim.id];
  proposals.push({
   dimension_id:dim.id,
   dimension_label:dim.label,
   title:tpl.title,objective:tpl.objective,strategy:tpl.strategy,indicator:tpl.indicator,
   expected_evidence:tpl.evidence,audience:tpl.audience,
   related_legal_clauses:DIMENSIONS[dim.id].clauses.map(x=>'16D-'+x),
   origin_types:[...new Set(low.map(x=>x.audience))],
   level_types:[...new Set(low.filter(x=>x.audience==='estudiantes'&&x.level).map(x=>x.level))],
   status:'suggestion_requires_institutional_review',
   baseline:'',target:'',responsible:'',start_date:'',end_date:'',resources:'',
   warning:'Hipótesis de trabajo, no hallazgo confirmado ni acción aprobada. Requiere fuentes adicionales y priorización participativa.'
  });
 }
 return {
  school_year:2027,status:'professional_review_required',
  proposals,
  mandatory_areas:'El Plan debe considerar todos los componentes de artículo 16 D, aun sin señales de encuesta.',
  warning:'Las bandas favorables de escalas distintas no son comparables entre niveles. Propuestas no automáticas ni clínicas.'
 };
}
module.exports={TEMPLATES,proposeEvidenceBasedActions};
