# FINANCIAL INVARIANTS

Invariantes ejecutables. Cada una tiene implementación verificable en base de datos o en la suite de tests.

| # | Invariante | Dónde se garantiza |
|---|-----------|--------------------|
| 1 | Para todo asiento `posted`: `SUM(debit) = SUM(credit)` | `post_journal_entry` (aplicación) + constraint trigger diferido `zz_assert_balanced_lines` / `zz_assert_balanced_entry` (BD, al COMMIT) + `financial_health_check.double_entry` |
| 2 | `SUM(debit) = SUM(credit)` global por empresa | `certify_financial_integrity.double_entry_global` |
| 3 | `Activo = Pasivo + Patrimonio + (Ingresos − Gastos − Costos)` | `financial_health_check.balance_equation` (CRITICAL con la diferencia exacta) |
| 4 | Ninguna línea contable sobre cuenta no imputable o inactiva | `post_journal_entry` + `financial_health_check.postings_on_invalid_accounts` |
| 5 | Ninguna cuenta con padre inexistente ni código duplicado por empresa | `financial_health_check.hierarchy_orphans` / `duplicate_codes` |
| 6 | Ningún asiento sin empresa | `zz_journal_entries_require_tenant` + `financial_health_check.entries_without_tenant` |
| 7 | Ninguna línea usa una cuenta de otra empresa | `financial_health_check.cross_tenant_lines` |
| 8 | Un asiento `posted` es inmutable (fecha, empresa, número, serie) y no se borra | `zz_guard_posted_journal_entry` |
| 9 | Las líneas de un asiento `posted` no se modifican ni se borran | `zz_guard_posted_journal_line` |
| 10 | No se crean asientos con fecha en período cerrado | `zz_guard_closed_period` |
| 11 | Toda venta `completed` tiene asiento | `financial_health_check.sales_posted` |
| 12 | Toda compra `received/partial/paid` tiene asiento | `financial_health_check.purchases_posted` |
| 13 | Toda nómina `paid` tiene asiento | `financial_health_check.payroll_posted` |
| 14 | `total = subtotal + impuesto` en ventas y `SUM(líneas) = subtotal` | `certify_financial_integrity.sale_totals` / `sale_lines_match` + `src/lib/finance/invariants.test.ts` |
| 15 | `amount_paid ≤ amount` en cuentas por pagar | `financial_health_check.overpaid_bills` |
| 16 | `apertura + entradas − salidas = cierre` en inventario | `certify_financial_integrity.inventory_continuity` + tests de invariantes |
| 17 | Toda operación monetaria tiene moneda y tipo de cambio > 0, y `amount_in_base = amount × rate` | `certify_financial_integrity.fx_consistency` + `financial_health_check.sales_fx_defined` + `src/modules/shared/domain/money.ts` |
| 18 | Una intención de usuario produce un único efecto financiero | `operation_idempotency` + `claim_operation` + `callFinancialRpc` |
| 19 | La corrección de un asiento contabilizado solo ocurre por reverso trazable | `reverse_journal_entry` (`reverses` / `reversed_by`) |
| 20 | El mayor es proyección reconstruible del asiento, nunca fuente independiente | `rebuild_general_ledger` + `financial_health_check.projection_rows` |
