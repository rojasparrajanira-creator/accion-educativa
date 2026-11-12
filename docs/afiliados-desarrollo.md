# Vendedores y comisiones — informe de desarrollo y auditoría preliminar
Fecha: 12 de noviembre de 2026

**ESTADO: EN PRUEBAS. NO APTO PARA PUBLICACIÓN NI COBROS REALES SIN VALIDACIÓN.**

Rama aislada: `feature/vendedores-comisiones-2027`.
Base de producción: `convivencia-escolar`.
Todos los cambios quedan en la rama aislada; no se ha autorizado una fusión ni un despliegue.

## Reglas funcionales aprobadas
- Cada vendedor recibe código personal y enlace de la tienda oficial.
- Atribución: último enlace visitado en 30 días, o código escrito manualmente.
- La comisión es el 10% de cada ítem vendido, redondeado a pesos chilenos.
- Solo se genera comisión si la tienda verifica pago aprobado; nunca a partir del retorno del navegador.
- Vendedores sin acceso a la cuenta Mercado Pago ni a los archivos Drive.
- Transferencias manuales quincenales registradas por la superadministradora, con archivo de comprobante.
- Panel de vendedores con sesión privada y acceso exclusivamente a sus propios datos.
- El sistema admite distintos países, pero **los pagos en otras monedas todavía no están implementados**.

## Desarrollo en la rama
1. `convivencia-api/afiliados-schema.sql`: entidades y claves para vendedores, atribuciones únicas por pedido, comisiones únicas por ítem, sesiones y liquidaciones con respaldo en base de datos.
2. `convivencia-api/afiliados-core.js`: validaciones, regla de los 30 días y cálculo idempotente de las comisiones.
3. `convivencia-api/afiliados-api.js`: credenciales de vendedor, panel privado, altas/bajas, restablecimiento de clave, consultas por mes, pagos quincenales y conciliación.
4. `convivencia-api/server.js`: integra tablas en inicialización de la rama, captura atribución al pedido y registra comisión tras pago confirmado por Mercado Pago. Savepoints aíslan fallos de comisiones para **no bloquear cobro ni entrega**.
5. `tienda.html`: seguimiento del enlace en almacenamiento del mismo origen durante 30 días y código opcional en checkout con verificación visible.
6. `convivencia-escolar/admin-centro.html`: tarjeta de vendedores y comisiones.
7. `convivencia-escolar/admin-vendedores.html`: alta, estado, listado, reportes mensuales, detalle y evidencia de transferencias.
8. `convivencia-escolar/vendedor.html`: acceso mediante correo y clave, enlace propio, ventas y comprobantes propios.

## Verificación de lógica efectuada
Se ejecutaron nueve casos en un arnés de JavaScript aislado con datos simulados y todas las aserciones pasaron:
- normalización y rechazo de códigos inválidos;
- ventana de 30 días y rechazo de fechas futuras;
- atribución al último enlace válido;
- cálculo de comisiones en CLP;
- idempotencia en la repetición de confirmación del mismo ítem;
- rechazo de comisiones por pedidos sin pago;
- rechazo de comisiones sin vendedor;
- descuento de enlaces vencidos;
- atribución y cálculo de carrito con varios ítems.
Se comprobó sintaxis de módulos JavaScript y scripts de las dos pantallas.

**Limitación:** estas verificaciones de lógica no sustituyen `npm run test:afiliados` en un ambiente Node real, ni pruebas de esquema PostgreSQL, APIs con sesiones reales, conectividad de Mercado Pago, emails o entrega Drive.

## Hallazgos y controles de riesgo
- Un vendedor desactivado no puede iniciar sesión ni obtener nuevos pedidos atribuidos. Sus sesiones son revocadas.
- La vista de vendedor no recibe identidad ni correos de compradores. Los comprobantes se restringen al vendedor titular y a la superadministradora.
- El código de vendedor no modifica precios.
- La comisión no afecta la validez del pedido ni la confirmación del cobro.
- El panel puede conciliar pedidos pagados con comisiones faltantes y cancelar comisiones aún no liquidadas si el pedido está marcado reembolsado.
- **Riesgo pendiente:** contracargos/devoluciones posteriores al pago al vendedor requieren ajuste contable documentado; el sistema los informa pero no realiza recuperación automática.
- **Riesgo pendiente:** el estado `refunded` debe actualizarse de forma fiable desde Mercado Pago o mediante proceso autorizado, antes de una apertura comercial.
- **Riesgo pendiente:** confirmar con contadora tratamiento de boletas de honorarios, IVA, comisiones sobre base bruta o neta y vendedores extranjeros.
- **Riesgo pendiente:** validar cumplimiento de política de privacidad aplicable a la atribución local durante 30 días.
- **Riesgo pendiente:** almacenamiento de vouchers y credenciales, controles de concurrencia y respaldos ante pagos masivos necesitan auditoría real.

## Pruebas obligatorias antes de publicar
- Desplegar la rama en un entorno de desarrollo **independiente**, con PostgreSQL de prueba sin datos de clientes reales.
- Ejecutar migración SQL y `npm run test:afiliados`; probar login, bloqueo de intentos, CORS, autorización horizontal, y consulta por cada vendedor.
- Probar desde celulares una compra de carrito, enlace válido y código escrito; confirmar que la venta se atribuye al último enlace o código.
- Simular webhook de pago aprobado, denegado, repetido, atrasado, pago duplicado, devolución y fallos de base de datos.
- Probar que un error de comisiones no interrumpe pago, factura/boleta, correo ni entrega Drive.
- Verificar liquidación quincenal, evidencia, consulta de comprobantes y control de meses.
- Completar reconciliación de devoluciones después de transferir comisiones.
- Una vez superada la auditoría, **solicitar autorización expresa para efectuar una compra real controlada** (puede tener costo).
- Solicitar autorización de fusión y publicación en Render en un paso separado.

**Veredicto preliminar:** implementación avanzada en rama de desarrollo; no certificada para producción.
