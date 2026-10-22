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
