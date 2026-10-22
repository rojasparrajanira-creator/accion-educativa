'use strict';
// Puente servidor: integra exclusivamente datos AGRUPADOS de aplicaciones
// estudiantiles completadas, sin entregar respuestas, RUN, nombres o IDs.
const {DIMENSIONS,verifiedStudentAggregate}=require('./pgce-dimensions-integrated-2027.cjs');
const LEVELS=Object.freeze(['1-2','3-4','5-6','7-8','1-2-medio','3-4-medio']);
const PERIODS=Object.freeze(['M1','M2','M3']);
const ITEM_MAP=Object.freeze(Object.fromEntries(
 Object.entries(DIMENSIONS).flatMap(([name,def])=>def.student.map(code=>[code,name]))
));
const caseForDimension="CASE substring(r.item_code from 1 for 3) "+
 Object.entries(ITEM_MAP).map(([code,dimension])=>"WHEN '"+code+"' THEN '"+dimension+"'").join(' ')+" ELSE NULL END";
const validResponse="("+
 " (a.survey_level='1-2' AND r.value IN ('1','2','3'))"+
 " OR (a.survey_level='3-4' AND r.value IN ('1','2','3','4'))"+
 " OR (a.survey_level IN ('5-6','7-8','1-2-medio','3-4-medio') AND r.value IN ('1','2','3','4','5'))"+
 ")";
const favorable="("+
 " (a.survey_level='1-2' AND r.value='3')"+
 " OR (a.survey_level='3-4' AND r.value IN ('3','4'))"+
 " OR (a.survey_level IN ('5-6','7-8','1-2-medio','3-4-medio') AND r.value IN ('4','5'))"+
 ")";
const QUERY=[
 "SELECT a.survey_level AS level, "+caseForDimension+" AS dimension,",
 " COUNT(DISTINCT a.student_id)::integer AS participant_count,",
 " COUNT(*)::integer AS valid_response_count,",
 " COUNT(*) FILTER (WHERE "+favorable+")::integer AS favorable_count",
 "FROM responses r",
 "JOIN survey_applications a ON a.id=r.application_id",
 "JOIN measurements m ON m.id=a.measurement_id",
 "JOIN students s ON s.id=a.student_id",
 "WHERE m.establishment_id=$1 AND s.establishment_id=$1 AND m.school_year=$2",
 " AND m.code=$3 AND a.status='completed' AND s.active=true",
 " AND a.survey_level IN ('1-2','3-4','5-6','7-8','1-2-medio','3-4-medio')",
 " AND r.item_code ~ '^D(0[1-9]|1[0-6])_[0-9]{2}$'",
 " AND "+validResponse,
 "GROUP BY a.survey_level,"+caseForDimension,
 "HAVING COUNT(DISTINCT a.student_id)>=10 AND COUNT(*)>=10",
 "ORDER BY a.survey_level,dimension"
].join('\n');
function valueBand(favorable,valid){
 const percent=favorable*100/valid;
 return percent<25?'0–24 %':percent<50?'25–49 %':percent<75?'50–74 %':'75–100 %';
}
function numericSafe(v){
 if(v===null||v===undefined||typeof v==='boolean'||String(v).trim()==='')return null;
 const n=Number(v);
 return Number.isSafeInteger(n)&&n>=0?n:null;
}
function studentDimensionAggregate(rows,{schoolYear,measurementCode}){
 if(schoolYear!==2027||!PERIODS.includes(measurementCode))throw Error('invalid_reporting_window');
 if(!Array.isArray(rows))throw Error('invalid_aggregates');
 const candidates=[];
 const seen=new Set();
 for(const row of rows){
  const level=String(row.level||'');
  const dimension=String(row.dimension||'');
  const count=numericSafe(row.participant_count);
  const valid=numericSafe(row.valid_response_count);
  const favorable=numericSafe(row.favorable_count);
  if(!LEVELS.includes(level)||!Object.hasOwn(DIMENSIONS,dimension)
   ||!DIMENSIONS[dimension].student.length||count===null||count<10||
   valid===null||valid<10||valid<count||valid>count*12||
   favorable===null||favorable>valid||seen.has(level+'|'+dimension)){
   continue;
  }
  seen.add(level+'|'+dimension);
  candidates.push({level,dimension,participant_count:count,valid_response_count:valid,
   favorable_band:valueBand(favorable,valid),
   aggregation_verified:true,
   evidence_ref:'PGCE-EST-'+schoolYear+'-'+measurementCode+'-'+level+'-'+dimension
  });
 }
 // Conservamos conteos solo dentro del proceso servidor para que la capa
 // de informes vuelva a verificar el umbral. Nunca se exponen por HTTP.
 const checked=new Set(verifiedStudentAggregate(candidates).map(x=>x.evidence_ref));
 return candidates.filter(x=>checked.has(x.evidence_ref));
}
async function loadStudentDimensionAggregates(pool,{establishmentId,schoolYear,measurementCode}){
 if(!Number.isSafeInteger(Number(establishmentId))||Number(establishmentId)<=0||
  schoolYear!==2027||!PERIODS.includes(measurementCode))throw Error('invalid_reporting_scope');
 const result=await pool.query(QUERY,[Number(establishmentId),schoolYear,measurementCode]);
 return studentDimensionAggregate(result.rows,{schoolYear,measurementCode});
}
module.exports={loadStudentDimensionAggregates,studentDimensionAggregate,QUERY,LEVELS,PERIODS,ITEM_MAP};
