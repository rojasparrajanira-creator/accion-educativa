# Propuestas de acciones a partir del diagnóstico 2027 — piloto

**Estado:** desarrollo en rama, sin datos reales y sin activar en LIVE. Este módulo continúa el adaptador agregado estudiantil M1–M3 y las encuestas adultas (PR #21, #20 y #19).

## Qué hace

- Interpreta **diez áreas temáticas** del prediagnóstico institucional que ya pasó umbral de protección estadística.
- Sugiere **una orientación inicial por dimensión** cuando hay alguna fuente agregada admisible, y **ninguna** cuando faltan fuentes suficientes.
- Relaciona la dimensión con las letras a–g del artículo 16 D de la Ley 21.809 y distingue resultados que requieren indagación contextual de posibles fortalezas a observar.
- Incluye título tentativo, finalidad, idea de actividad, preguntas para reunión técnica y códigos de fuentes agregadas.
- El panel `convivencia-escolar/diagnostico-dimensiones-pgce-2027.html` muestra estas orientaciones bajo el encabezado **«Posibles acciones para revisión profesional»**.
- La API `GET /api/community-surveys/pgce-scaffold?school_year=2027&measurement_code=M1|M2|M3`, restringida a profesionales, incorpora `suggested_actions`. Nunca revela las respuestas individuales que originaron los agregados.

## Lo que NO hace (indispensable para interpretar correctamente)

- No reemplaza un análisis con actas, registros, observaciones, participación comunitaria y contexto institucional.
- No convierte bandas de percepción en un diagnóstico clínico, una categoría disciplinaria o una comprobación legal.
- No inventa meta, línea base, encargado, cronograma, lugar, recursos ni evidencia de ejecución.
- No modifica automáticamente el Plan, ni crea intervenciones aplicadas, ni permite aprobación automática de Dirección.
- Las recomendaciones para dimensiones FORM, GEST y FAM se fundamentan en instrumentos de personas adultas; **no se atribuyen a estudiantes**, cuyos instrumentos no contemplan directamente esas áreas.
- NT1/NT2 no se incorporan al cálculo hasta completar revisión pedagógica y pruebas de comprensión con la comunidad autorizada.
- Las bandas por M1/M2/M3 y nivel **no se mezclan** y no equivalen a puntajes oficiales Agencia/DIA/SIMCE.

## Próxima fase para plan operativo

1. Convertir cada orientación elegida y revisada en un **hallazgo institucional aprobado por equipo profesional**, con al menos dos fuentes cuando proceda.
2. Implementar editor del Plan: objetivo/estrategia, meta, línea base, indicadores, actividades, responsables, calendario, lugar, recursos, vinculación PEI/PME/RIE, redes y evidencias.
3. Registrar versiones de trabajo, revisión participativa y Consejo Escolar, aprobación exclusiva de Dirección, difusión y actualización.
4. Agregar seguimiento M1/M2/M3 por acción e historial auditable de ajustes, sin mezclar casos privados en el documento exportable.
5. Realizar pruebas de seguridad, permisos y privacidad con datos ficticios, revisión profesional y posteriormente piloto real autorizado.

Los archivos de esta etapa son `pgce-action-candidates-2027.cjs`, pruebas unitarias/HTTP y extensión de la vista de dimensiones. **No habilitar la variable `MEC_COMMUNITY_SURVEYS_ENABLED` en producción** antes de completar fases legales, de autenticación e identidad de apoderados.
