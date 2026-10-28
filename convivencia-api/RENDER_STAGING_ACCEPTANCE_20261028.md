# Validación autenticada en Render — Convivencia Escolar 2027
**Fecha de ejecución:** 28 de octubre de 2026. **Estado:** PILOT_SELFTEST PASSED en Render (entorno aislado, sin datos reales).

## Infraestructura validada
- Servicio gratuito Docker independiente: `srv-dbgtpll9fdbs73d2keug`
- Panel Render: https://dashboard.render.com/web/srv-dbgtpll9fdbs73d2keug
- URL de staging: `https://convivencia-postgres-e2e-aislado-20261028.onrender.com`
- Rama de fuente: `staging/convivencia-render-aislado-20261028`, autoDeploy **desactivado**.
- Imagen: `convivencia-api/Dockerfile.render-isolated` (PostgreSQL 18 Alpine + Node).
- PostgreSQL inicializado en `/tmp/convivencia-pg-temporal`, sólo `127.0.0.1:5432`. **Sin persistencia entre reinicios**.
- La API permite acceso únicamente por `localhost`; peticiones externas reciben 404. No es un panel público para usuarios.
- Clave de piloto generada aleatoriamente en la propia instancia, sin copiar ni mostrar secretos comerciales.
- Sin `DATABASE_URL` externa, sin cuentas reales, sin credenciales de pago ni correo.
- Comprobaciones de seguridad: entrega comercial = `no`; modo Webpay = `integration`; email de suscripciones = `no`; Oneclick en producción = `no`.

## Evidencias
- Render Live: desplegado commit `9a1740027dec0bfa65b68db94f2516c93abffb24`.
- Log Render: `CONVIVENCIA_POSTGRES_ISOLATED`, `Convivencia API ready with PostgreSQL` y `PILOT_SELFTEST PASSED` (28-10-2026 11:32:06 UTC).
- Recorrido de la API real, con sesión y cookie HTTP: `pilot_session`, `auth_scope`, `bulk_import`, `measurement_configured`, `bulk_assignment`, `student_completion`, `results_review`, `pgce_task`, `tasks_notifications`, `cases_protocols`, `resources`, `audit` y controles negativos de seguridad.
- GitHub Actions: job `PostgreSQL real, login aislado y límite 512 MB` con `RENDER_DOCKER_POSTGRES_STAGING_PASSED`, que verifica también aislamiento HTTP externo.
- Producción de Convivencia web y API compartida se mantuvo en commit `c5536dfa501b354aeb6653679300f561fec756aa` sin despliegue ni cambios.
- Ninguna base de la tienda, IDPS, JBR ni PostgreSQL de Convivencia producción fue reutilizada.

## Incidencia resuelta con alternativa gratuita
Render rechazó la creación de una segunda base Postgres gratuita porque la cuenta ya tenía una. Se preparó inicialmente un servicio gratuito Node con PGlite: `srv-dbgtmgei0phs738ushu0`, pero excedió 512 MB y **no está operativo**. No se actualizó ni migró a un plan pagado. Debe revisarse y eliminarse ese servicio fallido desde Render Dashboard para evitar recursos innecesarios; este conector no dispone de una acción de eliminación.
El contenedor PostgreSQL real funcionó dentro de 512 MB, primero en GitHub Actions y luego en Render.

## Alcance y próximos controles
- Esto acredita el flujo **autenticado API** con datos ficticios **dentro de Render**. No demuestra todavía una sesión de una persona usando la interfaz real conectada a este staging: el acceso externo está bloqueado deliberadamente.
- Las pruebas visuales de navegador y generación de PDF/RTF siguen validadas con API simulada en CI, no sobre este servicio de staging.
- Antes de clientes reales: aprobar contratos de encargado/responsable, base jurídica y privacidad de menores, matriz de retención, recuperación/backups, pruebas de interfaz autorizadas, monitoreo y cobros de suscripción en entorno comercial separado.
- **No fusionar esta rama en `convivencia-escolar` sin un plan de publicación**: la API de tienda comparte el despliegue de producción. El staging gratuito es efímero y no debe cargarse con datos reales.
