# Módulo de vendedores por comisión — rama de desarrollo

**NO PUBLICAR NI FUSIONAR SIN AUTORIZACIÓN.** Rama `feature/vendedores-comisiones-2027`, independiente de `convivencia-escolar` (Render publica esta última).

Reglas acordadas: 10% de comisión, atribución por último enlace válido en 30 días, pago quincenal mediante transferencia manual de la superadministradora, vendedores sin acceso a Mercado Pago ni Drive.

## Preparado

- `convivencia-api/afiliados-schema.sql`: tablas separadas de vendedores, atribuciones por pedido, comisiones únicas por ítem y liquidaciones.
- `convivencia-api/afiliados-core.js`: validadores, cálculo CLP y función transaccional para registrar comisiones de pedidos pagados.
- `convivencia-api/afiliados-core.test.js`: pruebas unitarias de ventana, comisiones y duplicados.

## Pendiente antes de uso real

1. Integrar esquema al inicio del servidor en un entorno de pruebas, nunca directamente en producción.
2. Implementar flujo de afiliación seguro: `ref` en enlace, 30 días en el navegador, servidor verifica código activo y fecha, persiste una atribución por pedido en transacción.
3. Enlazar `recordPaidOrderCommissions` solo después de la confirmación verificada de Mercado Pago; manejar fallos sin bloquear entrega y permitir reconciliación segura.
4. Agregar tratamiento de devoluciones y contracargos, incluidos los posteriores a una liquidación.
5. Crear endpoints autenticados de vendedor con acceso solo a sus propios registros y endpoints del rol `platform_admin` para activar/desactivar, consultar y liquidar; definir método de alta y credenciales sin compartir.
6. Construir paneles y exportación CSV, estado de transferencias y conciliación.
7. Pruebas integradas, seguridad, carrera de notificaciones duplicadas, montos CLP y compra con carrito, revisión contable de base de comisión (total bruto vs neto, IVA) antes de habilitar.
8. Validar que `convivencia-escolar` y los servicios Render no se modificaron; solo entonces solicitar autorización expresa para integración gradual.

Los esquemas nuevos y código de esta rama todavía no están conectados a la tienda ni a producción.
