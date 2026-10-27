'use strict';
// Kit exportable de inicio: HTML de pauta UAT independiente, sin API ni datos reales.
// La pauta NO sirve para probar el backend: usar el piloto local para ejecutar los casos.
const fs=require('node:fs');
const path=require('node:path');
const {renderPage,catalog}=require('./pgce-uat-evaluacion-local-2027.cjs');
function generate(outDir=path.join(__dirname,'pilot-starter-pack')){
 if(catalog().length!==20)throw Error('uat_catalog_invalid');
 const html=renderPage();
 if(html.includes('https://convivencia-escolar-api.onrender.com')||
    /<script\s+src=|<link\s+[^>]*href=['"]https?:/i.test(html))
  throw Error('offline_evaluation_must_have_no_external_source');
 fs.mkdirSync(outDir,{recursive:true});
 const htmlFile=path.join(outDir,'PAUTA-UAT-2027-ABRIR-EN-NAVEGADOR.html');
 fs.writeFileSync(htmlFile,html,'utf8');
 const guide=`MATERIAL EDUCATIVO CHILE - INICIO DEL PILOTO DE CONVIVENCIA 2027

ESTE KIT NO ES LA PLATAFORMA PUBLICADA. No utilizar datos reales.
Abre PAUTA-UAT-2027-ABRIR-EN-NAVEGADOR.html en un navegador de computador
para consultar y registrar la pauta de 20 casos de evaluacion profesional.

ATENCION: LA PAUTA NO REALIZA PRUEBAS POR SI SOLA.
El evaluador debe ejecutar cada caso en el piloto local con datos ficticios.
Despues puede marcar Pasa / Falla / No probado y registrar un codigo
ficticio de evidencia. Nunca marcar Pasa solo por tener un test automatico.

PARA ABRIR EL PILOTO REAL EN WINDOWS:
1. Inicia sesion en GitHub con acceso al repositorio accion-educativa.
2. Selecciona la rama feature/convivencia-agregados-estudiantiles-pgce-2027.
3. Pulsa Code - Download ZIP y extrae el ZIP completo.
4. Instala Node.js 22 LTS o posterior (https://nodejs.org) si falta.
5. Haz doble clic en INICIAR-PILOTO-CONVIVENCIA-2027.cmd
6. Se abrira http://127.0.0.1:4173/?perfil=coordinacion
7. Pulsa Abrir pauta UAT (20 casos).
8. Guarda el archivo JSON de evaluacion antes de cerrar la ventana.

La pagina 127.0.0.1 solo funciona en EL MISMO COMPUTADOR donde
se ejecuta el piloto. Nunca debe compartirse como link publico.
Para salir del piloto pulsa Ctrl+C en su ventana.
Para la evaluacion en Safari iOS/Android es necesario un entorno
segregado con autenticacion real y aprobacion previa de costos.

ESTADO: El software no certifica leyes, aprobaciones de Direccion
ni autoriza fusion a produccion. Registrar evaluacion humana formal
en ACTA-ACEPTACION-PILOTO-PGCE-2027.md despues de las pruebas.

NO colocar en la pauta: nombres, RUN, fotos, casos o expedientes reales.
`;
 const guideFile=path.join(outDir,'LEEME-INICIO-SEGURO-2027.txt');
 fs.writeFileSync(guideFile,guide,'utf8');
 return {htmlFile,guideFile,count:catalog().length};
}
if(require.main===module){
 const result=generate();
 console.log('PGCE_2027_STARTER_KIT_READY '+JSON.stringify(result));
}
module.exports={generate};
