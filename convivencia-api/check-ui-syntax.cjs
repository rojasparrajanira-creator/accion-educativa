'use strict';
// Verificación sintáctica sin navegar el sitio, iniciar sesiones ni crear datos.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../convivencia-escolar');
const critical=[
  'index.html','ingreso.html','inicio.html','estudiantes.html','cursos.html',
  'configurar-aplicacion.html','asignar-encuestas.html','resultados.html',
  'diagnostico.html','informe-individual.html','informe-curso.html',
  'informe-institucional.html','plan-gestion.html','plan-intervencion-institucional.html',
  'pgce-panel.html','notificaciones.html','acceso-estudiante.html',
  'admin-centro.html','admin-plataforma.html','admin-pedidos.html'
];
let checked=0;
for(const file of critical){
  const full=path.join(root,file),html=fs.readFileSync(full,'utf8');
  if(!html.trim())throw Error('Pantalla vacía: '+file);
  let inline=0;const re=/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  for(const match of html.matchAll(re)){
    const attrs=match[1],body=match[2];
    if(/\bsrc\s*=/.test(attrs)||!body.trim())continue;
    const type=attrs.match(/\btype\s*=\s*['"]([^'"]+)['"]/i)?.[1]||'text/javascript';
    if(!['text/javascript','application/javascript','module'].includes(type))continue;
    if(type==='module')continue; // Parseo de módulos es tarea de un runner ESM
    new vm.Script(body,{filename:full+':script-'+(++inline)});
  }
  checked++;
}
const jsDir=path.join(root,'js');
for(const file of fs.readdirSync(jsDir)){
  if(!file.endsWith('.js'))continue;
  const full=path.join(jsDir,file);
  new vm.Script(fs.readFileSync(full,'utf8'),{filename:full});
  checked++;
}
console.log('SINTAXIS_CONVIVENCIA_OK '+checked+' archivos revisados. Sin datos reales ni solicitudes de red.');
