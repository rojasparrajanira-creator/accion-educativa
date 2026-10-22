'use strict';
/**
 * Orientaciones de acciones PGCE por dimensión; todas quedan en BORRADOR.
 * Sólo a partir de tópicos agregados del diagnóstico, nunca de casos.
 */
const {DIMENSIONS,CLAUSES,BANDS}=require('./pgce-dimensions-integrated-2027.cjs');
const actionLibrary=Object.freeze({
 SEG:{title:'Revisar entornos seguros y canales de apoyo',
  purpose:'Fortalecer la percepción de seguridad y el acceso oportuno a personas adultas de apoyo.',
  activity:'Recorrer espacios junto a representantes de la comunidad, identificar barreras de cuidado y difundir canales seguros para pedir ayuda.',
  questions:['¿Qué espacios y momentos requieren más atención?','¿Qué protocolos y redes ya existen?']},
 RESP:{title:'Promover buen trato, respeto e inclusión',
  purpose:'Fortalecer interacciones respetuosas y prevenir prácticas excluyentes.',
  activity:'Planificar talleres y acuerdos de buen trato adecuados a cada ciclo, incorporando la voz del estudiantado.',
  questions:['¿Qué grupos o espacios necesitan apoyos específicos?','¿Cómo se evaluará el impacto en el trato cotidiano?']},
 ORG:{title:'Revisar normas y acuerdos de convivencia',
  purpose:'Favorecer reglas conocidas, comprensibles y aplicadas con criterios formativos.',
  activity:'Revisar el reglamento y acuerdos de curso con estudiantes, familias y equipos, con versiones accesibles por edad.',
  questions:['¿Qué normas no están siendo comprendidas?','¿Cómo se comprobará que la comunidad conoce sus derechos y deberes?']},
 CONF:{title:'Fortalecer gestión colaborativa de conflictos',
  purpose:'Promover resolución pacífica y actuación oportuna, sin sustituir protocolos obligatorios.',
  activity:'Revisar rutas de apoyo, acompañar a los equipos y ofrecer estrategias de diálogo o mediación cuando proceda.',
  questions:['¿Qué conflictos pueden gestionarse colaborativamente?','¿Cuándo corresponde activar un protocolo de protección?']},
 PAR:{title:'Ampliar la participación estudiantil',
  purpose:'Asegurar que las propuestas de estudiantes incidan en la mejora de la convivencia.',
  activity:'Realizar instancias consultivas por ciclo y registrar acuerdos, respuestas y seguimiento a las propuestas.',
  questions:['¿Qué instancias de representación existen por nivel?','¿Cómo sabrán los estudiantes qué se decidió con sus propuestas?']},
 BIE:{title:'Fortalecer bienestar y apoyos socioemocionales',
  purpose:'Promover bienestar y orientar oportunamente hacia apoyos profesionales adecuados.',
  activity:'Articular actividades de bienestar con orientación y redes de apoyo, evaluando barreras de acceso y factores protectores.',
  questions:['¿Qué recursos y redes tiene el establecimiento?','¿Qué resguardos evitan etiquetar o diagnosticar a partir de una encuesta?']},
 DIG:{title:'Reforzar ciudadanía y autocuidado digital',
  purpose:'Promover relaciones respetuosas y protección de la privacidad en entornos digitales.',
  activity:'Desarrollar talleres contextualizados de prevención de ciberacoso, buen trato y solicitud segura de apoyo.',
  questions:['¿Qué riesgos digitales son relevantes para cada nivel?','¿Cómo involucrar a familias y docentes?']},
 FORM:{title:'Planificar formación y difusión por estamento',
  purpose:'Asegurar información y formación pertinente y accesible para toda la comunidad.',
  activity:'Programar jornadas de orientación sobre buen trato, derechos, canales de apoyo y normas de convivencia.',
  questions:['¿Qué estamentos aún no recibieron formación?','¿Qué evidencia de convocatoria y aprendizaje se conservará?']},
 GEST:{title:'Fortalecer coordinación y seguimiento del Plan',
  purpose:'Articular equipos, responsabilidades y seguimiento verificable de las acciones.',
  activity:'Definir instancias periódicas con UTP, dirección y convivencia para revisar indicadores, recursos y acuerdos.',
  questions:['¿Cómo se vinculan PEI, PME, RIE y PGCE?','¿Quién consolidará el seguimiento M1, M2 y M3?']},
 FAM:{title:'Fortalecer colaboración y formación con familias',
  purpose:'Favorecer participación informada de madres, padres y cuidadores en convivencia.',
  activity:'Diseñar actividades accesibles sobre buen trato, prevención del acoso y resolución de conflictos, registrando participación.',
  questions:['¿Cuáles son los horarios y formatos accesibles para las familias?','¿Cómo se recogerán sus opiniones y propuestas?']}
});
function createActionCandidates(report){
 const known=new Map((Array.isArray(report?.dimensions)?report.dimensions:[])
  .filter(x=>x&&typeof x.id==='string').map(x=>[x.id,x]));
 const results=[];
 for(const [dimension,def] of Object.entries(DIMENSIONS)){
  const source=known.get(dimension);
  const topics=(Array.isArray(source?.review_topics)?source.review_topics:[])
   .filter(x=>x&&(
      (['familia','docente','asistente','directivo'].includes(x.audience)&&
       typeof x.question_id==='string'&&new RegExp('^'+x.audience.toUpperCase()+'_\\d{2}$').test(x.question_id))
      || (x.audience==='estudiantes'&&def.student.length>0&&typeof x.evidence_ref==='string'&&
        /^PGCE-EST-2027-M[123]-(1-2|3-4|5-6|7-8|1-2-medio|3-4-medio)-[A-Z]{3,4}$/.test(x.evidence_ref))
   )&&BANDS.includes(x.favorable_band));
  if(!topics.length)continue;
  const t=actionLibrary[dimension];
  if(!t)continue;
  const low=topics.some(x=>BANDS.indexOf(x.favorable_band)<2);
  const links=def.clauses.map(c=>'16D-'+c);
  const clause=links[0];
  const sources=[...new Set(topics.map(x=>x.audience==='estudiantes'?x.evidence_ref:x.question_id))].slice(0,12);
  results.push({
   id:'PGCE-CAND-2027-'+dimension,dimension,dimension_label:def.label,
   related_clauses:links,primary_clause:clause,
   status:'idea_for_professional_review_only',
   review_reason:low?'hay_bandas_que_requieren_indagacion':'explorar_fortalezas_y_oportunidades',
   proposed_title:t.title,purpose_for_discussion:t.purpose,
   possible_activity:t.activity,questions_for_team:t.questions.slice(),
   evidence_refs:sources,
   measurement_code:['M1','M2','M3'].includes(report?.student_measurement_code)?report.student_measurement_code:null,
   // El establecimiento debe redactar su hallazgo fundamentado y completar estos campos.
   missing_before_plan:['hallazgo confirmado con otras fuentes','objetivo local',
    'meta e indicador','línea base','responsables','fechas y lugar',
    'recursos','evidencia','consulta participativa','aprobación de dirección'],
   can_be_added_without_review:false
  });
 }
 return {status:'suggestions_not_a_plan',year:2027,actions:results,
  coverage:Object.keys(DIMENSIONS).map(d=>({dimension:d,has_suggestion:results.some(x=>x.dimension===d)})),
  required_plan_clauses:CLAUSES.map(x=>'16D-'+x.clause),
  warning:'Ideas editoriales, no diagnósticos ni medidas automáticas. Una dimensión sin datos no genera acción, pero las obligaciones legales siguen vigentes. Cada acción requiere revisión y contextualización por personas autorizadas.'};
}
module.exports={actionLibrary,createActionCandidates};
