# IDPS Suscripciones: staging aislado (16 octubre 2026)

## Recursos gratuitos creados
- Web service: idps-suscripciones-pruebas (Free), rama test/idps-suscripciones-staging-20261016, autoDeploy desactivado.
- PostgreSQL: idps-suscripciones-pruebas-db (Free), Oregon, Postgres 17. Vence el 15 de noviembre de 2026.
- No se modificó IDPS Gestión ni datos reales de estudiantes, informes ni establecimientos.

## Seguridad
- Cobros inactivos: IDPS_BILLING_ENABLED=false.
- Acceso privado: sin STAGING_ACCESS_PASSWORD ninguna persona puede abrir las páginas de staging (responden 401).
- Cualquier URL de base de datos distinta de idps_suscripciones_pruebas_db es rechazada al iniciar.
- Credenciales de Mercado Pago de producción (APP_USR) son rechazadas: solo se permitirán tokens de prueba (TEST-).
- /health informa disponibilidad sin datos personales ni secretos.
- No agregar un cron ni activar servicios de pago durante staging.

## Paso pendiente: asociar la base a staging
La conexión a Render disponible para ChatGPT no devuelve el Internal Database URL que contiene contraseña, por lo que esta configuración debe hacerse por el propietario sin compartir la URL.
1. Abrir la [base de datos gratuita](https://dashboard.render.com/d/dpg-db97l1rl550s73d1r3gg-a).
2. Menú Connect -> copiar Internal Database URL, que no debe compartirse en el chat.
3. Abrir [web de staging](https://dashboard.render.com/web/srv-db97n7bl550s73d233vg) -> Environment -> Add variable.
4. KEY: DATABASE_URL; VALUE: URL interna de la base anterior.
5. Agregar una segunda variable STAGING_ACCESS_PASSWORD con una contraseña larga elegida por la persona titular, sin compartirla.
6. Comprobar IDPS_BILLING_ENABLED=false y pulsar Save, rebuild, and deploy EN staging.
7. Verificar https://idps-suscripciones-pruebas.onrender.com/health: databaseConnected true, paymentsEnabled false.

## Condiciones de prueba posterior
- Usar únicamente cuentas, tarjetas, correos y RBD ficticios.
- Nunca pegar la Access Token de producción en este servicio; cuando corresponda utilizar la credencial TEST del proveedor.
- Antes de habilitar cualquier checkout: probar con Mercado Pago frecuencia exacta de 30 días, aprobación/rechazo, renovación, devolución, contracargo, correos y cancelación.
- No habilitar cobros reales ni fusionar la rama de trabajo con main hasta completar las pruebas.
- Render Free está sujeto a cuota compartida de horas, ancho de banda y minutos de compilación; revisar Billing > Monthly Included Usage para evitar cargos por exceso de uso.
