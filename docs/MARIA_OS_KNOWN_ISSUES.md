# MarIA OS — Known Issues

Estado: 2026-08-08 23:30 UTC (revalidado con SQL en vivo tras las correcciones de integridad financiera).

## P0 — Bloqueantes
Ninguno abierto.

## P1 — Críticos

### 1. `financial_events` sin emisores
- **Problema**: la tabla `financial_events` tiene 0 filas (confirmado de nuevo el 2026-08-08 23:30 UTC); las reglas `payroll_expense`, `payroll_payment`, `bank_deposit/withdrawal/charge/interest`, `delivery_fee`, `loyalty_accrual` nunca se ejecutan.
- **Causa raíz**: `post_financial_event` existe y es correcto, pero ningún trigger/RPC inserta eventos.
- **Impacto**: el posteo real depende de triggers legacy y funciones dedicadas; comisiones de delivery y provisión de fidelización no llegan al mayor.
- **Solución propuesta**: emitir eventos desde los flujos y retirar el trigger legacy equivalente solo cuando la comparación en modo sombra demuestre paridad (Strangler). Nunca ambos a la vez.
- **Riesgo**: duplicidad de asientos si se activan las dos vías.
- **Rollback**: desactivar `posting_rules.active` de la regla afectada.

### 2. Nómina sin devengo
- **Problema**: la obligación salarial solo aparece al pagar; no hay antigüedad de deuda con empleados.
- **Solución propuesta**: generar `accounts_payable` + asiento de devengo en la aprobación, y que el pago solo cancele la obligación.
- **Archivos/objetos**: `generate_payroll_payable`, `compute_payroll_full`, `pay_payroll`.

## P2 — Importantes

- Migración `supabase/migrations/20260620193555_*.sql` usa `journal_entry_id`, `debit_amount`, `credit_amount`; el esquema real es `entry_id`, `debit`, `credit`. No afecta al runtime actual, sí a una reejecución limpia del historial.
- 2 asientos y 2 nóminas en `draft` no aparecen en reportes (correcto), pero la UI no lo advierte.
- Linter Supabase: 645 avisos preexistentes (exposición GraphQL a `anon`, `search_path` mutable en funciones legacy, extensión en `public`).
- Valoración de mercancía en tránsito (transferencias) sin asiento propio.

## P3 — Mejoras

- Sin tests E2E del ciclo completo login → producto → compra → inventario → venta → pago → contabilidad → reportes.
- `useTenant` (hook legacy) coexiste con `useTenantContext`; consolidar en el contexto.
- Trazabilidad clicable desde el Estado de Resultados hasta el documento origen (hoy hay cuenta → asiento, falta el salto al documento en todos los tipos).

## Decisiones de negocio pendientes (no inventadas)

- Tratamiento contable de la mercancía en consignación no liquidada.
- Política de devengo de vacaciones y provisiones laborales por jurisdicción.
- Tasas y calendario fiscal específicos por país distinto de Cuba (la arquitectura está lista; faltan los datos legales).
