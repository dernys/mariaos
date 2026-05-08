## Plan de acción: Impuestos configurables, pagos en compras y mejoras transversales

### 1. Sistema de impuestos unificado y configurable

**Estado actual:** existe `tax_rates` y `ConfigTaxRates`, pero los módulos usan tasas hardcoded o sólo el % global de POS. Compras guarda un total `tax` plano sin elegir tasa.

**Cambios:**
- Añadir columna `tax_rate_id uuid` (nullable) a `purchases`, `sales`, `invoices`, `products` (impuesto por defecto del producto).
- Hook nuevo `useTaxRates()` que lista las tasas activas del tenant y expone la default.
- `ConfigTaxRates`: ya permite CRUD; añadir badge "en uso" y prevenir eliminar tasas referenciadas (soft-deactivate).
- Vincular selector de impuesto en:
  - **POS** (`POSBar`, `POSRestaurant`, `POSEmpresa`): selector de tasa por venta (override del default).
  - **Productos**: campo "Impuesto por defecto" en alta/edición.
  - **Facturas**: usa tasa de la venta o la default de facturación (`module_settings.invoicing.default_tax_rate_id`).
  - **Compras**: ver sección 2.

### 2. Compras — pagos parciales/totales y múltiples métodos al crear/editar

**Estado actual:** se paga sólo desde la lista (botón "Pagar compra") con `MultiPaymentDialog`. El form de creación pide un único `amountPaid` numérico sin método ni moneda.

**Cambios en `src/pages/Compras.tsx`:**
- Reemplazar el input "Monto pagado" por una **lista de líneas de pago** (método + moneda + monto + tasa de cambio) reusando la lógica de `MultiPaymentDialog`.
- Añadir **selector de tasa de impuesto** (`tax_rate_id`) que recalcula `tax = subtotal * rate` automáticamente; mantener input manual como override.
- Al guardar la compra:
  1. `INSERT purchases` con `tax_rate_id`, `tax` calculado, `amount_paid = 0`.
  2. Por cada línea de pago, llamar `register_account_payment(party='supplier', reference_type='purchase', reference_id, ...)` para que el trigger sume `amount_paid`, ajuste `status` y registre asiento.
- Permitir **editar** una compra en estado `draft`: abrir mismo modal con datos precargados, items y pagos existentes mostrados (los pagos previos no se editan, sólo se añaden nuevos).
- Botón "Pagar compra" existente sigue funcionando para post-recepción.

### 3. Mejoras y correcciones detectadas por módulo

**POS**
- `POSEmpresa/Bar/Restaurant`: leer `pos_settings.default_tax_rate_id` y aplicar (hoy se hace parcial); permitir override por venta.
- Validar `allow_negative_stock` antes de cobrar; bloquear si está en false y stock < 0.
- Aplicar `rounding_mode` al total final.
- Auto-imprimir ticket cuando `auto_print_receipt = true`.

**Inventario / Almacenes**
- Filtros: persistir en URL (querystring) para compartir vistas.
- Indicador visual de stock bajo según `module_settings.inventory.low_stock_threshold` cuando el producto no tiene `min_stock`.
- Botón "Ajuste rápido" desde la fila para crear movimiento manual.

**Cuentas (CxC/CxP)**
- Vista de "Antigüedad de saldos" (0-30, 31-60, 61-90, +90 días).
- Recordatorios automáticos: notificación cuando una venta a crédito vence.

**Facturas**
- Usar serie/prefijo desde `module_settings.invoicing` (hoy fallback "A/F").
- Botón "Anular factura" con asiento de reverso.

**Turnos**
- Respetar `require_opening_count` y `require_difference_reason` (validación en cierre).
- En `TurnoDetalle`: gráfico de ventas por hora y top productos.

**Proveedores**
- Tab "Estado de cuenta" con cronología de compras/pagos/consignaciones.
- Acción "Liquidar todo" desde la lista de proveedores con saldo pendiente.

**Empleados / Clientes**
- Marcar fiados vencidos en rojo en sus detalles.
- Acción rápida "Cobrar saldo" usando `MultiPaymentDialog` en lugar de redirigir a `/cuentas`.

**Contabilidad**
- Filtro por tipo de asiento (venta, compra, pago, ajuste manual).
- Exportar libro diario a CSV/PDF.

**Marketplace / Pedidos online**
- Validar stock al confirmar pedido.
- Estado "preparando" sincronizado con KDS.

**Configuración**
- Añadir tab "Series de facturas" para CRUD de `invoice_series`.
- En `ConfigPOS`: selector visual de `default_tax_rate_id` desde `tax_rates` (hoy es texto libre).

### 4. Migración SQL requerida

```sql
ALTER TABLE purchases ADD COLUMN tax_rate_id uuid REFERENCES tax_rates(id);
ALTER TABLE sales ADD COLUMN tax_rate_id uuid REFERENCES tax_rates(id);
ALTER TABLE invoices ADD COLUMN tax_rate_id uuid REFERENCES tax_rates(id);
ALTER TABLE products ADD COLUMN default_tax_rate_id uuid REFERENCES tax_rates(id);
-- índices y RLS heredados
```

### 5. Orden de ejecución sugerido

1. Migración SQL + `useTaxRates` hook.
2. Compras: integrar selector de impuesto + pagos multi-línea en alta/edición (foco principal del pedido).
3. ConfigPOS: selector real de tasa.
4. POS: aplicar tasa + redondeo + validación de stock.
5. Resto de mejoras por módulo en iteraciones siguientes.

### Notas

- No se borra ningún dato; todas las columnas nuevas son opcionales con fallback al comportamiento actual.
- `MultiPaymentDialog` ya soporta multi-método/multi-moneda → se reusa su lógica en el form de compras.
- Los asientos contables se generan automáticamente vía triggers existentes; no hay que tocarlos.
