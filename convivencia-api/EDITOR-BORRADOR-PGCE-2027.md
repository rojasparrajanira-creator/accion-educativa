# Editor profesional PGCE 2027 — borrador versionado (piloto)

**Estado:** código en rama de pruebas. Sin despliegue LIVE ni datos reales. Depende del piloto de instrumentos adultos, adaptador de agregados estudiantiles y propuestas por dimensiones de las ramas previas.

## Flujo operativo

1. El profesional autorizado consulta el diagnóstico integrado M1/M2/M3 y revisa dimensiones con datos agregados suficientes. La pantalla de diagnóstico enlaza con `convivencia-escolar/editar-plan-pgce-2027.html`.
2. El editor recupera por API la **versión actual del Plan para su establecimiento**. Si no existe, recibe una plantilla vacía con los siete apartados de la Ley 21.809, sin responsables, fechas ni metas inventadas.
3. El equipo identifica hallazgos institucionales con respaldo, registra fuentes del diagnóstico, participación de estamentos y Consejo Escolar, articula PEI/PME/RIE/Política Nacional, completa acciones con metas e indicadores, recursos y calendario anual.
4. Al guardar se genera un número de revisión nuevo. Si otra persona guardó después, la API devuelve **409 revision_conflict** y la aplicación no sobrescribe el trabajo ajeno.
5. Las revisiones quedan registradas con fecha y actor. El verificador editorial indica campos faltantes y advierte que la información no equivale a una certificación.
6. **No existe endpoint de aprobación ni publicación automática**. El campo `director_approval` se mantiene en `null`; cualquier intento del cliente de completarlo es rechazado.

## Protección de datos y acceso

- El módulo se instala y registra **solo** con `MEC_COMMUNITY_SURVEYS_ENABLED=1`. Esta bandera sigue apagada en LIVE.
- Todas las consultas y guardados requieren perfil profesional autorizado y usan exclusivamente el `establishment_id` de la sesión autenticada.
- El POST exige origen autorizado por la política CORS/CSRF del portal, y no admite el nombre o RBD del establecimiento enviados por el usuario como fuente válida.
- Se limita el tamaño de los textos, listas y referencias; se rechazan RUN y correos en textos y claves ajenas al esquema. Esto **no garantiza** ausencia total de datos personales; cada institución debe revisar las entradas y su política de privacidad.
- Los documentos y referencias se guardan para uso interno del equipo autorizado; todavía falta diseñar los permisos granulares por acción, corrección/borrado, retención y generación de expediente exportable.
- La API entrega el historial de números de revisión sin incluir documentos completos en la respuesta de listado, y controla concurrencia con una transacción SQL.

## Pruebas automatizadas

`convivencia-api/test-pgce-draft-editor-2027.cjs` comprueba con Express + PGlite:
- carga del Plan vacío y sus siete apartados;
- roles permitidos y perfil sin autorización;
- origen ajeno en solicitudes POST;
- modificación del Plan, guardado, revisión histórica y recuperación;
- conflicto por revisión antigua, sin sobreescribir;
- separación de dos colegios ficticios;
- rechazo de aprobación falsa, claves ajenas al esquema y RUN;
- ausencia de publicación automática y persistencia de `draft_incomplete`.

También se comprueba la sintaxis de la pantalla y la navegación desde el diagnóstico.

## Lo que falta antes de usar en colegios

1. Revisar los instrumentos y la comprensión de NT1/NT2; completar resguardos de identificación de apoderados, permisos, avisos y retención de datos.
2. Incluir evidencias adjuntas autorizadas, gestión de responsables reales y seguimiento de metas/acciones con registros institucionales.
3. Agregar flujo humano y auditable de revisión del Consejo Escolar, resolución de Dirección, difusión y control de versiones aprobadas.
4. Exportar el expediente institucional de forma verificable y con datos personales protegidos.
5. Probar todo el circuito en un entorno de ensayo independiente con personal autorizado y revisar la reglamentación vigente antes de activarlo.

**No afirmar que el programa garantiza cumplimiento normativo o que el Plan queda aprobado por completar campos.** La matriz de verificación es una ayuda editorial sujeta a criterio profesional, realidad institucional y fiscalización oficial.
