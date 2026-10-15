# IDPS · Suscripción con tarjeta y aviso de renovación

> **Desarrollo en borrador. No activar cobros ni fusionar hasta completar pruebas reales de Mercado Pago y revisión de seguridad.**

## Contrato comercial
- Precio: **$15.000 CLP cada 30 días**.
- La persona responsable ingresa su RBD y correo, acepta expresamente la suscripción y **vincula su tarjeta solo en Mercado Pago**.
- Mercado Pago realiza el cobro automático según el intervalo de 30 días definido en la solicitud (`frequency:30, frequency_type:'days'`). **Confirmar esta periodicidad específica para Chile con una suscripción de prueba antes de habilitar producción.**
- Aviso de renovación previsto hasta 3 días antes del próximo cargo y correo después del cargo aprobado.
- El cliente dispone de un enlace de cancelación mediante correo registrado. La cancelación evita nuevos cobros y conserva el acceso ya pagado por su vigencia; los datos académicos no se eliminan.
- Nunca exponer datos de tarjetas ni credenciales de pago al navegador o al repositorio.

## Dónde obtener las credenciales
1. Acceder con la **cuenta comercial** a https://www.mercadopago.cl/developers/panel/applications
2. Crear/seleccionar la aplicación para **IDPS · Material Educativo Chile**.
3. Abrir **Credenciales de prueba** para testear y **Credenciales de producción** solo después de verificar el flujo.
4. Copiar el **Access Token** solo al servidor, nunca a este chat, correo, logs, ni archivo público.
5. Revisar los mecanismos disponibles para las **notificaciones de Suscripciones**: la documentación oficial distingue esos eventos de los Webhooks generales. Validar el mecanismo real de notificación, la firma si corresponde, y el enlace/URL de callback compatible con la API del comercio.

## Variables de entorno del servicio Render correcto
- `MERCADOPAGO_ACCESS_TOKEN`: token privado del entorno seleccionado.
- `MERCADOPAGO_WEBHOOK_SECRET`: firma secreta si el método de Webhooks verificados está disponible para la integración seleccionada.
- `IDPS_BILLING_CRON_SECRET`: secreto aleatorio largo para autorizar revisión diaria.
- `RESEND_API_KEY` y `RESEND_FROM`: remitente verificado para avisos de renovación/cancelación.
- `PUBLIC_URL`: URL HTTPS pública de **IDPS gestión**.
- `DATABASE_URL`: Postgres del servicio IDPS, con respaldo antes del despliegue.
- `IDPS_MONTHLY_AMOUNT_CLP=15000`: precio mostrado en el frontend (la lógica de cobro requiere coincidir).

La preparación anterior debe realizarse en **Environment** del servicio correcto en Render y jamás en GitHub.

## Revisión de lanzamiento pendiente
- Probar creación de suscripción, autorización de tarjeta, cobro inicial aprobado, cobro rechazado, renovaciones, cancelaciones, avisos por correo y enlaces de un solo usuario.
- Comprobar cómo Mercado Pago entrega notificaciones de suscripciones en Chile y registrar una URL operativa. La recepción de notificaciones aún no está validada.
- Verificar pago asociado a RBD/correo antes de renovar o suspender cuentas, con pruebas de concurrencia, duplicados y reintentos.
- Configurar una tarea programada (Cron) que llame al endpoint `POST /internal/subscriptions/renewal-notices` con `x-billing-cron-key`; el módulo no envía avisos de forma autónoma sin este proceso.
- Revisar compatibilidad con los datos de suscripciones existentes y el mecanismo de expiración real.
- No fusionar ni configurar tokens productivos hasta aprobar pruebas funcionales de extremo a extremo.

## Calidad automatizada
```bash
cd idps-system
npm install --ignore-scripts
npm run qa:monthly-payment
node --check server.js
node --check subscription-billing.js
```
