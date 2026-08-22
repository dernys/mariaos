# MarIA OS — Financial Integrity

Definición ejecutable de "los números cuadran". Cada invariante tiene una implementación verificable.

## Cadena empresarial

```text
USUARIO → OPERACIÓN → DOCUMENTO → MOVIMIENTO → CUENTA → ASIENTO
        → LIBRO DIARIO → LIBRO MAYOR → BALANCE DE COMPROBACIÓN
        → ESTADO DE RESULTADOS → BALANCE GENERAL → BI / IA
```

## Invariantes certificadas

`certify_financial_integrity(p_tenant uuid)` devuelve `check_name, status, expected, actual, detail`.

| Check | Regla |
|-------|-------|
| `double_entry_global` | `SUM(debe) = SUM(haber)` en asientos `posted` |
| `double_entry_per_entry` | ningún asiento individual descuadrado |
| `balance_equation` | `ACTIVO = PASIVO + PATRIMONIO + (INGRESOS − GASTOS)` |
| `net_income` | informativo: resultado del ejercicio |
| `journal_tenant_scope` | 0 asientos sin `tenant_id` |
| `sales_posted` | 0 ventas `completed` sin asiento |
| `purchases_posted` | 0 compras `received/partial/paid` sin asiento |
| `sale_totals` | `total = subtotal + impuesto` |
| `sale_lines_match` | `SUM(sale_items.total) = subtotal` (aviso) |
| `accounts_payable_consistency` | `amount_paid ≤ amount` y estado coherente |
| `fx_consistency` | moneda presente, tasa > 0, `amount_in_base = amount × tasa` |
| `inventory_continuity` | último `new_stock` = existencia actual (aviso) |

Complementos:
- `smoke_test_financial_core(p_tenant)` — perfil contable, plan de cuentas, períodos, reglas de posteo, cuadre del mayor, triggers.
- `src/lib/finance/invariants.ts` + tests — partida doble, totales de venta, inventario, dinero/FX.
- `src/lib/finance/payrollInvariants.test.ts` — cuadre del asiento de nómina.

## Rutas de posteo por operación

| Operación | Mecanismo | Asiento |
|-----------|-----------|---------|
| Venta completada | trigger `post_sale_journal_entry` | ingreso, impuesto, CxC/caja, COGS, inventario |
| Devolución | `process_sale_return` / `post_sale_return_journal_entry` | reverso de ingreso e inventario |
| Compra recibida | `post_purchase_journal_entry` | inventario, impuesto acreditable, CxP |
| Cobro / pago | `post_payment_journal_entry` | caja/banco vs CxC/CxP |
| Movimiento de caja del turno | `register_shift_cash_movement` | caja vs contrapartida por categoría |
| Cierre Z | `close_shift_z` | sobrante/faltante de caja |
| Nómina pagada | `pay_payroll` → `post_payroll_journal_entry` | gasto salarial, SS por pagar, retenciones, caja |
| Declaración fiscal | `compute_tax_declaration` / `submit_cu_tax_declaration` | impuesto devengado por jurisdicción |

## Fiscalidad genérica

`fiscal_rules` + `br_tax_jurisdictions` + `compute_tax_declaration` permiten definir país, jurisdicción, impuestos, tasas, períodos y cuenta contable asociada sin tocar el núcleo contable. Cuba se implementa como un perfil (`CU-MIPYME`) y no como condición hardcodeada del motor.

## Multimoneda

Toda operación monetaria persiste `currency`, `exchange_rate`, `*_in_base`. `get_exchange_rate` y `exchange_rates_history` son la única fuente de FX; `src/modules/shared/domain/money.ts` centraliza el valor `Money` en frontend. La certificación verifica la reproducibilidad de la conversión (`fx_consistency`).

## Ámbito de gastos y otros ingresos

Los gastos operativos y otros ingresos son de **ámbito negocio (tenant)**, no de local:

- Se registran con `tenant_id` y, cuando proceden de caja, con el turno y la tienda que los originó (trazabilidad de efectivo), pero **no llevan dimensión de local en el estado de resultados**.
- Por eso `daily_financial_summary` presenta gastos y otros ingresos a nivel de negocio, mientras que caja esperada, ventas y cobros sí se desglosan por tienda/turno.
- Conclusión operativa: **dinero disponible ≠ ventas ≠ utilidad**. La caja depende de cobros y movimientos; las ventas, del ingreso devengado; la utilidad, de ingresos − costo de ventas − gastos.

## Regularización de costos históricos

- `missing_cogs_report(tenant)` lista, antes de contabilizar, las ventas con asiento pero sin línea de costo: venta, producto, cantidad, costo unitario y total, separando las líneas con **costo pendiente de identificación**.
- `resolve_sale_item_cost(sale_item_id, product_id, unit_cost)` permite a administración/contabilidad asignar producto o costo unitario a una línea pendiente (queda en auditoría).
- `post_missing_cogs(tenant)` crea asientos `sale_cogs_adjustment` (Costo de ventas / Inventario) sin modificar los asientos originales.
- UI: Contabilidad → Análisis → "Costos históricos (COGS)".
