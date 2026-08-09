# ACCOUNTING FLOW AUDIT

## Camino real de escritura contable

```text
OPERACIÓN (venta, compra, pago, nómina, movimiento de caja)
        │
        ├── vía A (vigente): trigger / RPC dedicada
        │      post_sale_journal_entry
        │      post_purchase_journal_entry
        │      post_payment_journal_entry
        │      post_sale_return_journal_entry
        │      post_payroll_journal_entry
        │      register_shift_cash_movement
        │
        └── vía B (infraestructura lista, sin emisores): financial_events
               → post_financial_event → posting_rules (19 reglas)
        │
        ▼
journal_entries (cabecera)   status: draft | posted | reversed | cancelled
        │
        ▼
journal_entry_lines (debe / haber / cuenta / centro de costo / dimensiones)
        │
        ▼
general_ledger (proyección por período, reconstruible)
        │
        ▼
report_income_statement · report_balance_sheet · report_trial_balance
report_journal · report_general_ledger
```

**Fuente de verdad**: `journal_entries` + `journal_entry_lines`. `general_ledger` es proyección derivada y reconstruible (`rebuild_general_ledger`, `rebuild_general_ledger_all`); ningún reporte financiero calcula sobre el documento origen en paralelo al asiento.

**Doble vía**: A y B nunca se ejecutan simultáneamente para el mismo evento, porque B no tiene emisores (0 filas en `financial_events`). Cerrar el P1 exige el patrón Strangler: emitir el evento y desactivar el trigger equivalente **en la misma migración**.

## Controles activos (tras esta fase)

| Control | Mecanismo |
|---------|-----------|
| Debe = Haber en todo asiento `posted` | `post_journal_entry` (aplicación) + constraint trigger diferido `zz_assert_balanced_*` (BD, al COMMIT) |
| Cuenta imputable | `post_journal_entry` + verificación en el health check |
| Inmutabilidad del asiento contabilizado | `zz_guard_posted_journal_entry` (fecha, empresa, número, serie, no DELETE) |
| Inmutabilidad de líneas contabilizadas | `zz_guard_posted_journal_line` (no UPDATE, no DELETE) |
| Corrección solo por reverso | `reverse_journal_entry` (crea asiento espejo, enlaza `reverses` / `reversed_by`) |
| Período cerrado | `zz_guard_closed_period` en INSERT + validación en `post_journal_entry` |
| Empresa obligatoria | `zz_journal_entries_require_tenant` + `autofill_tenant_id` |
| Auditoría | `audit_trigger` sobre `journal_entries` y `general_ledger` |
| Idempotencia | `operation_idempotency` + `claim_operation` + `callFinancialRpc` en frontend |

## Estados del asiento

`draft → posted → reversed | cancelled`. Un `posted` no puede volver a `draft` (el guard rechaza cualquier otra transición).
