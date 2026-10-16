# Mercado Pago · Webhooks de prueba IDPS

Entorno temporal de recepción para **probar la autenticidad de notificaciones** sin realizar cobros, acceder a tarjetas, activar cuentas ni tocar la base de datos de IDPS.

## Render

- Servicio: `idps-webhook-pruebas`
- URL: `https://idps-webhook-pruebas.onrender.com`
- Comprobación: `GET /health` o `GET /status`
- Recepción: `POST /webhooks/mercadopago`
- Plan: gratuito, branch `test/idps-webhook-mercadopago-20261016`, autoDeploy apagado
- Arranque: `node idps-webhook-test/server.js`

## Pasos para completar prueba segura

1. Desde Mercado Pago Developers, aplicación **Material educativo chile IDPS**, entrar en **Webhooks > Configurar notificaciones > Modo de prueba**.
2. URL para prueba: `https://idps-webhook-pruebas.onrender.com/webhooks/mercadopago`.
3. Seleccionar **Planes y suscripciones** y verificar en documentación si también corresponde seleccionar **Pagos (legacy)** para obtener las notificaciones de cobro.
4. Guardar la configuración **solamente en modo de prueba**; Mercado Pago crea/revela una **clave de firma** para esa configuración.
5. En Render, abrir el servicio aislado **idps-webhook-pruebas**, NO `idps-gestion-material-educativo`; ir a **Environment** y agregar `MP_WEBHOOK_TEST_SECRET` con la clave de firma de **prueba**. No compartir ni publicar esa clave.
6. Guardar y desplegar este servicio de prueba. Confirmar que `GET /health` muestre `configured: true` y `chargesEnabled: false`.
7. Usar el **simulador de notificaciones** de Mercado Pago en Modo de prueba, con **Planes y suscripciones**; revisar en `GET /status` si `receivedVerified` aumentó y `lastVerifiedTopic` cambió.
8. Si Mercado Pago rechaza la simulación con HTTP 401, revisar sin revelar secretos si `x-signature`, `x-request-id` y `data.id` siguen el formato esperado; no deshabilitar validación de firmas.

## Seguridad y límites

- Sin `MP_WEBHOOK_TEST_SECRET`, el receptor responde HTTP 503 a notificaciones (falla segura).
- Las solicitudes con firma inválida se rechazan; no se guardan payloads ni IDs de pagos.
- El contador es volátil en memoria, se reinicia después de despliegues.
- Esto **no prueba aún el flujo real de cobros**. Solo valida conectividad y firmas de Webhooks.
- No usar esta URL de pruebas ni la clave de prueba en el **Modo productivo**.
- La documentación oficial de algunas integraciones indica que Suscripciones puede requerir notificación configurada al crear el recurso: antes de producción revisar con la documentación de la API de Suscripciones y validar los eventos recibidos realmente.
- La rama de producción `main`, la matrícula y las claves `MERCADOPAGO_ACCESS_TOKEN` de producción no se modifican.

## Pruebas de CI

```sh
node --check idps-webhook-test/server.js
node --test idps-webhook-test/test-webhook.js
```

## Consulta desde el navegador

Si se abre la URL del receptor directamente en el navegador (método GET), presenta el mismo estado que `/health` y `/status`, en vez de mostrar `not_found`. Esto **no** simula un aviso real, ni genera un pago. Si el estado muestra `configured: false`, falta guardar `MP_WEBHOOK_TEST_SECRET` en Environment **del servicio de prueba**, no en la aplicación IDPS principal.

## Verificación de conectividad

La prueba automática consulta desde GitHub Actions la URL pública y comprueba el estado `configured` sin leer ni exponer el secreto. Esta comprobación no activa cobros, no edita variables de entorno y no despliega la API de producción.
