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

## P0 — Maestro como fuente única (fail-closed)

`resolve_account_strict(tenant, key, module, operation)` es el único resolver de posting:
1. mapping explícito activo del tenant (cuenta activa e imputable), 2. si no existe, deduce y **fija** el mapping dejando evento de control `mapping_autobound`, 3. si no hay candidato → `RAISE` (`ACCOUNTING_MAPPING_MISSING` / `_INVALID`) y evento `posting_blocked`. La resolución ocurre **antes** de crear el asiento, por lo que la operación aborta sin efectos parciales.

### Matriz operación → mapping_key → cuenta

| Operación | DEBE | HABER |
|---|---|---|
| Venta (efectivo) | `sale_cash` | `sale_revenue`, `sale_tax_payable` |
| Venta (tarjeta/POS, Transfermóvil, EnZona) | `sale_card` / `sale_transfermovil` / `sale_enzona` (fallback `sale_bank`) | `sale_revenue`, `sale_tax_payable` |
| Venta a crédito (CxC) | `sale_receivable` | `sale_revenue`, `sale_tax_payable` |
| COGS / inventario | `cogs` | `inventory` |
| Devolución | `sale_return_revenue` | `sale_return_cash` / `sale_bank` |
| Compra recibida | `purchase_inventory`, `purchase_tax_receivable` | `purchase_payable` (o `payment_cash` si pagada) |
| Cobro cliente | `payment_cash`/`payment_bank`/`payment_transfermovil`/`payment_enzona`/`payment_card` | `sale_receivable` |
| Pago proveedor | `purchase_payable` | medio de pago (`payment_*`) |
| Caja: gasto / otro ingreso / banco / patrimonio | `expense_general` / `sale_cash` / `bank_account` / `owner_equity` | contrapartida simétrica |
| Cierre Z | `cash_short` | `cash_over` |
| Nómina | `payroll_expense` | `payroll_ss_payable`, `payroll_withholding`, `payroll_cash`, `payroll_liability` |
| Impuestos / ajustes | `tax_expense`, `inventory_adjustment` | `sale_tax_payable` / `inventory` |

Transferencias entre almacenes siguen **sin asiento** (no hay impacto financiero): no se crean asientos artificiales.

### Hardcodes eliminados
- `post_sale_return_journal_entry`: arrays `['708','700',...]` → `sale_return_revenue` / `sale_return_cash`.
- `post_payroll_journal_entry`: arrays `['5201','2104','2106','2107','1101',...]` → claves `payroll_*`.
- `close_shift_z` y `register_shift_cash_movement`: `resolve_account_by_type` (primera cuenta del tipo) → `cash_short`/`cash_over` y `cash_category_mapping_key()`.
- Ventas/compras/pagos: `resolve_account_by_role` con retorno `NULL` silencioso → `resolve_account_strict` fail-closed.

### Trazabilidad
`journal_entry_lines` almacena `mapping_key`, `source_module`, `source_operation`, `correlation_id` (`reference_type:reference_id`), insertados por `jel_add()`.

### Integridad y seguridad
- `accounting_config_report(tenant)`: MISSING / INVALID / CONFLICTING / USED / UNUSED / ORPHAN.
- `accounting_reclass_candidates(tenant)`: propuesta de reclasificación histórica (no modifica asientos posteados).
- Maestro y mappings: escritura solo con `can_manage_accounting()` (admin/contador, superadmin dentro del tenant activo), auditados por `audit_trigger`; `guard_account_deactivation` impide desactivar cuentas asignadas sin reemplazo.
