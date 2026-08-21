# Hardening crítico: POS · Inventario · CxC · Caja

Auditoría hecha sobre el código y la base de datos actuales. No se crea un sistema nuevo: se corrige la arquitectura existente (`create_quick_operation`, `register_account_payment`, `sales_shifts`, `shift_cash_movements`, `account_payments`, `v_ar_aging`, `stock_transfers`).

## Hallazgos verificados (causa raíz)

1. **El POS no es transaccional ni server-side.** `src/components/pos/PaymentDialog.tsx` (líneas 296-341) inserta la venta, luego los ítems, luego los pagos y después llama a `process_sale_stock` en 4 llamadas separadas desde el navegador, con `subtotal`, `tax`, `total`, `amount_paid` y `status` calculados en el cliente. Si falla cualquier paso queda una venta parcial, y los totales/precios/impuestos no se revalidan en el servidor.
2. **Doble descuento potencial de stock.** La tabla `sales` ya tiene el trigger `trg_sale_stock_on_complete`, y el POS además invoca `process_sale_stock` manualmente. Hay que confirmar cuál es la vía canónica y dejar solo una.
3. **Idempotencia no aplicada en el POS.** Existe `operation_idempotency` + `claim_operation`, pero la tabla está vacía (0 filas) y el POS no la usa: solo hay un índice único parcial en `sales.client_uuid`, que no protege pagos ni movimientos ligados.
4. **Sobrecargas duplicadas de RPC.** Existen dos versiones de `create_quick_sale` y dos de `register_account_payment` (una con `p_idempotency_key`/`p_correlation_id` y otra sin). Riesgo real de ambigüedad en PostgREST y de que la UI llame a la variante sin idempotencia.
5. **El cobro de deuda no llega a la caja del turno.** `register_account_payment` (versión base de 9 argumentos) solo inserta en `account_payments`; no crea `shift_cash_movements` ni guarda `shift_id` (la tabla `account_payments` no tiene esa columna). Por eso `calculate_shift_summary` no distingue **COBROS DE DEUDA**: solo devuelve `cash_sales`, `cash_in/out` genéricos y `credit_sales`, y el efectivo esperado no incluye los cobros del día.
6. **Datos demo incoherentes en CxC.** Los tres tenants demo tienen ventas (25 / 21 / 20) pero solo uno tiene un único `account_payments` (1 / 0 / 0): no hay ventas fiadas con pagos parciales ni cobros para probar aging ni estado de cuenta.
7. **Aislamiento multi-tenant: base sana con huecos.** `is_superadmin()` ya no se usa como bypass en tablas tenant-scoped (solo aparece en 6 políticas de tablas globales: `tenants`, `app_modules`, `role_permissions`, `rider_profiles`), y todas las funciones `SECURITY DEFINER` tienen `search_path` fijo. Falta: inmutabilidad de `tenant_id` en UPDATE sobre tablas financieras/inventario, y revisión de las escrituras directas del cliente.

## Cambios propuestos

### A. Venta POS atómica y server-side
- Nueva RPC `pos_checkout(...)` que reutiliza la lógica ya existente de `create_quick_operation`: en una sola transacción crea venta + ítems + pagos + movimientos de inventario + CxC + caja, y dispara la contabilidad por los triggers actuales.
- El servidor recalcula precio (desde `products`/promociones), descuento, impuesto (`tax_rates`), total, `amount_paid` y `status` (`paid` / `partial` / `credit`); ignora los totales del frontend.
- Valida stock disponible por `store_id`/`warehouse_id`, límite de crédito y que fiado/parcial exija cliente o empleado asociado.
- Soporta contado, efectivo, transferencia, tarjeta/QR, pago online, pago parcial, crédito y multi-método.
- `PaymentDialog.tsx` pasa a una sola llamada por `callFinancialRpc` con `idempotency_key` derivada del contexto de intención; se mantiene el camino offline con el mismo `client_uuid`.
- Se elimina el doble descuento de stock dejando una sola vía (trigger o RPC).

### B. Idempotencia y limpieza de firmas
- Consolidar `create_quick_sale` y `register_account_payment` en una sola firma pública idempotente; la variante interna se renombra para que no sea invocable desde la API.
- Toda operación financiera del POS y de cobros pasa por `claim_operation`, de modo que doble clic o reintento devuelvan el mismo resultado sin duplicar.

### C. CxC y cobros con reflejo en caja
- Añadir `shift_id` y `store_id` a `account_payments`.
- `register_account_payment` (cobro de cliente en efectivo) crea el `shift_cash_movements` correspondiente con categoría `customer_collection`, ligado al turno abierto, sin crear ninguna venta.
- Extender `calculate_shift_summary` con secciones separadas: **ventas del día**, **cobros de deudas**, **entradas de efectivo**, **transferencias**, **otros movimientos**, evitando doble conteo en `expected_cash`.
- `CashFlowPanel` muestra esas categorías y el cierre reconcilia ventas + cobros + movimientos, señalando la diferencia contra el efectivo contado.
- Estado de cuenta por cliente: aging (`v_ar_aging`), historial de pagos y saldo pendiente en la ficha del cliente.

### D. Inventario multi-almacén
- Toda escritura de inventario se hace por RPC con `tenant_id` + (`store_id` | `warehouse_id`); se retira la escritura directa a `inventory_movements` y el `update({stock})` del repositorio del cliente.
- Verificar que venta, devolución y transferencia actualicen `product_stock` de forma atómica y que las transferencias sigan siendo documentos con movimientos en ambos extremos.

### E. Pagos online
- Los pedidos online nunca aceptan `paid=true` del cliente: el estado de pago se fija solo server-side y se mantienen `PENDING/PAID/FAILED/CANCELLED/REFUNDED`.

### F. Multi-tenant
- Triggers de inmutabilidad de `tenant_id` en UPDATE sobre `sales`, `sale_items`, `sale_payments`, `account_payments`, `inventory_movements`, `product_stock`, `stock_transfers`, `sales_shifts`, `shift_cash_movements`.
- Auditoría de RLS/RPC/views/Edge Functions para confirmar que el SuperAdmin en modo TENANT solo opera sobre `sa_active_tenant()` y que GLOBAL MODE queda restringido a administración.

### G. Datos demo
- Regenerar, por cada tenant demo y sin reutilizar IDs de otro: usuarios → almacenes/locales → productos → inventario → ventas (contado, fiada, parcial) → pagos → CxC con aging → turno con caja.

## Pruebas (A/B/C)
Suite ejecutable sobre los tres tenants demo: venta contado, venta fiada, pago parcial, pago total de deuda, cobro en el día correcto, efectivo, transferencia, stock por almacén, transferencia entre almacenes, devolución, cierre de caja, doble envío de venta y de pago, acceso A→B/C, modificación y borrado cross-tenant, y rotación A→B→C→A para detectar fugas de caché/estado. Se cierra con `certify_financial_integrity` y el linter de seguridad.

## Entrega final
CAUSA RAÍZ → CAMBIOS → PRUEBAS → PASS/FAIL → RIESGOS PENDIENTES.
