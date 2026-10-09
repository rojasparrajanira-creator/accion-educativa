# Cuentas profesionales de Convivencia Escolar

Planes CLP por períodos de 30 días: hasta 300 estudiantes $12.990; hasta 500 $22.990; hasta 2.000 $35.990. Los montos se fijan en el servidor. Se exige RBD, nombre del establecimiento, nombre completo, RUT válido y correo del titular, lectura de privacidad y autorización explícita de cobro recurrente.

## Flujo

1. `planes.html` registra la solicitud y entrega un enlace personal de gestión. El token se almacena con hash en la base de datos; el enlace enviado por correo lo lleva en el fragmento, que la página retira al abrirse.
2. Transbank **Oneclick Mall de producción** inscribe la tarjeta y autoriza el primer cargo. El Webpay Plus de la tienda sigue separado y mantiene su configuración existente. Webpay Plus por sí solo no da autorización para cobros recurrentes.
3. El servidor verifica monto, orden, código de comercio, estado y código de respuesta. Un retorno del navegador no acredita un pago. Los intentos inciertos se consultan por la misma orden, sin otro cargo.
4. Pago aprobado: correos al titular y a la plataforma; estado pendiente de activación. En Centro Superadministrador → Suscripciones y solicitudes, **Activar cuenta** crea el establecimiento y su coordinador. No reutiliza otro establecimiento que tenga ese RBD.
5. La activación comienza los 30 días. Genera una clave aleatoria, guarda sólo salt/hash scrypt y la envía al correo registrado. Vence en 48 horas; el servidor exige reemplazarla en el primer ingreso. La clave definitiva no se devuelve en APIs ni se envía al administrador.
6. Cada 60 segundos el servidor consulta renovaciones vencidas. Una renovación tardía inicia 30 días desde su confirmación; no cobra períodos en que el acceso estuvo vencido. Una orden persistente por ciclo, un índice único y bloqueos en PostgreSQL evitan duplicaciones por reintentos o instancias simultáneas. El token de tarjeta se cifra; no se guardan PAN ni CVV.
7. Cancelar impide los próximos cargos y conserva el acceso hasta el fin del período pagado. El titular puede hacerlo desde Mi suscripción o mediante su enlace personal, incluso cuando el acceso institucional venció. Un pago cancelado antes de activarse queda señalado para revisión manual/devolución; no existe devolución automática.
8. Las solicitudes de recuperación no revelan si existe la cuenta. Notifican al coordinador o plataforma; previa comprobación de identidad, la administración emite una nueva clave por correo y revoca las sesiones anteriores.

## Configuración de producción en Render, servicio API

No activar cobros con credenciales de integración. Hasta completar esta configuración, las solicitudes se registran y el botón de pago permanece inhabilitado. El panel informa la disponibilidad sin mostrar secretos.

- `MEC_ONECLICK_MODE=production`
- `MEC_ONECLICK_COMMERCE_CODE`: código padre Oneclick Mall aprobado por Transbank.
- `MEC_ONECLICK_CHILD_COMMERCE_CODE`: código de comercio hijo aprobado.
- `MEC_ONECLICK_API_KEY`: llave API de producción correspondiente.
- `MEC_SUBSCRIPTION_ENCRYPTION_KEY`: secreto estable de cifrado. Si no se indica, usa `MEC_GOOGLE_TOKEN_ENCRYPTION_KEY`. No cambiarlo sin migrar los valores cifrados.
- `MEC_SUBSCRIPTION_RESEND_API_KEY` y `MEC_SUBSCRIPTION_FROM_EMAIL`: proveedor y remitente verificado. Admiten como respaldo `MEC_CONTACT_RESEND_API_KEY` y `MEC_CONTACT_FROM_EMAIL` ya existentes.
- `MEC_SUBSCRIPTION_NOTIFY_EMAIL`: destinatario de solicitudes, pagos y cancelaciones. Respaldo: `MEC_PLATFORM_ADMIN_EMAIL`; si falta, `accioneducativaspa@gmail.com`.
- Opcionales: `MEC_SUBSCRIPTION_WEB_ORIGIN` (por defecto `https://www.materialeducativochile.cl/convivencia-escolar`) y `MEC_SUBSCRIPTION_API_ORIGIN` (por defecto `https://convivencia-escolar-api.onrender.com`).

Retorno Oneclick: `https://convivencia-escolar-api.onrender.com/api/subscriptions/oneclick/return`. Confirmar con Transbank que el contrato y los códigos permiten Oneclick Mall y las autorizaciones recurrentes previstas. No sustituirlos por los códigos Webpay Plus de la tienda.

Los correos se guardan cifrados en una cola durable, reintentan fallos y borran el cuerpo tras enviarse. El panel permite reintentar y muestra cantidades pendientes. Una respuesta `email_queued` confirma cola, no entrega al destinatario. Las claves no se muestran en el panel.

La presentación de privacidad existente sigue siendo informativa. Antes del uso definitivo deben validarse responsables, finalidades, fundamento jurídico, conservación y atención de derechos. Las tablas de solicitudes, pagos y trazabilidad no tienen aún una política automática de depuración; fijarla conforme a obligaciones contractuales y legales. El cobro automático no está habilitado hasta disponer de los servicios de producción.

## Verificación local

`npm install` y `npm test`. Pruebas con PostgreSQL embebido y proveedores simulados: precios, validación, RBD duplicado, pago incierto/rechazado, retorno repetido, activación manual, correo cifrado y hash de claves, expiración de 48h, cambio obligatorio, revocación de sesiones, matrícula, renovaciones, cancelación, vencimiento institucional y acceso previo. No usan una tarjeta ni envían correos reales.
