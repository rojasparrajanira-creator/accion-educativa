'use strict';
/**
 * Puente temático interno de encuestas 2027 con PGCE.
 * NO aplica puntajes oficiales, ni datos clínicos, ni toma decisiones automáticas.
 */
const bank=require('./community-surveys-bank-2027.json');
const {makeAggregate}=require('./community-surveys-core.cjs');
const {inspectPgceDraft}=require('./pgce-preflight-2027.cjs');
const DIMENSIONS=Object.freeze({
 SEG:{label:'Seguridad y protección',student:['D01','D04','D13'],clauses:['c','d']},
 RESP:{label:'Buen trato e inclusión',student:['D02','D03','D07','D16'],clauses:['b','d']},
 ORG:{label:'Normas y ambiente organizado',student:['D05'],clauses:['a','b']},
 CONF:{label:'Gestión colaborativa de conflictos',student:['D06','D14'],clauses:['b','d']},
 PAR:{label:'Participación y pertenencia',student:['D08','D09'],clauses:['f']},
 BIE:{label:'Bienestar y desarrollo socioemocional',student:['D10','D11','D12'],clauses:['c']},
 DIG:{label:'Ciudadanía digital y prevención',student:['D15'],clauses:['c','d']},
 FORM:{label:'Información y formación',student:[],clauses:['b','g']},
 GEST:{label:'Coordinación y seguimiento institucional',student:[],clauses:['a','e']},
 FAM:{label:'Relación y formación de familias',student:[],clauses:['f','g']}
});
const CLAUSES=Object.freeze([
 {clause:'a',title:'Coordinación técnico-pedagógica y administrativa',guide:'Articular UTP, equipo directivo, PEI, PME y recursos institucionales.'},
 {clause:'b',title:'Difusión, formación, buen trato e inclusión',guide:'Planificar instancias de información y formación para todos los estamentos.'},
 {clause:'c',title:'Bienestar, salud mental y prevención de riesgos',guide:'Definir prevención y redes de apoyo con valoración humana, sin tamizaje clínico automático.'},
 {clause:'d',title:'Gestión colaborativa de conflictos y riesgos',guide:'Definir medidas preventivas, colaborativas y protocolos de protección.'},
 {clause:'e',title:'Calendarización y organización de actividades',guide:'Incluir objetivo, contribución al plan, lugar, fecha y persona responsable.'},
 {clause:'f',title:'Participación activa de estudiantes',guide:'Considerar voz y propuestas por curso, nivel y ciclo, acorde a la edad.'},
 {clause:'g',title:'Formación de madres, padres y apoderados',guide:'Incluir familias en formación sobre buen trato, acoso y conflictos.'}
]);
const LEVELS=Object.freeze(['nt1','nt2','1-2','3-4','5-6','7-8','1-2-medio','3-4-medio']);
const ROLES=Object.freeze(['familia','docente','asistente','directivo']);
const BANDS=Object.freeze(['0–24 %','25–49 %','50–74 %','75–100 %']);
function verifiedStudentAggregate(items){
 if(!Array.isArray(items))return [];
 const seen=new Set();
 return items.filter(x=>{
  if(!x||!Object.hasOwn(DIMENSIONS,x.dimension)||!LEVELS.includes(x.level)||
   !BANDS.includes(x.favorable_band)||x.aggregation_verified!==true||
   !Number.isInteger(x.participant_count)||x.participant_count<10||
   !Number.isInteger(x.valid_response_count)||x.valid_response_count<10||
   // Una persona puede responder varios ítems de la misma dimensión.
   x.valid_response_count>x.participant_count*12||
   typeof x.evidence_ref!=='string'||!/^[-a-zA-Z0-9_./]{6,80}$/.test(x.evidence_ref)||
   seen.has(x.level+'|'+x.dimension))return false;
  seen.add(x.level+'|'+x.dimension);return true;
 }).map(x=>({
  source:'verified_student_aggregate',level:x.level,dimension:x.dimension,
  favorable_band:x.favorable_band,evidence_ref:x.evidence_ref,
  participants_band:String(Math.floor(x.participant_count/5)*5)+'–'+String(Math.floor(x.participant_count/5)*5+4)
 }));
}
function buildDimensionReport(adultRows=[],studentIndicators=[]){
 const rows=Array.isArray(adultRows)?adultRows:[];
 const reports=Object.create(null);
 for(const audience of ROLES){
  reports[audience]=makeAggregate(rows.filter(x=>x.audience===audience),audience);
 }
 const student=verifiedStudentAggregate(studentIndicators);
 const dimensions=Object.entries(DIMENSIONS).map(([id,def])=>{
  const coverage=[],topics=[];
  for(const audience of ROLES){
   const items=bank.audiences[audience].items.filter(x=>x.dimension===id);
   if(!items.length)continue;
   const report=reports[audience];
   const valid=(report.items||[]).filter(x=>x.dimension===id&&x.available&&BANDS.includes(x.favorable_band));
   coverage.push({
    audience,available:!!valid.length,status:!report.available?'insufficient_group_size':
     valid.length?'aggregate_available':'insufficient_item_responses',
    questions_in_instrument:items.length,questions_with_sufficient_aggregates:valid.length
   });
   for(const result of valid){
    const item=items.find(x=>x.id===result.id);
    if(!item)continue;
    topics.push({audience,question_id:item.id,clause:item.legal_clause,
     favorable_band:result.favorable_band,review_category:
      BANDS.indexOf(result.favorable_band)<2?'needs_professional_review':'requires_contextual_interpretation'});
   }
  }
  for(const x of student.filter(x=>x.dimension===id)){
   coverage.push({audience:'estudiantes',level:x.level,available:true,status:'aggregate_available',evidence_ref:x.evidence_ref});
   topics.push({audience:'estudiantes',level:x.level,evidence_ref:x.evidence_ref,
    favorable_band:x.favorable_band,review_category:'requires_contextual_interpretation'});
  }
  return {id,label:def.label,student_question_codes:def.student.slice(),
   legal_links:def.clauses.map(x=>'16D-'+x),status:topics.length?'review_with_professionals':'missing_sufficient_evidence',
   coverage,review_topics:topics};
 });
 return {status:'preliminary_dimensions_only',year:2027,dimensions,
  audience_availability:ROLES.map(x=>({audience:x,available:reports[x].available,
   participant_band:reports[x].available?reports[x].participant_band:null})),
  student_source_status:student.length?'verified_aggregates_received':'not_integrated_yet',
  student_levels_present:[...new Set(student.map(x=>x.level))],
  student_levels_pending:LEVELS.filter(x=>!student.some(y=>y.level===x)),
  missing_other_sources:['Procesos participativos y actas','Consejo Escolar',
   'Observación pedagógica y contexto','Registros agregados y protocolos del establecimiento'],
  warning:'Solo resultados agregados de instrumentos propios. No equivalen a DIA/SIMCE, no revelan casos personales y no acreditan cumplimiento legal.'};
}
function buildPgceScaffold(report,school={}){
 const r=report||buildDimensionReport();
 const sectionInfo=CLAUSES.map(e=>{
  const associated=Object.entries(DIMENSIONS).filter(([,v])=>v.clauses.includes(e.clause)).map(([k])=>k);
  const signals=associated.reduce((n,k)=>n+(r.dimensions.find(x=>x.id===k)?.review_topics.length||0),0);
  return {
   clause:'16D-'+e.clause,title:e.title,dimension_ids:associated,
   evidence_review_status:signals?'needs_professional_review':'insufficient_evidence',
   topics_to_review:signals,planning_guide:e.guide,
   required_fields:['diagnóstico','objetivo','estrategia','acciones','responsable','lugar',
    'inicio y término','recursos','indicador','línea base','meta','evidencia','evaluación']
  };
 });
 const actions=CLAUSES.map(e=>({
  clause:e.clause,title:'',objective:'',strategy:'',responsible:'',indicator:'',
  baseline:'',target:'',place:'',resources:'',expected_evidence:'',
  start_date:'',end_date:'',finding_ids:[]
 }));
 const draft={
  establishment_name:typeof school.establishment_name==='string'?school.establishment_name:'',
  rbd:typeof school.rbd==='string'?school.rbd:'',director:'',responsible:'',
  version:'BORRADOR SIN APROBACIÓN',school_year:2027,findings:[],actions,
  diagnostic_sources:[],participation:[],
  council_school:{report_ref:'',feedback_or_justification:''},
  policy_alignment:'',pei_alignment:'',rie_alignment:'',pme_alignment:'',
  diffusion:{channels:'',calendar:'',delivery_record_plan:''},
  follow_up:{frequency:'',responsible:'',evaluation_method:''},
  director_approval:null
 };
 const check=inspectPgceDraft(draft);
 if(check.status!=='draft_incomplete')throw Error('unapproved_template_must_not_be_ready');
 return {status:'structure_only_not_an_approved_plan',school_year:2027,
  sections:sectionInfo,draft,preflight:check,can_publish:false,can_certify_compliance:false,
  warning:'Estructura editable no aprobada; requiere diagnóstico participativo, evidencia documental, planificación contextualizada, Consejo Escolar y Dirección.'};
}
module.exports={DIMENSIONS,CLAUSES,LEVELS,ROLES,BANDS,verifiedStudentAggregate,buildDimensionReport,buildPgceScaffold};
