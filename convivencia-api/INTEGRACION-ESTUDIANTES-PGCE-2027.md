# Integración de encuestas estudiantiles al diagnóstico / PGCE 2027

**Estado:** integración funcional en rama de pruebas, DESACTIVADA en la plataforma LIVE. Sin consultar bases productivas. Fecha: 22 de octubre de 2026.

## Qué se conecta
Se leen exclusivamente **aplicaciones completadas** de los seis instrumentos actuales:
- 1.º–2.º básico; 3.º–4.º básico; 5.º–6.º básico;
- 7.º–8.º básico; I.º–II.º medio; III.º–IV.º medio.

Se utilizan únicamente los códigos positivos `D01_XX` a `D16_XX` de la sección **core** de cada instrumento. Las categorías `EXP`, `OBS`, `DIG`, `PRO`, `BIE`, escenarios o acontecimientos concretos NO se fusionan con los ítems core, pues requieren interpretación y resguardo distinto. Las dieciséis dimensiones de los ítems core se relacionan temáticamente con las diez áreas institucionales en `pgce-dimensions-integrated-2027.cjs`.

**NT1 / NT2 siguen pendientes.** Existe un prototipo separado, no validado pedagógicamente, que no se conecta a este adaptador ni se interpreta automáticamente.

## Período y nivel
Las solicitudes a `/api/community-surveys/dimensions` y `/api/community-surveys/pgce-scaffold` deben incluir ambos parámetros:

`?school_year=2027&measurement_code=M1`

`measurement_code` solo admite `M1`, `M2` o `M3`. No se mezclan mediciones ni años ni los seis niveles: los resultados se identifican por nivel y período. La medición debe corresponder a una aplicación completada y al establecimiento de la cuenta profesional, en un año 2027.

## ¿Qué significa la banda presentada?
Cada instrumento tiene una escala distinta. La banda describe la **proporción orientativa de respuestas favorables** sobre los ítems positivos de cada área, dentro de un mismo nivel y medición:
- 1.º–2.º básico: `Sí` = 3 en escala No / A veces / Sí.
- 3.º–4.º básico: `Muchas veces` o `Siempre` = 3–4 en escala de cuatro opciones.
- 5.º–6.º básico en adelante: `Casi siempre` o `Siempre` = 4–5 en escala de cinco opciones.

Las bandas publicadas son `0–24 %`, `25–49 %`, `50–74 %` y `75–100 %`. No son diagnósticos de estudiantes, puntajes oficiales, ni índices psicométricos validados. **NO** comparar porcentajes entre los seis niveles ni convertir esta cifra en una calificación global. Los ítems son orientativos y una dimensión puede incluir diferente cantidad de preguntas; el equipo profesional debe contextualizar el resultado.

## Confidencialidad y aislamiento
El SQL en `student-dimensions-adapter-2027.cjs`:
1. Aplica el identificador de establecimiento de la sesión profesional **a los estudiantes y a la medición**.
2. Solo incluye aplicaciones `completed`, estudiantes `active`, año 2027 y período explícito `M1/M2/M3`.
3. Agrupa en PostgreSQL: `survey_level` × dimensión institucional.
4. Suprime directamente desde SQL grupos con menos de **10 estudiantes distintos** o 10 respuestas válidas.
5. La salida interna contiene únicamente conteos agregados para **revalidar los umbrales**, nunca RUN, nombres, ID de alumno o respuestas individuales.
6. `buildDimensionReport` transforma los resultados nuevamente, suprimiendo los recuentos exactos en la respuesta HTTP. El frontend muestra únicamente áreas y disponibilidad.

Las dimensiones de familias, docentes, asistentes y directivos siguen basadas en un banco y una escala independientes; no se promedian con las respuestas estudiantiles.

## Reglas para estructurar el PGCE
El módulo `buildPgceScaffold` sigue generando exclusivamente la estructura de siete componentes obligatorios (art. 16 D Ley 21.809), con objetivos, metas, fechas, responsables e indicadores vacíos y **estado de borrador incompleto**. Los agregados pueden orientar el diagnóstico, pero la evidencia mixta, la participación real, las propuestas del Consejo Escolar y la aprobación por Dirección siguen siendo tareas institucionales humanas. Ni la plataforma ni el adaptador pueden certificar cumplimiento jurídico.

## Aún pendiente
- Revisión de consistencia y comprensión de los instrumentos por nivel; pruebas de campo.
- Validación de NT1/NT2, y posterior instrumento o metodología apropiada para párvulos.
- Revisión metodológica de tasas de respuesta, cobertura y posible sesgo de selección: presentar participación efectiva por nivel cuando se disponga de datos agregados confiables y resguardados.
- Definir garantías de privacidad contra ataques diferenciales por varias mediciones, informes repetidos y tamaños pequeños.
- Completar edición versionada de hallazgos, metas, acciones, actas, evidencias, cronograma M1/M2/M3 y aprobación humana del Plan.
- Preparar un piloto de aplicación real únicamente después de establecer roles, finalidad de tratamiento, política de datos y garantías institucionales.

## Pruebas automatizadas
`node --test test-student-dimensions-adapter-2027.cjs test-community-surveys-2027.cjs`

Cobertura de datos **ficticios en PostgreSQL aislado**, con grupos de 9 y 10, escalas 3/4/5, años, mediciones, estados de finalización, aislamiento de colegios y prohibición de publicar datos individuales. **No se ha probado con datos reales ni se ha desplegado**.

## Etapa adicional: edición profesional del borrador institucional

En la rama de prueba se incorporó una **cola de revisión de señales agregadas** al objeto
`dimensions.review_queue`. Sus referencias identifican únicamente instrumentos e
ítems agregados; su propósito es permitir que el equipo profesional contraste
antecedentes antes de redactar un hallazgo. No asigna prioridades, necesidades,
intervenciones, responsables ni metas automáticamente.

El portal de diagnóstico ahora permite:
- Registrar, modificar o quitar hallazgos **redactados por un profesional**, asociados a una dimensión y a referencias documentales.
- Editar acciones de los siete apartados (16 D, letras a–g), sus objetivos, destinatarios por curso, estrategias, metas, indicadores, fechas, recursos y evidencias.
- Asociar cada acción a hallazgos registrados por el profesional.
- Guardar un borrador anual **por establecimiento y año escolar 2027**, sin fusionar las mediciones estudiantiles M1, M2 y M3.
- Recuperar el borrador guardado en `GET /api/community-surveys/pgce-scaffold?school_year=2027&measurement_code=M1`, o con M2/M3 para consultar la evidencia del período seleccionado.

La ruta **`PUT /api/community-surveys/pgce-draft?school_year=2027`** admite
`{ "expected_revision": 0, "draft": { ... } }` para guardar por primera vez y
posteriormente requiere la revisión devuelta por el servidor. Una revisión antigua
recibe **409** y no sobrescribe cambios; se recomienda recargar para reconciliar.
Solo pueden guardar perfiles profesionales autorizados y pertenecientes al mismo
establecimiento. Se exige origen confiable y se aplica control de tamaño, estructura,
enlaces a hallazgos, y rechazo de patrones reconocibles de RUN. El sistema no puede
garantizar por sí solo que un texto libre esté libre de datos personales; la
institución debe capacitar y supervisar a quienes lo redactan.

Persistencia opt-in en `community-surveys.sql`:
- `community_pgce_drafts_2027`: plan anual versionado por establecimiento.
- `community_pgce_draft_audit_2027`: bitácora de revisiones guardadas,
  usuario autorizado y fecha, sin duplicar el contenido completo en el registro
  de auditoría.

**Importante:** el campo `director_approval` permanece en `null` y un intento de
aprobación por API se rechaza. `can_publish` y `can_certify_compliance` son
**false**. Las actas del Consejo Escolar, la participación real, el contexto, y
el acto formal de Dirección se deben registrar y verificar por vías institucionales
autorizadas antes de cualquier publicación. Este desarrollo no constituye
certificación normativa.

### Pruebas de esta etapa

Se agregaron casos para el guardado/relectura del borrador, control de revisión,
aislamiento entre establecimientos, prevención de acceso no autorizado, rechazo
de autoaprobación, exclusión de un RUN reconocible en el texto, vínculos a hallazgos,
y edición por curso. Se añadió la prueba
`test-pgce-planning-drafts-2027.cjs` al workflow opt-in.

**Estado de validación:** la sintaxis de los archivos JavaScript modificados se
comprobó mediante análisis de JavaScript, y el validador de datos superó comprobaciones
puntuales aisladas. La ejecución completa de GitHub Actions y las pruebas HTTP con
PGlite siguen pendientes de confirmación. No activar en producción ni aplicar
migraciones a la base real hasta completar la revisión y la autorización.

## Seguimiento manual M1 / M2 / M3 e información institucional del Plan

Etapa incorporada en la rama de pruebas, sin activación en Render.

### Información institucional editable
El editor de la pantalla `convivencia-escolar/diagnostico-dimensiones-pgce-2027.html`
permite completar la identificación institucional, articulación con PEI/PME/RIE,
participación por estamento, referencias a fuentes, Consejo Escolar, difusión y
método de seguimiento. Se siguen guardando como **borrador profesional** en
`community_pgce_drafts_2027`, con revisión optimista y auditoría de guardado.
Los campos de aprobación de Dirección siguen bloqueados (`null`).

### Avance periódico de acciones
Cada una de las siete acciones de la estructura 16D puede tener un registro
independiente por M1, M2 y M3 en
`community_pgce_action_followups_2027`, con:
- Estado manual: pendiente, en ejecución, completada, reprogramada o suspendida.
- Avance porcentual informado por un profesional (no calculado desde encuestas).
- Referencias a evidencias documentales, observación y justificación de ajustes.
- Revisión y fecha del último guardado, con historial mínimo en
  `community_pgce_followup_audit_2027`.

**Reglas técnicas:** solo por establecimiento de la sesión autorizada,
año 2027, siete letras del artículo 16 D, cortes M1/M2/M3 por separado.
Es necesario haber guardado una acción con nombre en el borrador anual.
No se admiten aprobaciones automáticas; solo se admiten referencias agregadas.
El control sintáctico de RUN no equivale a una prevención total de datos
personales en textos libres.

`GET /api/community-surveys/pgce-followup?school_year=2027`
devuelve únicamente los avances del establecimiento de la sesión.
`PUT /api/community-surveys/pgce-followup?school_year=2027` guarda
`{ "expected_revision": 0, "followup": { "clause": "c",
"measurement_code": "M1", "status": "in_progress", "progress_percent": 25,
"evidence_refs": ["ACTA-2027-01"], "professional_note": "",
"adjustment_note": "" } }`.

La revisión cero corresponde al primer guardado; posteriormente se requiere
la revisión informada por el servidor. Si el registro fue actualizado por otra
persona, se devuelve 409 sin sobrescribir. Un seguimiento nunca genera una
aprobación del plan.

### Pruebas de esta etapa
`test-pgce-follow-up-2027.cjs` verifica entradas, separación de períodos,
versiones y conflicto, aislamiento entre colegios, control de profesional
autorizado, evidencias referenciales y ausencia de aprobación automática.
`test-community-surveys-2027.cjs` comprueba el mismo recorrido en las rutas
HTTP de prueba. `test-pgce-screen-2027.cjs` inspecciona el formulario.

**Estado:** cambios guardados solo en GitHub, con sintaxis JavaScript verificada
a nivel estático. Las pruebas de PostgreSQL, HTTP extremo a extremo, revisiones
de seguridad, validación pedagógica y GitHub Actions deben completarse y
confirmarse antes de cualquier fusión, activación de la bandera o publicación.
