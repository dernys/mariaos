# MarIA OS — Production Readiness Report

Fecha: 2026-08-08 · Alcance: auditoría en vivo (SQL sobre la base real, tipos, suite de tests) + correcciones aplicadas.

## 1. Estado inicial

- 130 tablas y 17 vistas en `public`, 56 pantallas, 17 edge functions.
- Motor contable operativo por triggers legacy + motor de eventos (`financial_events` + `posting_rules` + `post_financial_event`).
- 3 tenants demo con datos transaccionales reales (Bar, Restaurante, Empresa comercial) + 3 tenants demo vacíos.
- Reportes financieros implementados como RPC `SECURITY DEFINER` con guardas `is_superadmin/is_tenant_member`.

## 2. Problemas encontrados

| # | Problema | Severidad | Causa raíz |
|---|----------|-----------|------------|
| 1 | `post_payroll_journal_entry` fallaba siempre | **P0** | Insertaba `tenant_id` en `journal_entry_lines` (columna inexistente) y `entry_date` en `journal_entries` (la columna real es `date`); además `entry_number` es NOT NULL sin default. Origen del error reportado `column "tenant_id" does not exist`. |
| 2 | Pagos de nómina sin impacto contable | **P0** | `pay_payroll` nunca invocaba la función de posteo → 14 nóminas pagadas sin asiento. |
| 3 | Plan de cuentas de nómina hardcodeado al PGC español (640/476/4751/572) | P1 | No existe en el perfil CU-MIPYME → retorno silencioso `NULL`. |
| 4 | 1 compra y 1 asiento con `tenant_id NULL` | **P0** (aislamiento) | Inserción por vía service-role sin `auth.uid()`, donde el trigger `autofill_tenant_id` no puede resolver el tenant. |
| 5 | Migración `20260620193555` usaba `journal_entry_id` / `debit_amount` / `credit_amount` | P1 | Nomenclatura divergente frente al esquema real (`entry_id`, `debit`, `credit`). Origen del error `column "journal_entry_id" does not exist`. Las funciones vivas ya usan el esquema correcto; queda como deuda documental. |
| 6 | No existía certificación ejecutable de invariantes financieras | P1 | Solo `smoke_test_financial_core` (cobertura parcial). |

## 3. Problemas corregidos

- **Nómina → contabilidad**: `post_payroll_journal_entry` reescrita con columnas correctas (`date`, `entry_number`, `series='NOM'`, `period_id`, `fiscal_year_id`), resolución genérica de cuentas vía `find_account_by_codes` con listas de fallback multiplan (`5201/6401/640`, `2104/4650`, `2106/4760`, `2107/4751`, `1101/1102/572`) y línea residual de cuadre para otras deducciones/redondeos.
- **`pay_payroll`** contabiliza de forma idempotente (`payroll_runs.journal_entry_id`), sin bloquear el pago si el plan contable está incompleto.
- **Backfill**: 14 nóminas pagadas ya tienen asiento; la compra huérfana heredó el tenant de su proveedor; el asiento huérfano (0 líneas, sin efecto financiero) fue eliminado.
- **Prevención**: trigger `zz_purchases_tenant_from_supplier` (la compra hereda el tenant del proveedor) y `zz_journal_entries_require_tenant` (ningún asiento puede existir sin empresa).
- **`certify_financial_integrity(p_tenant)`**: 12 validaciones ejecutables + panel UI en Contabilidad → Reportes.

## 4. Motor financiero — resultado

**PASS** (verificado con SQL sobre datos reales):

| Invariante | Resultado |
|-----------|-----------|
| `SUM(debe) = SUM(haber)` global y por asiento | PASS (los 3 tenants) |
| `ACTIVO = PASIVO + PATRIMONIO + RESULTADO` | PASS (t1 −255 = 24.033,76 − 24.288,76; t2 52.808 = 16.543 + 36.265; t3 574.944,50 = 60.170,14 + 514.774,36) |
| Ventas `completed` con asiento | PASS (54/54) |
| Compras `received/partial/paid` con asiento | PASS (las `pending/draft` no deben postear) |
| Asientos sin tenant | PASS (0) |
| Nóminas pagadas con asiento | PASS (14/14) |
| Líneas contables huérfanas | PASS (0) |

## 5. Estados financieros

| Reporte | Resultado | Nota |
|---------|-----------|------|
| Estado de Resultados | PASS | `report_income_statement(tenant, from, to)` |
| Balance General | PASS | `report_balance_sheet(tenant, to)` — firma de 2 argumentos, coincide con la llamada del frontend |
| Balance de Comprobación | PASS | `report_trial_balance` |
| Libro Diario | PASS | `report_journal` |
| Libro Mayor | PASS | `report_general_ledger` con saldo acumulado por cuenta |

Todos filtran `status='posted'` y aplican guarda de tenant.

## 6. Multi-tenancy — PASS

RLS activa en todas las tablas; reportes y certificación con guarda explícita `is_superadmin OR is_tenant_member`; eliminadas las filas sin tenant y añadidos triggers que impiden su reaparición en compras y asientos.

## 7. RBAC — PASS con deuda

`user_roles` + `role_permissions` + `has_role` (SECURITY DEFINER, sin recursión); `usePermissions`/`PermissionGate`/`ProtectedRoute` gobiernan la UI. Deuda: la autorización de escritura sigue apoyada en RLS por tenant y no en permisos por acción a nivel de fila para todos los módulos.

## 8. Testing

- Suite actual: **70 tests en 8 ficheros, todos en verde** (66 previos + 4 de invariantes de nómina en `src/lib/finance/payrollInvariants.test.ts`).
- Certificación en base de datos: 12 comprobaciones vía `certify_financial_integrity`.

## 9. Errores restantes / deuda técnica

- P1 — Los `financial_events` no se emiten desde ningún flujo (0 filas): existen reglas de posteo para `payroll_expense`, `payroll_payment`, `bank_*`, `delivery_fee`, `loyalty_accrual` que hoy no se disparan. El posteo real ocurre por triggers legacy y funciones dedicadas.
- P1 — Nómina no genera todavía `accounts_payable` en el momento del devengo (solo al pagar), por lo que no hay antigüedad de obligaciones salariales.
- P2 — Migración `20260620193555` con nombres de columna divergentes (no afecta al runtime, sí a futuras reejecuciones).
- P2 — 2 nóminas y 2 asientos en `draft` no aparecen en reportes (comportamiento correcto, pero sin UI que lo advierta).
- P2 — Linter Supabase: 645 avisos preexistentes (exposición GraphQL a `anon`, `search_path` en funciones legacy, extensión en `public`).
- P3 — Sin tests E2E del flujo completo compra → inventario → venta → pago → contabilidad.

## 10. Próximas acciones

- **P0** — ninguna abierta.
- **P1** — Emitir `financial_events` desde nómina/bancos/delivery y retirar progresivamente los triggers legacy equivalentes (Strangler, sin duplicar asientos).
- **P1** — Devengo de nómina (`accounts_payable` en la aprobación) con su asiento independiente del pago.
- **P2** — Normalizar la migración divergente y reducir avisos del linter.
- **P3** — E2E determinista del ciclo empresarial completo.

---

Revalidación 2026-08-08 23:30 UTC: 102 asientos `posted`, 2 en `draft`, 0 asientos sin `tenant_id`, 0 líneas contables huérfanas, 14/14 nóminas pagadas con asiento, 0 ventas `completed` sin asiento, `financial_events` sigue en 0 filas (P1 abierto).
