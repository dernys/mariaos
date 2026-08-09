# FINANCIAL CORE AUDIT — MarIA OS

Fecha: 2026-08-09 · Método: SQL en vivo sobre la base real (`information_schema`, `pg_proc`, `pg_trigger`, `pg_policies`) + lectura de código. Sin suposiciones.

## 1. Executive report

| Dimensión | Estado | Madurez |
|-----------|--------|---------|
| Partida doble | Operativa y ahora garantizada en BD | 90% |
| Maestro de Cuentas | Jerárquico, imputabilidad correcta; enriquecido en esta fase | 85% |
| Mapeo contable | Existía por convención de códigos; ahora configurable por empresa | 80% |
| Motor de eventos (`financial_events`) | Infraestructura completa, **0 filas** (sin emisores) | 40% |
| Libro Mayor (proyección) | `general_ledger` + `rebuild_general_ledger` | 75% |
| Reportes financieros | 5 reportes RPC derivados del asiento | 85% |
| Fiscalidad multipaís | `fiscal_rules` + `br_tax_jurisdictions` + `compute_tax_declaration` | 70% |
| Multimoneda | `currency` + `exchange_rate` + `*_in_base` en documentos; ahora también en asientos | 75% |
| Multi-tenant | RLS en todas las tablas + triggers que impiden filas sin empresa | 90% |
| IA financiera | Forecast + anomalías + explicabilidad, sin poder de contabilizar | 65% |

## 2. Hallazgos verificados (antes de esta fase)

| # | Hallazgo | Severidad | Evidencia SQL | Estado |
|---|----------|-----------|---------------|--------|
| 1 | Un asiento `posted` podía modificarse o borrarse directamente (no había trigger de inmutabilidad) | CRITICAL | `pg_trigger` sobre `journal_entries` solo tenía audit/tenant/período | CORREGIDO |
| 2 | El cuadre debe=haber solo se validaba dentro de `post_journal_entry`; una escritura directa podía dejar un asiento `posted` descuadrado | CRITICAL | ausencia de constraint trigger | CORREGIDO (constraint trigger diferido) |
| 3 | Se podían insertar asientos con fecha en período cerrado (solo se validaba al postear) | HIGH | `post_journal_entry` valida; el INSERT no | CORREGIDO |
| 4 | Cuentas usadas por convención de código dentro de las funciones de posteo (`find_account_by_codes`) sin capa de mapeo configurable | HIGH | cuerpo de `post_sale_journal_entry` / `post_payroll_journal_entry` | CORREGIDO (`accounting_mappings` + `resolve_mapped_account`) |
| 5 | `journal_entries` sin `currency`, `exchange_rate`, `source_module`, `correlation_id`, `metadata`; líneas sin moneda ni dimensiones (solo `cost_center_id`) | HIGH | `information_schema.columns` | CORREGIDO |
| 6 | Maestro de Cuentas sin subtipo, cuenta de control, categoría fiscal ni sección de estado financiero | MEDIUM | 16 columnas originales | CORREGIDO |
| 7 | `financial_events` con 0 filas: reglas de posteo por evento definidas pero nunca disparadas | HIGH | `select count(*) from financial_events` = 0 | ABIERTO (P1, plan Strangler) |
| 8 | 8 cuentas globales (`tenant_id IS NULL`) en el plan | MEDIUM | 8 filas, **0 líneas contables las usan** | MITIGADO (marcadas `is_system`) |
| 9 | `posting_rules.profile_code` NULL en las 19 reglas | MEDIUM | `group by profile_code` | ABIERTO (P2) |

## 3. Errores reportados históricamente

- `column "tenant_id" does not exist` → causa raíz real: `journal_entry_lines` **no tiene** `tenant_id` (el tenant vive en la cabecera). Corregido en `post_payroll_journal_entry` en la fase anterior; hoy verificado: 0 funciones vivas insertan `tenant_id` en líneas.
- `column "journal_entry_id" does not exist` → la columna real es `journal_entry_lines.entry_id`. Solo persiste en la migración histórica `20260620193555` (deuda documental, no runtime).

## 4. Verificación posterior a la corrección

- Asientos `posted` descuadrados: **0**
- Líneas sobre cuentas no imputables: **0**
- Líneas apuntando a cuentas padre: **0**
- Cuentas huérfanas / códigos duplicados por empresa: **0 / 0**
- Líneas que cruzan empresas: **0**
- Asientos sin `tenant_id`: **0**
- Prueba de guardas (transacción revertida): un asiento `posted` con debe 100 / haber 0 fue **rechazado al COMMIT** con `Partida doble violada`; el mismo asiento balanceado fue aceptado.
