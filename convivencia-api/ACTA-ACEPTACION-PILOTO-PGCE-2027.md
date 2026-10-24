# Acta de aceptación del piloto — Plataforma de Convivencia Educativa 2027

**Documento de trabajo para evaluación humana. No es un acto administrativo ni prueba de cumplimiento de Ley 21.809.**

Versión del software (SHA): __________________________  
Fecha y entorno **aislado** de pruebas: __________________________  
Establecimiento **ficticio** utilizado: __________________________  
Responsable técnico: __________________________  
Profesional de convivencia que evalúa: __________________________  
Perfil directivo evaluador: __________________________  
Revisor/a de privacidad: __________________________  
Evaluador/a de accesibilidad: __________________________

> **Condición indispensable:** no usar cuentas, RUN, nombres, expedientes, fotografías, registros de estudiantes ni documentos institucionales reales en el entorno de ensayo. Anotar solamente referencias técnicas sintéticas y resultados. No distribuir capturas con credenciales.

## 1. Matriz de aceptación UAT

Por cada caso anotar **Pasa / Falla / No probado**, fecha, referencia de evidencia ficticia y observación. No declarar “Pasa” si no se ejecutó con la función y el perfil indicados.

| ID | Responsable / perfil ficticio | Acción y resultado observable | Resultado | Evidencia ficticia |
|---|---|---|---|---|
| UAT-01 | Coordinación de convivencia | Abrir el diagnóstico M1; muestra áreas agregadas sin respuestas individuales | ______ | ______ |
| UAT-02 | Coordinación | Guardar borrador incompleto; marca trabajo pendiente y no aprobación | ______ | ______ |
| UAT-03 | Coordinación | Agregar 2 acciones del mismo apartado 16D; IDs diferentes persisten tras recarga | ______ | ______ |
| UAT-04 | Coordinación | Registrar M1, M2 y M3 para ambas acciones; avances no se mezclan | ______ | ______ |
| UAT-05 | Coordinación | Intentar sobrescribir una revisión obsoleta; sistema responde conflicto y conserva la última | ______ | ______ |
| UAT-06 | Perfil sin autorización | Intentar leer y editar plan; acceso denegado | ______ | ______ |
| UAT-07 | Establecimiento ficticio B | Buscar acciones y referencias del A; no puede acceder a ellas | ______ | ______ |
| UAT-08 | Coordinación | Registrar referencia **sintética** de informe presentado al Consejo Escolar; no se certifica aprobación del informe | ______ | ______ |
| UAT-09 | Coordinación (no directiva) | Intentar registrar acto de Dirección; acceso denegado | ______ | ______ |
| UAT-10 | Directora/director ficticio | Sin antecedente del Consejo de la misma versión, no puede registrar referencia del acto | ______ | ______ |
| UAT-11 | Directora/director ficticio | Con antecedente del Consejo y borrador completo, registra referencia del acto sin que el software se declare certificador | ______ | ______ |
| UAT-12 | Coordinación | Modificar el borrador; las referencias de revisión anteriores quedan desactualizadas | ______ | ______ |
| UAT-13 | Coordinación | Descargar CSV sin revisión de privacidad; descarga denegada | ______ | ______ |
| UAT-14 | Coordinación | Revisar contenidos colectivos y registrar privacidad; CSV autorizado solo para esa revisión; al editar, se bloquea nuevamente | ______ | ______ |
| UAT-15 | Revisor/a de privacidad | Abrir CSV ficticio: no contiene RUN, nombres, respuestas individuales ni fórmulas ejecutables | ______ | ______ |
| UAT-16 | Evaluador/a de accesibilidad | Navegar con teclado únicamente: foco visible, etiquetas entendibles, errores comunicados | ______ | ______ |
| UAT-17 | Evaluador/a con lector de pantalla | Evaluar anuncios de estado, títulos, campos, listas y descarga; consignar problemas, sin asumir cumplimiento por axe | ______ | ______ |
| UAT-18 | Responsable del piloto | Probar en dispositivo físico, incluyendo Safari iOS o Android según disponibilidad; verificar 320–390px y texto ampliado | ______ | ______ |
| UAT-19 | Equipo de convivencia | Revisar lista del piloto: distingue registro documental de aprobación jurídica, y nunca habilita producción | ______ | ______ |
| UAT-20 | Revisor/a documental competente | Cotejar con el régimen aplicable: proceso participativo, presentación y tratamiento de informe/observaciones, aprobación del informe por Consejo cuando corresponda, acto de Dirección y difusión/entrega | ______ | ______ |

## 2. Revisión documental y normativa humana

El software **no** acredita que exista un acta auténtica ni que la referencia `council_review` equivalga a una aprobación del informe. Tampoco autentica firmas, comprueba facultades o produce por sí mismo el acto de Dirección.

La Ley 21.809 distingue la responsabilidad del equipo de convivencia en la elaboración/implementación del Plan (art. 16 D), la aprobación y dictación por Dirección, y los procesos de actualización participativos (art. 16 H), con aprobación del informe por el Consejo Escolar y posterior sanción del Plan cuando corresponda. El artículo 16 G regula información, entrega y constancia de recepción de instrumentos. Las exigencias concretas deben cotejarse con la forma de actualización del establecimiento y su reglamento interno.

**Fuente a revisar en su versión vigente:** https://www.bcn.cl/leychile/navegar?idNorma=1222799

No cargar al piloto documentación real para efectuar esta revisión: registrar aquí únicamente **“revisado fuera del sistema / pendiente”**.

## 3. Registro de incidencias

| ID | Caso UAT | Severidad crítica / alta / media / baja | Descripción sin datos personales | Responsable | Nueva comprobación |
|---|---|---|---|---|---|
| INC-01 | ______ | ______ | ______ | ______ | ______ |
| INC-02 | ______ | ______ | ______ | ______ | ______ |
| INC-03 | ______ | ______ | ______ | ______ | ______ |

Las incidencias críticas o altas abiertas impiden recomendar el piloto. No se debe considerar “No probado” como aprobado.

## 4. Resultado humano de la evaluación

**Condiciones mínimas para proponer piloto institucional supervisado:**

- [ ] GitHub Actions exitoso para **el SHA candidato**, sin saltarse ensayos.
- [ ] Todas las pruebas UAT críticas ejecutadas y superadas; sin incidencias críticas ni altas abiertas.
- [ ] Protección de datos revisada, textos y evidencias sin identificadores reales, responsables definidos.
- [ ] Accesibilidad probada mediante personas/equipos y tecnologías de asistencia disponibles.
- [ ] Revisión documental/jurídico-administrativa externa al sistema concluida por personal competente.
- [ ] Alcance del piloto, responsables, duración, soporte y reversión revisados.
- [ ] Autorización **explícita y separada** para activar un entorno piloto aislado si se propone.
- [ ] Autorización **explícita y posterior** antes de fusionar, activar la bandera o desplegar a Render LIVE.

**Dictamen del piloto (solo humano):** [ ] Aceptación condicionada para prueba aislada  [ ] Requiere correcciones  [ ] Rechazado  [ ] No evaluado

Observaciones y condiciones: _____________________________________________

Profesional evaluador/a: __________________ Fecha: __________  
Revisor/a de privacidad: __________________ Fecha: __________  
Responsable de Dirección: __________________ Fecha: __________

**Este documento no sustituye ni constituye la sanción del Plan de Gestión de Convivencia Educativa por Dirección.**

### Evidencia de pruebas automáticas (referencial)

Las pruebas de código, PGlite, Playwright y axe-core son evidencias técnicas y no reemplazan los casos UAT humanos. Consignar ID/URL y resultado GitHub Actions del SHA realmente evaluado; no reutilizar una ejecución de una versión anterior del software.
