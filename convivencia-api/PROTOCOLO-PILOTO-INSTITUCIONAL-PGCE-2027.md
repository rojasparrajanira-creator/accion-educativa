# Protocolo del piloto institucional — Convivencia Educativa 2027

**Estado:** guía operativa para prueba controlada, no autorización para producción.
**Alcance:** diagnóstico agregado de convivencia, borrador del PGCE, múltiples
acciones, seguimiento M1/M2/M3, revisión de privacidad, referencias documentales
del Consejo Escolar y de Dirección, exportación CSV.

## 1. Condiciones previas
- Un entorno de ensayo separado de producción y con **base aislada**;
  la bandera `MEC_COMMUNITY_SURVEYS_ENABLED` permanece desactivada en LIVE.
- Establecimientos, estudiantes, apoderados y personal **ficticios**. No
  incorporar casos reales, nombres de menores, RUN ni documentos confidenciales.
- Cuentas sintéticas independientes: coordinación de convivencia, dupla
  psicosocial, director/a y perfil sin permisos profesionales.
- Corroborar rol, establecimiento y caducidad de sesión, incluso tras cerrar y
  volver a abrir el navegador.
- Documentar versión probada, fecha, hallazgos y responsable del ensayo.

## 2. Recorrido para el equipo de convivencia
1. Iniciar con perfil autorizado, registrar un borrador incompleto y comprobar
   que permanezca en estado de trabajo, no aprobado.
2. Completar fuentes y antecedentes colectivos usando exclusivamente
   referencias simuladas; revisar la lista de campos pendientes.
3. Agregar dos acciones bajo el mismo apartado 16D y comprobar que sus IDs
   permanezcan estables tras recargar y guardar.
4. Registrar los avances de ambas acciones en M1, M2 y M3. No promediar
   resultados de instrumentos o niveles diferentes ni inferir diagnósticos
   clínicos o equivalencia SIMCE/DIA.
5. Intentar guardar una revisión obsoleta; debe producirse un conflicto sin
   sobrescritura de datos.
6. Revisar la lista de preparación del piloto; comprobar que describa
   condiciones pendientes y que nunca señale certificación de cumplimiento.

## 3. Consejo Escolar y Dirección
1. Registrar una referencia sintética de revisión del Consejo Escolar.
2. Comprobar que un perfil no directivo no pueda registrar el acto de Dirección.
3. Con perfil directivo ficticio y borrador incompleto, intentar registrar el
   acto. El sistema debe indicar los antecedentes faltantes.
4. Con borrador completo y referencia del Consejo para **la misma revisión**,
   registrar un acto sintético de Dirección. La respuesta solo constata
   quién ingresó la referencia; no valida firma, autenticidad ni legalidad.
5. Editar nuevamente el borrador. Ambas constancias de revisión anterior
   deben pasar a estado **desactualizado**. Nunca publicar automáticamente.

## 4. Privacidad, acceso y exportación
- Abrir el reporte desde otro establecimiento: no deben aparecer hallazgos,
  avances ni referencias del primero.
- Un perfil no autorizado debe recibir una denegación.
- La descarga de CSV con textos libres debe estar bloqueada sin confirmación
  profesional de privacidad vigente.
- Cambiar borrador o seguimiento debe anular la constancia de privacidad.
- Confirmar que el CSV no contiene respuestas individuales, conteos de grupos
  pequeños ni identificadores de estudiantes, y que los textos peligrosos no
  ejecutan fórmulas al abrirse con Excel.
- Revisar manualmente los campos de texto libre; los filtros automáticos de
  cadenas con apariencia de RUN **no garantizan anonimización**.

## 5. Navegadores, accesibilidad y usabilidad
- Probar Chromium, Firefox y Safari en sistemas disponibles, incluido celular
  físico cuando corresponda; verificar anchos pequeños y texto ampliado.
- Navegar solo mediante teclado; comprobar orden de foco, textos de etiquetas,
  errores y estados informados correctamente.
- Evaluar con lector de pantalla y al menos una persona usuaria de tecnología
  de asistencia o con un protocolo de pruebas de accesibilidad independiente.
- Ejecutar `test-pgce-browser-smoke-2027.cjs` con reglas axe-core WCAG A/AA,
  sin interpretar esta prueba como certificación integral de accesibilidad.

## 6. Criterio de salida
Se podrá **proponer** un piloto supervisado únicamente si la batería de GitHub
Actions aprueba en el commit candidato, se completan los ensayos humanos en
entorno aislado, los problemas críticos se resuelven y las personas autorizadas
del establecimiento verifican los antecedentes institucionales.

**No publicar ni fusionar automáticamente.** El paso a producción exige una
autorización nueva y explícita, revisión de resguardos de datos, respaldo y
plan de reversión. La revisión del Consejo Escolar y el acto de Dirección son
eventos institucionales reales que la plataforma no debe simular ni sustituir.

## 7. Registro de ensayo sugerido
Anotar para cada caso: fecha, ID ficticio del establecimiento, perfil usado,
módulo, acción ejecutada, resultado esperado, resultado observado, evidencia
técnica sin datos personales, nivel de severidad, corrección aplicada y nueva
comprobación. No adjuntar capturas con identidades o credenciales reales.


## 8. Revisión jurídica-documental previa al uso con establecimientos

La Ley 21.809 de 2026, que modificó la Ley General de Educación, establece
funciones diferenciadas. El art. 16 D atribuye elaboración e implementación del
PGCE al equipo/coordinación de convivencia y su aprobación y dictación a
Dirección. El proceso participativo de actualización descrito en la misma reforma
prevé que Dirección presente un **informe** al Consejo Escolar, tramite sus
observaciones mediante acogida o rechazo fundado y, según corresponda, que el
Consejo apruebe el **informe**, seguido de la sanción del Plan por Dirección.
También contempla disposición del Plan a la comunidad en el plazo del
reglamento interno. El art. 16 G contempla información, difusión y constancia
de entrega de los instrumentos.

**Fuente jurídica para cotejo humano, versión normativa consultada:**
https://www.leychile.cl/navegar?idNorma=1222799

### Información que NO comprueba esta plataforma

- Que efectivamente se haya realizado la participación exigible en el tipo de
  actualización de que se trate (revisión participativa, adecuación anual u
  otra actualización).
- Que se presentara el informe pertinente, se formularan o contestaran
  observaciones y que el Consejo aprobara el informe cuando corresponda.
- Que el acto de Dirección haya sancionado válidamente el Plan.
- Que haya ocurrido la puesta a disposición, la difusión o entrega material
  con el plazo, canales y constancias requeridos.
- Que las referencias y fechas declaradas correspondan a documentos auténticos.

La sección `council_review` almacena **solo una referencia documental a la
revisión**, NO una declaración de aprobación del informe por el Consejo.
La sección `direction_act` almacena **solo la referencia a un acto declarado**,
NO una validación jurídica de sanción. No sustituir estos datos por indicadores
de cumplimiento legal. Antes del lanzamiento, el establecimiento y un
revisor competente deben decidir si el formulario requiere capturar las etapas
y evidencias adicionales de su procedimiento real. La lista automática del
piloto permanece informativa con `can_publish=false`.
