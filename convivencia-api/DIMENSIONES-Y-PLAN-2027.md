# Etapa 2027 — dimensiones integradas y estructura PGCE

**Estado:** rama experimental separada; NO desplegada. Resultados reales de estudiantes todavía no integrados. Desarrollo basado en datos sintéticos para las pruebas. Actualización 22-10-2026.

## Dimensiones transversales (banco propio, no oficial)
Se mapearon los códigos **D01–D16** de las seis encuestas estudiantiles existentes, **una sola vez** cada uno, hacia las mismas diez dimensiones de los 77 ítems de estamentos adultos.

| Código | Dimensión | Ítems estudiantiles |
|---|---|---|
| SEG | Seguridad y protección | D01, D04, D13 |
| RESP | Buen trato e inclusión | D02, D03, D07, D16 |
| ORG | Normas y ambiente organizado | D05 |
| CONF | Gestión colaborativa de conflictos | D06, D14 |
| PAR | Participación y pertenencia | D08, D09 |
| BIE | Bienestar y desarrollo socioemocional | D10, D11, D12 |
| DIG | Ciudadanía digital y prevención | D15 |
| FORM | Información y formación | Sin preguntas estudiantiles directas: se complementa con estamentos adultos y evidencia documental |
| GEST | Coordinación y seguimiento institucional | Estamentos adultos y fuentes documentales |
| FAM | Relación y formación de familias | Familias, profesionales y participación documental |

**Importante:** la clasificación de preguntas es temática, NO supone que las diez dimensiones sean indicadores oficiales o que sus bandas sean comparables psicométricamente. Las escalas de respuesta según etapa etaria no se promedian entre sí. Especialmente NT1/NT2 tienen un prototipo **no validado** y todavía no deben mezclarse con encuestas de enseñanza básica o media.

## Relaciones con Plan de Gestión
El módulo `pgce-dimensions-integrated-2027.cjs` relaciona cada dimensión con las **siete áreas de contenido del artículo 16 D** de la Ley 21.809 (letras a–g), con guías para preparar acciones y con el prevalidador editorial existente.

El resultado `buildPgceScaffold` contiene:
- **Siete secciones** de planificación, una por letra a–g.
- Dimensiones asociadas, estado de fuentes y temas por analizar con profesionales.
- Campos de objetivos, estrategias, acciones, responsables, fechas, indicadores, línea base, metas, recursos y evidencias **deliberadamente vacíos**, para que el establecimiento los complete con hallazgos revisados.
- Estados `structure_only_not_an_approved_plan` y `draft_incomplete` con lista de campos faltantes.
- **No** autoriza publicar, certificar cumplimiento ni reemplazar Consejo Escolar / Dirección.

## APIs de prueba con autorización profesional
- `GET /api/community-surveys/dimensions?school_year=2027`: diez dimensiones y disponibilidad de resultados **agregados de adultos** por establecimiento.
- `GET /api/community-surveys/pgce-scaffold?school_year=2027`: matriz y estructura editable de Plan de Gestión 2027 pendiente de complementación/aprobación.
- Ambos requieren perfil autorizado y que `MEC_COMMUNITY_SURVEYS_ENABLED=1`. **No** aceptan por HTTP indicadores estudiantiles no validados.
- Pantalla de visualización `convivencia-escolar/diagnostico-dimensiones-pgce-2027.html`: lee solo informes agregados y no lista RUN, nombres o respuestas personales.

## Pruebas y resguardos
GitHub Actions prueba:
- Correspondencia única D01–D16 y coincidencia de áreas con los 77 ítems adultos.
- Cobertura temática de artículo 16 D a–g.
- No revelación de nombres, RUN ni respuestas individuales.
- Exclusión de segmentos de estudiantes con menos de diez personas o sin marca de verificación de agregación.
- Separación de colegios y permisos de profesionales en HTTP con PostgreSQL ficticio.
- Imposibilidad de presentar la estructura como plan aprobado, con elementos obligatorios pendientes.
- Sintaxis y contenido de la pantalla profesional.

## Próximas tareas, **no realizadas**
1. Diseñar y revisar un **adaptador de agregados estudiantiles real**, compatible con los seis instrumentos actuales, con umbral de privacidad y normalización por nivel/escala. El método privado `verifiedStudentAggregate` acepta exclusivamente agregados verificados, pero las rutas públicas **no** los reciben. Para NT1/NT2 se requiere revisión pedagógica previa de la escala.
2. Registrar fuentes mixtas (encuestas, observaciones, actas, asistencia, protocolos y participación), contextualizando necesidades y evitando inferencias clínicas.
3. Incorporar la edición y persistencia versionada del Plan por rol, trazabilidad hallazgo → objetivo → acción → calendario → responsable → evidencia → evaluación. Permitir aprobación solo a Dirección después del circuito de participación formal.
4. Exportar informe y expediente de fiscalización en documentos, respetando confidencialidad, fines de tratamiento y supresión de celdas pequeñas.
5. Validar el piloto con una comunidad educativa autorizada, revisar normas específicas y recién entonces evaluar habilitación en producción.

**No se ha alterado la plataforma LIVE, las bases de datos productivas ni se han aplicado instrumentos a menores.**