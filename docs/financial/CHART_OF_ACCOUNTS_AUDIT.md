# CHART OF ACCOUNTS AUDIT

## Estado real de `public.accounting_accounts`

Columnas originales (16): `id, code, name, type, parent_id, balance, tenant_id, is_active, created_at, updated_at, level, is_postable, nature, currency, description, plan_template`.

Columnas añadidas en esta fase: `account_subtype, is_control_account, control_role, allows_manual_entry, requires_reconciliation, tax_category, statement_section, is_system`.

Se descartaron `normal_balance` y `financial_statement_section` como nombres nuevos porque el modelo ya usa `nature` (débito/crédito) y se adoptó `statement_section` para no duplicar semántica.

## Tipos existentes (datos reales)

| type | cuentas |
|------|---------|
| asset | 109 |
| liability | 65 |
| equity | 28 |
| income | 36 |
| expense | 54 |
| cost | 18 |

`cost` separa el Costo de Ventas de los gastos operativos, de modo que el Estado de Resultados puede calcular Margen Bruto sin heurísticas de nombre.

`statement_section` se rellenó de forma determinista desde `type`:
`balance_sheet_assets`, `balance_sheet_liabilities`, `balance_sheet_equity`, `income_statement_revenue`, `income_statement_cost_of_sales`, `income_statement_expenses`.

## Jerarquía

Estructura `parent_id` + `level` + `is_postable`. Verificado con SQL:

- cuentas con padre inexistente: **0**
- códigos duplicados dentro de una misma empresa: **0**
- líneas contables sobre cuentas `is_postable = false`: **0**
- líneas contables sobre cuentas que tienen hijas: **0**

Regla efectiva: solo la cuenta hoja imputable acepta movimientos, y `post_journal_entry` lo rechaza explícitamente ("Hay N línea(s) con cuentas no imputables").

## Cuentas de control

66 cuentas quedaron marcadas `is_control_account` con `control_role` en: `cash`, `bank`, `accounts_receivable`, `accounts_payable`, `inventory`, `taxes_payable`, `payroll_payable`, `revenue`, `cost_of_goods_sold`, `payroll_expense`. 24 exigen conciliación (caja y banco).

## Cuentas globales

8 cuentas con `tenant_id IS NULL` (Caja, Bancos, CxC, Inventario, CxP, Impuestos por Pagar, Ventas, Costo de Ventas) son plantilla histórica: **ninguna línea contable las usa**. Marcadas `is_system = true`; se conservan como semilla y no se eliminan porque no puede demostrarse que no las use la importación de plantillas (`import_chart_template`).

## Pendiente (P2)

- Exponer en la UI del plan de cuentas los nuevos atributos (subtipo, cuenta de control, categoría fiscal) para edición por el contador.
- Impedir la desactivación de una cuenta con movimientos en el período abierto.
