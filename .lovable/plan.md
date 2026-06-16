
# Financial Core MarIA OS — Plan de Rediseño

## 0. Diagnóstico del estado actual

Tras revisar los bloques A–F ya implementados y el schema actual (104 tablas), este es el balance:

### Lo que ya está bien
- **Asientos automáticos parciales**: ventas (COGS), cobros, compras, nómina ya generan `journal_entries` vía triggers (Bloque B).
- **Multimoneda real**: columnas `currency`, `exchange_rate`, `total_in_base` en `sales`, `purchases`, `invoices`, `accounts_payable`; función `get_exchange_rate()`; vista `party_balance_by_currency` (Bloque E).
- **Auditoría genérica**: `audit_trigger()` aplicado a 12 tablas críticas.
- **Centros de costo y presupuestos**: tablas `cost_centers`, `budgets`, `budget_lines` existen; UI en `CostCentersTab` y `BudgetsTab`.
- **Recetas y combos**: `process_recipe_consumption` recursivo con merma y semielaborados (Bloque F).
- **CxC/CxP**: `accounts_payable`, `account_payments`, `sale_payments` operativos.
- **Marketplace + Delivery**: catálogo público, pedidos, repartidores, GPS realtime (Bloques C–D).

### Bugs y vacíos detectados
1. **No hay event bus**: cada módulo dispara triggers SQL directos a `journal_entries`. Cualquier nuevo módulo debe replicar lógica. **Falta capa única `post_financial_event()`**.
2. **No hay perfiles regionales**: el plan de cuentas, impuestos y reportes están codificados en `accounting_accounts` por tenant sin referenciar país/régimen. **Falta tabla `accounting_profiles` y `tenants.accounting_profile_id`**.
3. **Sin libro mayor materializado**: la balanza se calcula on-the-fly desde `journal_entry_lines`, lento y sin saldos por período.
4. **Sin cierre mensual/anual real**: `accounting_periods` y `fiscal_years` existen pero no hay función `close_period()` que bloquee asientos ni genere asiento de cierre de resultados.
5. **Flujo de caja inexistente**: no hay vista ni reporte `cash_flow_statement`.
6. **Conciliación bancaria incompleta**: `bank_reconciliations` existe pero sin función de matching automático contra `journal_entry_lines`.
7. **Cuba/Brasil no parametrizados**: no hay plantillas de plan de cuentas cubano/brasileño, ni configuración SPED/ECD/ECF/eSocial/NF-e.
8. **Delivery sin asiento de comisión**: entregas completadas no generan asiento de gasto por comisión al repartidor.
9. **Marketplace**: ya exige registro para confirmar (Bloque C) ✓. Falta validar que cada pedido confirmado dispare evento financiero al pagar.
10. **Devoluciones**: `sale_returns` no dispara reverso de COGS ni de impuestos.
11. **Fidelización**: `loyalty_movements` no genera asiento de pasivo por puntos emitidos.
12. **Dashboard financiero no realtime**: no hay subscripción a `journal_entries` en `Contabilidad.tsx`.

---

## 1. Arquitectura propuesta

```text
┌─────────────────────────────────────────────────────────────┐
│  Módulos operativos                                         │
│  POS · Ventas · Devoluciones · Compras · Inventario ·       │
│  Nómina · RRHH · Delivery · Marketplace · Fidelización ·    │
│  Recetas · Impuestos                                        │
└──────────────────────┬──────────────────────────────────────┘
                       │ INSERT financial_events (event_type, payload)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Financial Event Bus  (tabla financial_events + dispatcher) │
│  - status: pending | posted | failed                        │
│  - retry, idempotencia por (source_table, source_id, type)  │
└──────────────────────┬──────────────────────────────────────┘
                       │ post_financial_event(event_id)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Financial Core                                             │
│  ┌────────────────┐  ┌──────────────────┐                   │
│  │ Posting Rules  │◄─┤ Accounting       │                   │
│  │ por perfil país│  │ Profile (CU/BR)  │                   │
│  └────────┬───────┘  └──────────────────┘                   │
│           ▼                                                 │
│  journal_entries + journal_entry_lines (+cost_center, fx)   │
│  → general_ledger (mayor materializado)                     │
│  → trial_balance, income_statement, balance_sheet,          │
│    cash_flow, ar_aging, ap_aging                            │
└─────────────────────────────────────────────────────────────┘
```

### Bloque G — Event Bus + Posting Rules (migración 1)
- `financial_events(id, tenant_id, event_type, source_table, source_id, payload jsonb, status, error, posted_journal_id, created_at)` con UNIQUE(source_table, source_id, event_type) para idempotencia.
- `posting_rules(id, profile_id, event_type, debit_account_code, credit_account_code, amount_expr, condition)` configurable por perfil contable.
- Función `post_financial_event(event_id)`: lee la regla del perfil del tenant, crea asiento, marca evento `posted`.
- Refactor de triggers existentes: en lugar de insertar directo en `journal_entries`, insertan en `financial_events`. Un job (o trigger AFTER INSERT) llama a `post_financial_event`.

### Bloque H — Perfiles regionales (migración 2)
- `accounting_profiles(id, country_code, regime, name, base_currency, functional_currency, chart_template, fiscal_calendar jsonb, costing_method, regulatory_exports jsonb)`.
- `tenants.accounting_profile_id` FK.
- Seed: `CU-General`, `CU-MIPYME`, `BR-LucroReal`, `BR-LucroPresumido`, `BR-SimplesNacional`.
- `chart_of_accounts_templates` con plantillas:
  - **Cuba**: NCIF (Normas Cubanas de Información Financiera) — clases 1 Activo, 2 Pasivo, 3 Patrimonio, 4 Ingresos, 5 Gastos, 6 Costos, 7 Cuentas de orden.
  - **Brasil**: Plano Referencial SPED-ECD (ECD).
- Función `apply_accounting_profile(tenant_id, profile_id)` que materializa cuentas + reglas + impuestos.

### Bloque I — Cierre, Mayor materializado, Reportes (migración 3)
- `general_ledger(account_id, period_id, opening_debit, opening_credit, period_debit, period_credit, closing_balance)`.
- Función `recompute_ledger(tenant_id, period_id)`.
- Función `close_period(period_id)`: bloquea asientos (`accounting_periods.status='closed'`), valida balance=0, recalcula mayor.
- Función `close_fiscal_year(year_id)`: cierre de cuentas de resultado, asiento a Utilidad del Ejercicio.
- Vistas: `v_trial_balance`, `v_income_statement`, `v_balance_sheet`, `v_cash_flow`, `v_ar_aging`, `v_ap_aging`.

### Bloque J — Cuba específico (migración 4)
- Plantilla NCIF completa.
- Tablas `cu_tax_declarations` (DJ-08, DJ-09, ONAT), `cu_cost_sheets` (fichas de costo).
- Impuestos: ONAT, Impuesto sobre Ventas, Impuesto sobre Utilidades, Contribución a la Seguridad Social.
- Doble moneda CUP/MLC con tipo de cambio diario.
- Exportador a TXT/PDF de declaraciones ONAT.

### Bloque K — Brasil específico (migración 5)
- Plantilla SPED-ECD.
- Tablas `br_sped_exports`, `br_nfe_documents`, `br_eSocial_events`.
- Motor tributario por estado/municipio: `br_tax_rates(state, municipio, tax_type, rate)`.
- Documentos fiscais: NF-e, NFC-e, NFS-e (estructura XML SEFAZ).
- Exportadores: ECD, ECF, EFD-Contribuições, EFD-ICMS/IPI, eSocial.

### Bloque L — Conciliación, Flujo de caja, Delivery, Devoluciones (migración 6)
- `reconcile_bank_statement(statement_id)`: matching automático por monto+fecha±3d contra `journal_entry_lines`.
- Trigger en `delivery_assignments` con `status='completed'` → `financial_events` (gasto por comisión).
- Trigger en `sale_returns` → reverso COGS, impuestos y cobro.
- Trigger en `loyalty_movements` → pasivo por puntos emitidos.

### Bloque M — Realtime UI Financiera
- `ALTER PUBLICATION supabase_realtime ADD TABLE journal_entries`.
- En `Contabilidad.tsx` y `AccountingReports.tsx`: subscripción a `journal_entries` para refrescar reportes en vivo.
- Selector de perfil contable en Configuración → Empresa.

---

## 2. Plan de ejecución por turnos

Implementación en 6 migraciones secuenciales. Cada bloque incluye:
- migración SQL completa
- actualización de tipos TS
- ajustes mínimos de UI cuando aplique

1. **Bloque G** — Event bus + posting_rules + refactor triggers existentes.
2. **Bloque H** — accounting_profiles + chart templates + seed CU/BR.
3. **Bloque I** — general_ledger + cierre + vistas de reportes.
4. **Bloque J** — Perfil Cuba completo (NCIF, ONAT, fichas de costo).
5. **Bloque K** — Perfil Brasil completo (SPED, NF-e, eSocial, ICMS/ISS).
6. **Bloque L** — Conciliación auto + devoluciones + delivery + fidelización.
7. **Bloque M** — Realtime + selector de perfil en UI.

## 3. Detalles técnicos

- Idempotencia: `financial_events` con UNIQUE(source_table, source_id, event_type) evita doble contabilización.
- FX: cada evento captura `exchange_rate` al momento; reposting respeta tasa histórica.
- RLS: todas las nuevas tablas con `tenant_id` y políticas vía `tenant_users`.
- GRANT explícito: `authenticated` + `service_role` en cada CREATE TABLE.
- Auditoría: `audit_trigger()` se extiende a `financial_events`, `posting_rules`, `general_ledger`, `accounting_profiles`.
- Performance: `general_ledger` indexado por (tenant_id, period_id, account_id); reportes leen del mayor materializado, no del diario.
- Migración no destructiva: los triggers existentes (Bloque B) se reemplazan, pero los asientos ya contabilizados quedan intactos.

## 4. Confirmación esperada al cierre

Al terminar los 7 bloques, todo módulo operativo (POS, compras, nómina, inventario, marketplace, delivery, fidelización, devoluciones, recetas) escribirá en `financial_events`, el bus despachará al motor contable con reglas del perfil del tenant, y los reportes (libro diario, mayor, balanza, ER, BG, flujo de caja, CxC, CxP) leerán del mayor materializado en realtime — todo parametrizado por país/régimen sin reglas hardcoded.

---

¿Apruebas este plan? Empiezo por el **Bloque G (Event Bus + Posting Rules)** en cuanto digas.
