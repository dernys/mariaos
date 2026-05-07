# Plan de Implementación: Mejoras Operativas Integrales

## 1. POS - Pagos Parciales/Completos + Asientos Contables

**Objetivo:** Habilitar pago parcial/total siempre que se seleccione cliente o empleado, y generar asientos contables automáticos.

- Modificar `PaymentDialog.tsx`:
  - Forzar habilitación del modo "Pago Parcial" cuando hay `customer_id` o `employee_id` seleccionado.
  - Permitir capturar monto pagado < total → registra venta con `status = 'partial'` y agrega saldo pendiente al balance del cliente/empleado (ya cubierto por trigger `apply_sale_credit_balance`).
  - Soportar múltiples métodos de pago (split) en una misma venta.
- Crear función SQL `post_sale_journal_entry(p_sale_id)` que genere asiento contable doble:
  - Débito: Caja/Bancos/Cuentas por cobrar (según método)
  - Crédito: Ventas + Impuestos
  - Insertar en `accounting_entries` y `accounting_entry_lines`
- Trigger `AFTER INSERT` en `sales` para invocar automáticamente.
- Análogamente para compras: `post_purchase_journal_entry(p_purchase_id)`.

## 2. Historial de Turnos + Vista Detallada

- Refactorizar `Turnos.tsx`:
  - Tabla con todos los turnos (abierto/cerrado), filtros por fecha, cajero, tienda, estado.
  - KPIs globales: ventas totales, diferencias de caja promedio, turnos del día.
- Nueva ruta `/turnos/:id` → `TurnoDetalle.tsx`:
  - Header con datos del turno (apertura, cierre, cajero, tienda).
  - Tabs: Resumen (usa `calculate_shift_summary`), Ventas del turno, Movimientos de efectivo (in/out), Devoluciones, Pagos por método.
  - Gráficos de ventas por hora.
- Optimizar apertura/cierre:
  - Apertura: validar que no haya turno activo del mismo cajero/tienda.
  - Cierre: usar `close_shift_with_summary` con confirmación visual de diferencia, exigir nota si difiere > umbral.

## 3. Inventario - Filtros Optimizados

- En `Inventario.tsx`: añadir filtros combinados por almacén/tienda, categoría, estado de stock (normal/bajo/agotado), rango de stock, búsqueda por SKU/nombre/código.
- Usar `useTableState` con `filterFns` personalizados.
- Persistir filtros en URL params para compartir vistas.

## 4. Almacenes - Datos Reales

- En `Almacenes.tsx`:
  - Reemplazar conteo de productos por suma real desde `product_stock` (no desde `products.warehouse_id`).
  - Mostrar valor de inventario (stock × cost), productos con stock bajo, últimos movimientos.
  - Tarjeta con link al detalle por almacén → filtra inventario y movimientos.

## 5. Compras - Acciones y Pagos

- En `Compras.tsx`:
  - Acciones por compra: Recibir (RPC `receive_purchase`), Recibir consignación, Marcar pagada, **Pago parcial/total** (RPC `register_account_payment` con `reference_type='purchase'`), Cancelar, Editar.
  - Cambio de estado detallado: `draft → pending → received → paid` con validaciones.
  - Diálogo de pago multi-método (efectivo, transferencia, tarjeta, divisa) con conversión.
- Asiento contable automático al recibir compra (Inventario / Cuentas por pagar) y al pagarla.

## 6. Proveedores - Historial y Trazabilidad de Productos

- En `ProveedorDetalle.tsx`, completar tabs:
  - **Productos**: catálogo `supplier_products` con estado, costo, lead time, último ingreso.
  - **Trazabilidad**: por cada producto del proveedor, mostrar lotes ingresados (purchases + consignment_lots), cantidades vendidas, cantidades pagadas vs pendientes (consignment_settlements).
  - **Pagos pendientes**: lista de purchases con saldo + settlements pendientes; botón "Liquidar" usa `settle_consignment_lots` o `register_account_payment`.
  - **Historial completo**: timeline ya existente + log de compras, pagos y liquidaciones.

## Aspectos Técnicos

- **Migración SQL** (un solo archivo):
  - Tablas `accounting_entries`, `accounting_entry_lines` (si no existen, verificar).
  - Funciones `post_sale_journal_entry`, `post_purchase_journal_entry`.
  - Triggers para auto-generación.
- **Rutas nuevas**: `/turnos/:id` registrada en `App.tsx`.
- **Componentes nuevos**: `TurnoDetalle.tsx`, `PurchasePaymentDialog.tsx`, `SupplierProductsTab.tsx` (extraído de ProveedorDetalle).
- **Componentes modificados**: `PaymentDialog.tsx`, `Turnos.tsx`, `Inventario.tsx`, `Almacenes.tsx`, `Compras.tsx`, `Proveedores.tsx`, `ProveedorDetalle.tsx`.

## Orden de Ejecución

1. Migración SQL (asientos contables + helpers).
2. POS pagos parciales + asientos.
3. Turnos: lista mejorada + vista detalle + apertura/cierre.
4. Inventario filtros.
5. Almacenes datos reales.
6. Compras acciones + pagos.
7. Proveedores trazabilidad y liquidaciones.
