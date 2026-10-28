# Convivencia Escolar 2027 — revisión de habilitación profesional
**Fecha:** 28 de octubre de 2026. **Alcance:** solo plataforma Convivencia, sin alterar tienda, IDPS ni JBR.

## Criterios técnicos y estado
| Etapa | Situación |
|---|---|
| Prueba de API autenticada con PostgreSQL temporal en Render | Aprobada con estudiantes y establecimientos ficticios; no equivale a uso real de la interfaz |
| Informes individuales, curso e institucionales en Chromium | Aprobados con API simulada; pendiente conectarlos de extremo a extremo al backend de staging |
| Roles de coordinación, dupla, profesor y asistente | Pruebas de aislamiento incorporadas en esta rama; requieren validación CI |
| Encuestas, importación, asignación, resultados, casos y PGCE | Recorrido HTTP ficticio aprobado en Render |
| Suscripciones comerciales de Convivencia | Pendientes credenciales y autorización de cobro, sin reutilizar cobros ni datos de la tienda |
| Correo automático de cuentas de Convivencia | Pendiente configurar remitente y verificar entrega de mensajes de prueba |
| Política de datos de estudiantes, respaldos, conservación y responsabilidades | Pendiente de aprobación jurídica/institucional, sin eliminación automática |
| Prueba de navegador con usuario autorizado y API real aislada | Pendiente |
| Prueba de rendimiento y recuperación con datos ficticios | Pendiente |

## Próximo circuito de aceptación
1. Ingresar con usuario profesional ficticio de un establecimiento de prueba.
2. Validar acceso según rol: coordinación, dupla, profesor y asistente.
3. Cargar matrícula ficticia, asignar una encuesta y registrar respuestas simuladas.
4. Generar los tres informes; validar descarga PDF, Word RTF y ocultamiento de agregados pequeños.
5. Verificar seguimiento PGCE, tareas, auditoría y casos, sin datos reales.
6. Verificar que no exista acceso a otro establecimiento.
7. Revisar correos y suscripciones en un entorno sin cobros reales.
8. Documentar respaldo y recuperación y aprobar política de datos personales antes de clientes.

## Resguardo de sistemas existentes
No fusionar esta rama hasta terminar pruebas. No alterar productos ni pedidos ni la API comercial, Mercado Pago, Google Drive, plataformas IDPS y JBR. El servicio de staging validado en Render tiene una base PostgreSQL temporal y despliegue automático desactivado; su URL no habilita acceso público a datos por diseño. Los resultados de prueba nunca deben confundirse con matrículas reales.

Referencias técnicas: PR #41 (staging HTTP autenticado), PR #39 (informes en Chromium) y documentación `PRIVACIDAD_CONVIVENCIA.md`.
