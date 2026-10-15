# Botón de pago mensual IDPS

## Alcance
- El ingreso institucional incorpora «Pagar mensualidad · IDPS» y la ruta pública `/pago-mensual`.
- La página muestra un plan mensual, con precio de lanzamiento `$16.990 CLP` (configurable).
- El cobro se delega a un **plan de suscripción recurrente** de Mercado Pago creado en la cuenta comercial; nunca se capturan tarjetas en IDPS.
- Si falta el enlace, la página indica que el cobro no está habilitado y permite solicitar acceso. No redirige a enlaces inventados.
- Se conserva el proceso existente de solicitud, revisión manual y entrega de credenciales. Este cambio no toca matrícula, encuestas, informes, cuentas ni base de datos.

## Configuración de Render (solo después de verificar el plan)
1. En la cuenta comercial de Mercado Pago, crear un **Plan de suscripción** IDPS con cargo **mensual recurrente** por el mismo monto publicado; NO usar un Link de pago único.
2. Guardar en las variables de entorno del servicio Render que despliega `idps-system`:
   - `IDPS_MONTHLY_SUBSCRIPTION_URL`: enlace HTTPS generado del Plan de suscripción de Mercado Pago.
   - `IDPS_MONTHLY_AMOUNT_CLP`: `16990` (o el precio realmente aprobado).
3. Comprobar en entorno de prueba que el enlace lleva al comercio correcto, muestra el precio exacto y habilita la periodicidad correcta; comprobar con transacción de prueba y política de cancelación antes de habilitar cobro productivo.
4. Confirmar el pago en la cuenta comercial antes de aprobar el acceso institucional. Asociar correo y RBD del establecimiento.
5. La cancelación de una suscripción se tramita mediante la cuenta/portal de Mercado Pago del pagador; documentar esto en el correo de alta.

## Limitaciones que deben resolverse antes de activación/suspensión automatizada
Esta integración mediante enlace **no recibe webhooks, no concilia automáticamente pagos con RBD y no suspende ni renueva el acceso a IDPS**. No se debe asumir que un visitante de la página pagó por visitar el enlace, ni activar/suspender usuarios en base a parámetros de retorno. Para automatizar esos procesos se requiere una integración de servidor con webhooks validados, conciliación de pagos, estados de suscripción y controles de vigencia. Mientras tanto, la aprobación se mantiene manual y nunca se eliminan datos por falta de pago.

## QA
```bash
cd idps-system
npm run qa:monthly-payment
node --check server.js
```
