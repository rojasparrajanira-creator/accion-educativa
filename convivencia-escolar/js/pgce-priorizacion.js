window.MECPGCE_PRIORITY={
version:"2026.1",
levels:{high:{label:"Prioridad alta",rank:3},medium:{label:"Prioridad media",rank:2},low:{label:"Prioridad baja",rank:1}},
rules:{
minimumMeasurements:1,
professionalReviewRequired:true,
autoActivateProtocols:false,
autoDiscipline:false,
adverseExperiencesSeparate:true
},
classify(input){
const {dimension,current,previous=null,persistence=false,convergence=0,critical=false}=input||{};
if(!dimension||!/^D(0[1-9]|1[0-6])$/.test(dimension))throw new Error("invalid_dimension");
if(current==null||!Number.isFinite(Number(current)))throw new Error("current_result_required");
let score=0,reasons=[];
if(critical){score+=3;reasons.push("Existe una señal que requiere revisión profesional contextual.");}
if(persistence){score+=2;reasons.push("La necesidad se mantiene en más de una medición.");}
if(Number(convergence)>=2){score+=2;reasons.push("Convergen dos o más fuentes de evidencia.");}
if(previous!=null&&Number.isFinite(Number(previous))&&Number(current)<Number(previous)){score+=1;reasons.push("La dimensión muestra deterioro respecto de la medición anterior.");}
const priority=score>=4?"high":score>=2?"medium":"low";
return {dimension,priority,label:this.levels[priority].label,reasons,requires_professional_review:true};
},
buildProposal(result,map=window.MECPGCE_MAP){
if(!result||!map)throw new Error("mapping_required");
const d=map.dimensions[result.dimension];if(!d)throw new Error("dimension_not_mapped");
return {dimension:result.dimension,dimension_name:d.name,priority:result.priority,priority_label:result.label,objectives:d.pgce,action_ids:d.actions,indicators:d.indicators,evidence:d.evidence,reasons:result.reasons,status:"propuesta_para_revision",decision:null,responsible:null,start_date:null,end_date:null,indicator_selected:null,target:null,evidence_selected:[]};
},
validateDecision(p){
if(!p||!["aprobar","ajustar","descartar"].includes(p.decision))throw new Error("professional_decision_required");
if(p.decision!=="descartar"){
for(const k of ["responsible","start_date","end_date","indicator_selected","target"])if(!p[k])throw new Error("missing_"+k);
if(!Array.isArray(p.evidence_selected)||!p.evidence_selected.length)throw new Error("evidence_required");
}
return {...p,status:p.decision==="aprobar"?"aprobada":p.decision==="ajustar"?"ajustada":"descartada",reviewed_at:new Date().toISOString()};
}
};