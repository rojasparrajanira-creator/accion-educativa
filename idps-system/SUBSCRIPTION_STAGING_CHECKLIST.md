# IDPS · Prueba integral de suscripciones Mercado Pago

**Ambiente: exclusivamente PRUEBAS / STAGING. No habilitar cobros reales.**
**Estado al 16-10-2026:** Webhook de simulación firmado probado; las pruebas automatizadas del código de suscripciones, renovaciones, cancelación y disputas finalizaron correctamente. Falta validar el servicio de Suscripciones con los usuarios y credenciales de prueba reales de Mercado Pago.

## Barreras obligatorias
- Mantener la rama `feature/idps-boton-pago-mensual-20261015` separada de `main` y sin fusionar.
- No desplegar este módulo en el servicio público `idps-gestion-material-educativo` hasta completar el checklist.
- `IDPS_BILLING_ENABLED=false` en producción (interruptor de seguridad).
- Staging: base de datos **vacía y aislada**, con RBD/correos totalmente ficticios. Nunca copiar tablas o registros de estudiantes.
- Utilizar solamente credenciales de **prueba** en el servicio de staging, nunca un Access Token de producción.
- Usar únicamente cuenta comprador de prueba y tarjeta de prueba; no ejecutar cobros reales ni guardar PAN/CVV.
- No compartir claves en ChatGPT, repositorios, capturas ni registros de despliegue; mantener variables privadas en Render.
- Para notificaciones de pruebas, el receptor actual `idps-webhook-pruebas` solo verifica firmas y **no** activa suscripciones. La integración final requiere un callback propio en el entorno aislado de IDPS: `POST /webhooks/mercadopago/subscriptions`.
- Renovar la clave de Webhooks antes de utilizar producción, pues su valor se mostró parcialmente en una captura anterior.
- Si hay dudas sobre si la prueba de Suscripciones genera un cargo real, **detener la ejecución** hasta confirmar entorno y credenciales.

## Pruebas obligatorias
| Caso | Acción | Resultado esperado |
| --- | --- | --- |
| 01 | Abrir `/pago-mensual` con `IDPS_BILLING_ENABLED=false` | CTA de vincular tarjeta inactivo; página informa que pagos no están habilitados. |
| 02 | Abrir staging con credenciales de prueba y habilitación explícita | La pantalla informa $15.000 CLP cada 30 días y solicita consentimiento inequívoco. |
| 03 | Crear preapproval `pending` con correo y RBD ficticios | Redirección HTTPS al checkout de Mercado Pago. No activación anticipada. |
| 04 | Autorizar tarjeta de prueba y recibir confirmación | IDPS contrasta estado, monto, moneda y periodicidad directamente con API. Solo entonces extiende 30 días. |
| 05 | Intentar pago rechazado/pendiente | No extiende vigencia ni crea acceso aprobado. |
| 06 | Reenviar Webhook de pago aprobado varias veces | Se conserva una sola factura/ciclo; sin duplicación de días ni correos repetidos. |
| 07 | Enviar Webhook inválido o de otra aplicación | Respuesta 401; no cambiar datos de la institución. |
| 08 | Cancelar mediante enlace del email de prueba | Mercado Pago confirma status `canceled`; no hay renovaciones futuras. Se preserva plazo ya pagado. |
| 09 | Enviar un aviso tardío después de cancelar | No reactiva la suscripción cancelada. |
| 10 | Simular reembolso/contracargo para un pago validado | Señal en `idps_billing_disputes`, sin borrar informes ni encuestas. Revisión manual obligatoria. |
| 11 | Provocar una falla SQL durante renovación | Rollback íntegro, repetición segura del evento; no extiende dos veces el acceso. |
| 12 | Invocar recordatorio con cron autenticado cuando faltan tres días | Envío de un solo correo por ciclo. |
| 13 | Validar el intervalo de cobro nativo de Mercado Pago en Chile | Confirmar aceptación de `frequency: 30` + `frequency_type: days` y cómo se calcula el próximo vencimiento; no sustituir por mensualidad calendario sin aprobación comercial. |
| 14 | Revisar la política de devoluciones, suspensiones y reintentos | Procedimiento definido antes del lanzamiento. |
| 15 | Verificar privacidad y control de acceso | Solo responsable autorizado ve RBD/correo/estado; nunca datos de tarjeta, alumnos ni secretos. |

## Preparación y comandos de control local/CI
```sh
cd idps-system
npm install --ignore-scripts
npm run qa:monthly-payment
node --check server.js
node --check subscription-billing.js
```
Los tests actuales utilizan respuestas simuladas de Mercado Pago: no crean suscripciones reales ni cobran dinero.

## Monitoreo y salida a producción
- Configurar correo transaccional verificado (Resend), alertas para errores y reintentos idempotentes de envío.
- Programar revisión de renovaciones y cron de recordatorios; sin ello no se emitirán los avisos anticipados.
- Probar notificaciones `subscription_preapproval`, `subscription_authorized_payment` y, si aplica, `payment`, en el entorno real de prueba de Suscripciones.
- Mantener un registro de resultado por escenario con fecha, responsable, resultado y evidencia **sin secretos ni datos personales**.
- Validar reembolsos y contracargos con revisión humana y criterio explícito sobre acceso institucional.
- Rotar claves, aislar Webhooks productivos, validar el enlace público HTTPS y configurar copias de seguridad.
- Aprobar revisión legal/comercial de cargos recurrentes y cancelación.
- Solo después de todo lo anterior: revisión de código y fusión de PR, despliegue controlado y activación explícita de `IDPS_BILLING_ENABLED=true`.

## Referencias oficiales
- Pruebas de suscripciones: https://www.mercadopago.cl/developers/es/docs/subscriptions/integration-test/payment-approval
- API Suscripciones: https://www.mercadopago.cl/developers/es/reference/online-payments/subscriptions/overview
- Webhooks de Suscripciones: https://www.mercadopago.cl/developers/es/docs/links-and-debts/additional-content/your-integrations/notifications/webhooks
