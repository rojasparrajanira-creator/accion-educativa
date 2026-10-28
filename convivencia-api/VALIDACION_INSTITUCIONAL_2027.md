# Convivencia Escolar 2027 · Validación institucional y condiciones de lanzamiento

**Preparado el 27 de octubre de 2026. Estado:** matriz de aceptación, no constancia de habilitación comercial. Mantener en una rama de prueba hasta verificación completa. **Tienda Material Educativo Chile, Mercado Pago de tienda, correos de compradores, Drive, JBR e IDPS fuera de alcance.**

## 1. Ensayo técnico automatizado (PostgreSQL PGlite, sin producción)

| Prueba de aceptación | Evidencia esperada | Bloquea lanzamiento si falla |
|---|---|---|
| Acceso de Superadministración a alta institucional | Sólo `platform_admin` puede crear establecimiento | Sí |
| Alta de dos establecimientos sintéticos | Dos RBD `TEST-CI-A` / `TEST-CI-B` únicos, sin datos de menores | Sí |
| Reintento de alta con el mismo RBD | HTTP 409, no crea otra institución | Sí |
| Coordinador de convivencia | Cuenta generada con rol restringido, sin exponer hashes de contraseña | Sí |
| Clave inicial | Cambio obligatorio antes de entrar a módulos académicos | Sí |
| Invalidación de sesión provisional | Sesión previa deja de ser válida después de cambiar clave | Sí |
| M1, M2, M3 del año escolar | Todas creadas **en borrador**, sin aplicación automática | Sí |
| Primera matrícula | Sin estudiantes en alta institucional nueva | Sí |
| Aislamiento de colegios | A no puede consultar estudiantes, cursos, aplicaciones, mediciones ni resultados de B | Sí |
| Inventario de privacidad | Denegado a coordinadores y usuarios anónimos | Sí |
| Cobro recurrente | No crear suscripciones ni cobrar durante el alta manual sintética | Sí |

Las pruebas se ejecutan con PGlite dentro de GitHub Actions, sin cuentas institucionales reales, pagos ni mensajes salientes.

## 2. Validación que sigue pendiente en una sesión controlada

**No se considera probada en producción** por el ensayo automatizado anterior. Antes de cargar información real se necesita, en entorno adecuado y autorizado:

1. Un establecimiento **de prueba** separado de clientes, con nombre y correo ficticios/seguros, sin usar estudiantes identificables.
2. Verificar inicio de sesión, cambio de contraseña, roles, recuperación y MFA de la cuenta maestra.
3. Revisar creación de cursos y carga SIGE con **datos totalmente ficticios** y seis niveles educativos.
4. Simular asignación de encuestas y recorridos M1–M2–M3, incluyendo saltos de fecha local `America/Santiago`.
5. Visualizar informes individuales, por curso e institucionales. Confirmar supresión de grupos pequeños, exportación Word RTF y PDF, trazabilidad y revisión profesional.
6. Probar protocolos, tareas, notificaciones, evidencias y seguimiento PGCE con ejemplos no reales.
7. Comprobar aislamiento entre colegios en cada sección y trazabilidad profesional.
8. Validar la activación, suspensión, renovación y baja de suscripciones **sin efectuar pagos reales** hasta disponer de credenciales comerciales y autorización específica.

## 3. Protección de datos y contratos: puertas de salida antes de vender a establecimientos

| Decisión / documento | Estado | Responsable a definir |
|---|---|---|
| Identificar responsable del tratamiento y encargados por contrato con el establecimiento | Pendiente | Titular del servicio + institución |
| Finalidad, legitimación del tratamiento, minimización y aviso comprensible para familias | Pendiente | Institución y asesoría jurídica |
| Condiciones especiales para datos de menores, autonomía progresiva y autorizaciones cuando corresponda | Pendiente | Institución y asesoría jurídica |
| Matriz de retención por categoría y procedimiento verificable de supresión/anonimización | Pendiente | Institución + encargado |
| Atención y trazabilidad de derechos de acceso, rectificación y supresión, con identidad verificada | Pendiente | Responsable del tratamiento |
| Gestión de incidentes, respaldo, control de acceso y deber de confidencialidad | Pendiente de revisión contractual | Responsable + encargado |
| Condiciones de subencargados y transferencias internacionales, cuando corresponda | Pendiente | Operador + asesoría |
| Prueba autenticada y de rendimiento con establecimiento ficticio, sin datos reales | Pendiente | Equipo técnico |
| Correos de suscripción y credenciales de cobro recurrente de Convivencia | Pendiente | Administración comercial |

**Regla de seguridad:** no incorporar matrículas reales hasta resolver las condiciones relevantes del tratamiento y completar los controles técnicos. No activar procesos de borrado automático ni inventar períodos de retención.

## 4. Referencias verificadas

- **Ley 19.628**, régimen vigente hasta el 30 de noviembre de 2026: https://www.bcn.cl/leychile/Navegar?idNorma=141599 .
- **Ley 21.719**, régimen con entrada en vigencia el **1 de diciembre de 2026**, modificada según su versión oficial: https://www.bcn.cl/leychile/Navegar?idNorma=1209272&idVersion=2026-12-01 .
- **Artículo 16 quáter** (redacción con vigencia diferida): tratamiento de datos personales de niños, niñas y adolescentes, interés superior, autonomía progresiva y condiciones especiales de consentimiento con excepciones legales. No se debe asumir que la mera venta de un producto acredita la base legal de tratamientos escolares.

Documento operativo; requiere revisión especializada antes de utilizarlo como política definitiva.

## 5. Protección de la tienda durante pruebas

- Sólo modificar archivos `convivencia-api/test-*.cjs` y documentación técnica propia de Convivencia.
- Ejecutar GitHub Actions para validar; **no fusionar ni desplegar automáticamente** mientras la API de tienda y Convivencia compartan servicio Render.
- Antes de cualquier publicación, revisar diff completo, estado de despliegues, mecanismo de rollback y una ventana de bajo impacto.
- No realizar pruebas de compra en producción, modificar pasarelas, correos, productos ni permisos Drive.
