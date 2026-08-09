# MODULE ACCOUNTING MAPPING

## Matriz módulo → contabilidad (objetos reales verificados)

| Módulo | Evento de negocio | Mecanismo de posteo | Debe | Haber | Impuesto | Inventario | Asiento |
|--------|-------------------|---------------------|------|-------|----------|------------|---------|
| POS / Ventas | venta completada | trigger `post_sale_journal_entry` | Caja/Banco/CxC, COGS | Ingresos, Impuesto por pagar, Inventario | ✓ | ✓ | ✓ |
| Ventas | devolución | `process_sale_return` → `post_sale_return_journal_entry` | Ingresos, Inventario | Caja/CxC, COGS | ✓ | ✓ | ✓ |
| Compras | recepción | `post_purchase_journal_entry` | Inventario/Gasto, Impuesto acreditable | Cuentas por pagar | ✓ | ✓ | ✓ |
| Tesorería | cobro / pago | `post_payment_journal_entry` | Caja/Banco o CxP | CxC o Caja/Banco | — | — | ✓ |
| Turnos / Caja | movimiento de caja | `register_shift_cash_movement` | Caja o contrapartida | contrapartida o Caja | — | — | ✓ |
| Turnos | cierre Z | `close_shift_z` | Faltante de caja | Sobrante de caja | — | — | ✓ |
| Nómina | nómina pagada | `pay_payroll` → `post_payroll_journal_entry` | Gasto de nómina | Nómina por pagar, Retenciones, Caja | ✓ | — | ✓ |
| Inventario | ajuste / conteo | `inventory_movements` + valoración | Inventario o Gasto por ajuste | contrapartida | — | ✓ | PARCIAL |
| Transferencias | traslado entre almacenes | `stock_transfers` | — | — | — | ✓ | NO (P2: mercancía en tránsito sin asiento propio) |
| Fiscalidad | declaración | `compute_tax_declaration` / `submit_cu_tax_declaration` | Gasto/Impuesto devengado | Impuesto por pagar | ✓ | — | ✓ |
| Consignación | liquidación | `allocate_consignment_for_sale`, `consignment_settlements` | — | — | — | ✓ | PARCIAL (decisión de negocio pendiente) |
| Fidelización | provisión de puntos | `posting_rules.loyalty_accrual` | Gasto de fidelización | Provisión | — | — | NO (evento sin emisor) |
| Delivery | comisión de reparto | `posting_rules.delivery_fee` | Gasto de reparto | CxP repartidor | — | — | NO (evento sin emisor) |
| Bancos | depósito/cargo/interés | `posting_rules.bank_*` | Banco / Gasto | contrapartida | — | — | NO (evento sin emisor) |

## Capa de mapeo contable (nueva)

`public.accounting_mappings (tenant_id, mapping_key, account_id)` + `resolve_mapped_account(tenant, key, codes[])`:
mapeo explícito por empresa → si no existe, fallback por lista ordenada de códigos (`find_account_by_codes`). Ningún ID de cuenta queda fijado en el código.

Claves creadas para las 6 empresas (12 por empresa):

```text
sale_revenue · sale_receivable · sale_cash · sale_bank
inventory · cogs
purchase_inventory · purchase_payable
payment_cash · payment_bank
payroll_expense · payroll_liability
```

Sin resolver por falta de cuenta en el plan: `sale_tax_payable` (2106), `purchase_tax_receivable` (2107).

## Dimensiones disponibles en la línea contable

`cost_center_id` (preexistente) + `store_id`, `warehouse_id`, `entity_type`, `entity_id` (nuevas). Permiten rentabilidad por tienda, almacén, cliente, proveedor o empleado **sin** multiplicar cuentas del plan.
