# FINANCIAL REPORTS AUDIT

Todos los reportes son RPC `SECURITY DEFINER` con guarda `is_superadmin(auth.uid()) OR is_tenant_member(tenant)` y filtran `journal_entries.status = 'posted'`.

| Reporte | RPC | Derivado de | Estado |
|---------|-----|-------------|--------|
| Estado de Resultados | `report_income_statement(tenant, from, to)` | líneas de asientos posteados por `type` (`income`, `cost`, `expense`) | PASS |
| Balance General | `report_balance_sheet(tenant, to)` | `asset`, `liability`, `equity` + resultado del ejercicio | PASS |
| Balance de Comprobación | `report_trial_balance` | suma debe/haber por cuenta | PASS |
| Libro Diario | `report_journal` | cabecera + líneas | PASS |
| Libro Mayor | `report_general_ledger` | líneas con saldo acumulado por cuenta | PASS |
| Flujo de caja | `forecast_cashflow` (proyección) + movimientos de caja del turno | PARCIAL: no existe estado de flujo de efectivo formal por método indirecto |

## Verificación de cuadre (datos reales)

- Debe = Haber global y por asiento: **PASS** en los 3 tenants con transacciones.
- `Activo = Pasivo + Patrimonio + Resultado`: **PASS**; el health check devuelve `CRITICAL` con la diferencia exacta si se rompe, en lugar de mostrar un reporte aparentemente correcto.
- Total debe = total haber en el Balance de Comprobación: **PASS**.

## Ausencia de valores simulados

Búsqueda en `src/` de `mockRevenue|fakeRevenue|demoRevenue|sampleRevenue|hardcodedRevenue|mockProfit|fakeProfit|staticBalance`: **sin coincidencias en módulos financieros**. Los KPI de Contabilidad provienen de `get_financial_kpis` y de los reportes RPC.

## Drill-down

Existe: Estado de Resultados → cuenta → mayor → asiento. Falta cerrar el último salto (asiento → documento origen) de forma uniforme para todos los `reference_type`; hoy `reference_type` + `reference_id` están poblados, por lo que el enlace es viable sin cambios de esquema (P2).

## Pendiente

- P2 — Estado de Flujo de Efectivo formal (operativo / inversión / financiación) derivado del mayor.
- P2 — Columnas de apertura y cierre explícitas en el Balance de Comprobación (hoy se calcula el movimiento del período y el saldo final).
