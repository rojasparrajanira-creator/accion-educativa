# Convivencia Escolar — matriz operativa de conservación de datos
**Versión de preparación: 27 de octubre de 2026.** Documento técnico en revisión. No reemplaza asesoría jurídica ni define plazos obligatorios.

## Estado normativo
La Ley 19.628 vigente regula hoy los datos personales en Chile. La Ley 21.719 modifica ese régimen **desde el 1 de diciembre de 2026**. En su principio de proporcionalidad dispone conservar los datos solo durante el período necesario para las finalidades y luego suprimir o anonimizar, con excepciones legales. Referencia oficial BCN: https://www.bcn.cl/leychile/Navegar?idNorma=1209272&idVersion=2026-12-01 .

**No existe un período de retención único aplicable indistintamente a respuestas de encuestas, casos de protección, expedientes, registros de seguridad y contratos.** Definir cada período exige evaluar finalidad, obligaciones legales sectoriales, derechos del titular, plazos de prescripción, necesidad probatoria, contractos de prestación, medidas de seguridad y eventuales órdenes de conservación.

## Matriz inicial para revisión de instituciones

| Conjunto | Finalidad | Responsable de decisión | Plazo / evento de cierre | Evaluaciones previas |
| --- | --- | --- | --- | --- |
| Matrícula / datos identificatorios de estudiantes | Gestión de aplicaciones, seguimiento y trayectorias | Por determinar entre institución y operador contractual | **No definido** | Reglas de matrícula, transferencias, vigencia y respaldos |
| Aplicaciones M1–M3 | Aplicaciones y trazabilidad de mediciones | Por determinar | **No definido** | Año escolar, vínculo con resultados y expedientes |
| Respuestas y resultados | Evaluación educativa y planificación | Por determinar | **No definido** | Necesidad de individualización, minimización y anonimización |
| Borradores | Continuidad operativa de encuestas | Por determinar | **No definido** | El código ya implementa limpieza de borradores tras vencimiento de medición; revisarla sin ampliar plazos arbitrariamente |
| Casos / protocolos y actuaciones | Protección, seguimiento y evidencia | Por determinar | **No definido** | Restricciones legales, medidas de protección vigentes, expediente y posibles retenciones obligatorias |
| Intervenciones y registros PGCE | Gestión y evaluación institucional | Por determinar | **No definido** | Evidencias, rendición y revisión profesional |
| Auditoría profesional | Seguridad, responsabilidad y debido proceso | Por determinar | **No definido** | Trazabilidad, seguridad, acceso restringido e integridad |
| Notificaciones profesionales | Coordinación y avisos | Por determinar | **No definido** | Utilidad posterior y minimización |

## Circuito de una solicitud de acceso, rectificación, supresión u oposición

1. Registrar solicitud con **folio interno**, fecha, medio de recepción, categoría y alcance. Nunca publicar datos de menores en un panel público.
2. Verificar identidad y representación de la persona que solicita, con mecanismo proporcional. **No enviar listados por correo sin comprobación del destinatario.**
3. Determinar quién actúa como **responsable** y quién como **encargado**, conforme a contratos y finalidad real del tratamiento; derivar al responsable competente cuando corresponda.
4. Revisar si existe deber de conservación, expediente abierto, medida de protección, reclamo o bloqueo legal. Documentar fundamento, decisión y autorización institucional.
5. Preparar exportación segura o supresión/anonimización evaluada con copia de seguridad, dependencias de base de datos, réplicas y registros de auditoría.
6. Ejecutar solo mediante procedimiento aprobado y registrado, con prueba de recuperación y supervisión. Dejar evidencia de resultado y comunicación segura.
7. Revisar las solicitudes de terceros, accesos compartidos, copias locales y plazos de respaldos.

## Control técnico incorporado
- **GET /api/platform/privacy-inventory**, exclusivo de `platform_admin`, devuelve únicamente cantidades y primeras/últimas fechas disponibles por categoría.
- No consulta tablas de tienda, pagos, compradores, Drive, JBR ni IDPS.
- No entrega nombres, RUT, respuestas individuales, token de sesión ni identificadores de estudiantes.
- No hay endpoint de borrado ni proceso nuevo de supresión o anonimización. Cualquier operación futura debe exigir autorización, respaldo y pruebas específicas.
- El panel `admin-plataforma.html` presenta el inventario y marca todos los plazos **pendientes de definición**.
- El inventario no cubre automáticamente todas las copias, archivos descargados, terceros, respaldos, dispositivos o proveedores. Deben auditarse aparte.

## Pendientes obligatorios antes del lanzamiento comercial
- Aprobar matriz por categoría, plazo y evento inicial de cómputo (sin números inventados).
- Acordar funciones del responsable/encargado y contratos con instituciones.
- Documentar base jurídica, información a familias, derechos y seguridad reforzada de menores.
- Definir procedimientos de bloqueo, supresión/anonimización verificable y respaldo.
- Revisar acceso autenticado y exportación con un establecimiento ficticio en Render.
- Verificar la configuración de correo y Oneclick por separado; la tienda de materiales permanece fuera de alcance.
