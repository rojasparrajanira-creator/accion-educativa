'use strict';
// Prepara el estado de COBERTURA TECNICA de los 20 UAT.
// NO infiere ni certifica la aceptación humana. CERO conexiones externas.
const fs=require('node:fs');
const path=require('node:path');
const UAT_FILE=path.join(__dirname,'ACTA-ACEPTACION-PILOTO-PGCE-2027.md');
const EVIDENCE=Object.freeze({
 'UAT-01':{kind:'parcial',files:['test-pgce-browser-real-api-2027.cjs','test-student-dimensions-adapter-2027.cjs'],note:'Diagnóstico M1 sintético; falta evaluar comprensión y resultados reales sin identificadores'},
 'UAT-02':{kind:'parcial',files:['test-pgce-browser-real-api-2027.cjs','test-pgce-planning-drafts-2027.cjs'],note:'Guardado y borrador incompleto; falta aceptación del mensaje por profesional'},
 'UAT-03':{kind:'automatizada',files:['test-pgce-browser-smoke-2027.cjs','test-pgce-browser-real-api-2027.cjs','test-pgce-v2-migration-2027.cjs'],note:'Acciones con ID distinto, persistencia y recarga'},
 'UAT-04':{kind:'automatizada',files:['test-pgce-follow-up-2027.cjs','test-pgce-v2-migration-2027.cjs'],note:'Seguimientos diferenciados M1, M2 y M3 y versiones en base sintética'},
 'UAT-05':{kind:'automatizada',files:['test-pgce-http-security-2027.cjs','test-pgce-planning-drafts-2027.cjs'],note:'Conflicto de revisión obsoleta y conservación de última versión'},
 'UAT-06':{kind:'automatizada',files:['test-pgce-http-security-2027.cjs','test-pgce-browser-real-api-2027.cjs'],note:'Denegación de acceso a perfil no autorizado'},
 'UAT-07':{kind:'automatizada',files:['test-pgce-http-security-2027.cjs','test-pgce-browser-real-api-2027.cjs'],note:'Aislamiento entre escuelas ficticias'},
 'UAT-08':{kind:'automatizada',files:['test-pgce-governance-2027.cjs','test-pgce-http-security-2027.cjs'],note:'Registro solo de referencias documentales, sin certificar autenticidad'},
 'UAT-09':{kind:'automatizada',files:['test-pgce-http-security-2027.cjs','test-pgce-browser-real-api-2027.cjs'],note:'Coordinación no puede registrar acto de Dirección'},
 'UAT-10':{kind:'automatizada',files:['test-pgce-governance-2027.cjs','test-pgce-http-security-2027.cjs'],note:'Se exige Consejo de igual revisión antes de referencia a Dirección'},
 'UAT-11':{kind:'automatizada',files:['test-pgce-governance-2027.cjs','test-pgce-http-security-2027.cjs'],note:'Registro ficticio habilitado solo con requisitos previos, sin certificar ley'},
 'UAT-12':{kind:'automatizada',files:['test-pgce-governance-2027.cjs','test-pgce-http-security-2027.cjs'],note:'Cambio de borrador invalida referencias previas'},
 'UAT-13':{kind:'automatizada',files:['test-pgce-browser-real-api-2027.cjs','test-pgce-export-review-2027.cjs'],note:'CSV bloqueado hasta revisión de privacidad'},
 'UAT-14':{kind:'automatizada',files:['test-pgce-export-review-2027.cjs','test-pgce-http-security-2027.cjs'],note:'Revisión de privacidad enlazada a versión vigente'},
 'UAT-15':{kind:'parcial',files:['test-pgce-export-2027.cjs','test-pgce-browser-real-api-2027.cjs'],note:'Filtrado y neutralización de fórmulas; lectura humana del CSV pendiente'},
 'UAT-16':{kind:'parcial',files:['test-pgce-browser-smoke-2027.cjs'],note:'Foco visible y axe automáticos; recorrido completo por teclado pendiente'},
 'UAT-17':{kind:'manual',files:[],note:'Requiere evaluación real con lector de pantalla y profesional de accesibilidad'},
 'UAT-18':{kind:'parcial',files:['test-pgce-browser-smoke-2027.cjs','test-pgce-local-pilot-browser-2027.cjs'],note:'Tamaños emulados correctos; dispositivo físico y ampliación de texto pendientes'},
 'UAT-19':{kind:'automatizada',files:['test-pgce-pilot-readiness-2027.cjs','test-pgce-http-security-2027.cjs'],note:'Checklist no concede aprobación ni habilita producción'},
 'UAT-20':{kind:'manual',files:[],note:'Requiere revisión jurídica y de gestión institucional externa al sistema'}
});
const KINDS=new Set(['automatizada','parcial','manual']);
function parseActa(){
 const content=fs.readFileSync(UAT_FILE,'utf8');
 const rows=[...content.matchAll(/^\|\s*(UAT-\d{2})\s*\|([^\n]*)$/gm)]
  .map(m=>({id:m[1],description:m[2].split('|').slice(0,2).join(' · ').trim()}));
 return rows;
}
function buildReport({sha='',runId=''}={}){
 const rows=parseActa();
 const ids=rows.map(x=>x.id);
 if(ids.length!==20||new Set(ids).size!==20)throw Error('uat_catalogo_no_tiene_20_casos_unicos');
 const expected=Array.from({length:20},(_,i)=>'UAT-'+String(i+1).padStart(2,'0'));
 if(ids.join('|')!==expected.join('|'))throw Error('uat_catalogo_incompleto_o_desordenado');
 if(Object.keys(EVIDENCE).sort().join('|')!==[...ids].sort().join('|'))throw Error('uat_mapa_incompleto');
 const annotated=rows.map(row=>{
  const e=EVIDENCE[row.id];
  if(!KINDS.has(e.kind))throw Error('tipo_evidencia_invalido');
  if(e.kind==='manual'&&e.files.length)throw Error('caso_manual_no_puede_marcarse_automatizado');
  for(const file of e.files){
   if(!/^test-[a-z0-9-]+\.cjs$/.test(file)||!fs.existsSync(path.join(__dirname,file)))
    throw Error('evidencia_de_prueba_inexistente_'+file);
  }
  return {...row,cobertura:e.kind,pruebas:e.files,observacion:e.note,
   estado_humano:'NO EVALUADO',aceptado_por_profesional:false};
 });
 const counts=Object.fromEntries([...KINDS].map(k=>[k,annotated.filter(r=>r.cobertura===k).length]));
 const run=String(runId||'').trim(),hash=String(sha||'').trim();
 const source=run&&/^\d{6,15}$/.test(run)
  ?'https://github.com/rojasparrajanira-creator/accion-educativa/actions/runs/'+run
  :'sin enlace de ejecución identificado';
 const safeSha=/^[0-9a-f]{40}$/.test(hash)?hash:'sin SHA confirmado';
 const md=[
  '# Informe de trazabilidad técnica UAT — Convivencia Educativa 2027',
  '',
  '> **NO es aceptación humana ni autorización de despliegue.** Esta matriz muestra qué casos cuentan con scripts de prueba; su ejecución y éxito se comprueban exclusivamente en GitHub Actions para el mismo SHA.',
  '',
  '- Revisión de código: `'+safeSha+'`',
  '- Evidencia de ejecución: '+source,
  '- Cobertura técnica identificada: '+counts.automatizada+' automatizadas; '+counts.parcial+' parciales; '+counts.manual+' solo humanas.',
  '- Casos aceptados por profesional: **0 de 20** (todos sin evaluación humana registrada).',
  '- Datos de las pruebas: ficticios, sin cuentas, estudiantes ni bases reales.',
  '',
  '| Caso | Cobertura técnica | Validación humana | Pruebas de referencia | Alcance y pendiente |',
  '|---|---|---|---|---|'
 ];
 for(const row of annotated)md.push('| '+row.id+' | '+row.cobertura+' | **NO EVALUADO** | '+
  (row.pruebas.length?row.pruebas.map(x=>'`'+x+'`').join(', '):'—')+
  ' | '+row.observacion.replace(/\|/g,'/')+' |');
 md.push('','## Criterio para declarar aceptación',
  'La cobertura técnica no implica aceptación UAT. Cada uno de los 20 casos de la acta requiere resultado **Pasa/Falla/No probado**, responsable, fecha, evidencia sintética y observaciones reales. En particular UAT-17, UAT-18 y UAT-20 exigen tecnologías, dispositivos o dictámenes humanos.',
  '','**Producción y Render:** no fusionar ni desplegar por el resultado de esta matriz. Exigir las aprobaciones documentadas de la sección 4 del acta de aceptación.');
 return {cases:annotated,counts,sha:safeSha,run:source,markdown:md.join('\n')+'\n',human_accepted:0,
  can_approve_pilot:false,can_deploy:false};
}
if(require.main===module){
 const report=buildReport({sha:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID});
 const output=path.join(__dirname,'pilot-evidence');
 fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(output,'INFORME-TRAZABILIDAD-UAT-2027.md'),report.markdown,'utf8');
 fs.writeFileSync(path.join(output,'ESTADO-UAT-2027.json'),JSON.stringify({
  sha:report.sha,run:report.run,counts:report.counts,cases:report.cases,
  human_accepted:0,can_approve_pilot:false,can_deploy:false},null,2)+'\n','utf8');
 console.log('PGCE_UAT_TRACE_READY '+JSON.stringify({counts:report.counts,
  human_accepted:report.human_accepted,can_deploy:false}));
}
module.exports={EVIDENCE,parseActa,buildReport};
