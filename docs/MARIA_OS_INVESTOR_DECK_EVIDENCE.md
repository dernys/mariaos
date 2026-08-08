# MarIA OS — Investor Deck Evidence Report (internal)

Date of audit: **2026-08-08** · Method: static code inspection + live SQL against the platform database + programmatic UI capture via headless Chromium as an authenticated admin.
This document is the audit trail for `docs/MARIA_OS_INVESTOR_PITCH_DECK.md`. Nothing may appear in the deck that is not sourced here.

---

## 1. Source of each metric

| Metric in deck | Value | Source |
|---|---|---|
| Public tables | 130 | `select count(*) from pg_tables where schemaname='public'` |
| Tables without RLS | 0 | `pg_tables` left-joined against `pg_class.relrowsecurity` |
| RLS policies | 372 | `pg_policies` (schema `public`) |
| Server-side functions | 177 | `pg_proc` × `pg_namespace` (schema `public`) |
| Triggers (non-internal) | 203 | `pg_trigger` where `not tgisinternal` |
| Views | 17, **all** `security_invoker` | `pg_class.reloptions` where `relkind='v'` → 17/17 |
| Edge functions | 17 | `ls supabase/functions` |
| Application screens | 56 | `ls src/pages` |
| Frontend LOC (ts/tsx) | 48,918 | `find src -name '*.ts*' \| xargs wc -l` |
| Unit tests | 66 passing in 7 files | `bunx vitest run` → "Test Files 7 passed, Tests 66 passed" |
| Integration / E2E tests | 0 | no runner, no spec files outside domain folders |
| Pages querying DB directly | 38 of 56 | `rg -l "supabase.from" src/pages` |
| Pages with server-side table pagination | 3 | `rg -l "useServerTable" src/pages` |
| Files consuming permission gate | 5 | `rg -l "PermissionGate\|usePermissions" src` |
| Tenants | 6 (3 populated, 3 structure-only) | `select count(*) from tenants` + per-tenant counts |
| Domain events | 248 | `select count(*) from domain_events` |
| Knowledge graph | 206 nodes / 279 edges | `kg_nodes`, `kg_edges` |
| Agent actions | 25 | `agent_actions` |
| Business decisions | 8 | `business_decisions` |
| Business memory records | 5 | `business_memory` |
| Risk alerts | 0 | `risk_alerts` |
| Workflows configured | 0 | `workflows` |
| Webhooks registered | 0 | `webhooks` |
| Role permission rows | 175 across 35 modules | `role_permissions`, `app_modules` |
| Activity log entries | 5,261 | `activity_log` |
| Online orders / product reviews | 12 / 54 | `online_orders`, `product_reviews` |
| i18n locales | 3 (es, en, pt-BR) | `src/i18n/locales/` |
| MCP tools exposed | 5, OAuth-scoped | `src/lib/mcp/index.ts`, `supabase/functions/mcp/index.ts` |

## 2. Per-tenant data verification

| Tenant | Type | Demo | Products | Sales | Customers | Employees | Purchases | Journal entries | Stock moves | Accounts | Users | Invoices | Shifts |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Bar El Trópico | bar | yes | 32 | 24 | 8 | 7 | 10 | 33 | 75 | 53 | 3 | 0 | 2 |
| Restaurante La Mesa | restaurant | yes | 34 | 20 | 10 | 9 | 10 | 30 | 57 | 55 | 3 | 0 | 2 |
| TechStore Cuba | empresa | yes | 30 | 18 | 10 | 7 | 8 | 27 | 26 | 56 | 5 | 8 | 2 |
| Bar MarIA Demo | bar | no | 0 | 0 | 3 | 3 | 0 | 0 | 0 | 46 | 4 | 0 | 0 |
| Restaurante MarIA Demo | restaurant | no | 0 | 0 | 3 | 4 | 0 | 0 | 0 | 46 | 4 | 0 | 0 |
| Retail MarIA Demo | empresa | no | 0 | 0 | 3 | 3 | 0 | 0 | 0 | 46 | 4 | 0 | 0 |

Consequence for the deck: only the first three may be described as populated demos. The three "MarIA Demo" tenants are **structure-only** and are explicitly labeled 🟡 in slide 9.

## 3. Financial engine audit

Checks executed against `journal_entries` / `journal_entry_lines` (note: the join column is `entry_id`, not `journal_entry_id`), `general_ledger`, `sales`, `accounts_payable`, `account_payments`, `bank_accounts`, `shift_cash_movements`, `tax_rates`, `fiscal_rules`, `currencies`.

| Check | Bar El Trópico | Restaurante La Mesa | TechStore Cuba | Verdict |
|---|---|---|---|---|
| Σ debit | 135,500.00 | 197,258.00 | 1,917,537.00 | — |
| Σ credit | 135,500.00 | 197,258.00 | 1,917,537.00 | **Balanced to the cent** ✅ |
| Completed sales without a journal entry | 0 | 0 | 0 | ✅ |
| General ledger rows | 82 | 82 | 82 | ✅ populated |
| Accounts payable | 7 | 2 | 13 | ✅ |
| Payments registered | 1 | 0 | 0 | ⚠️ barely exercised |
| Bank accounts | 0 | 0 | 0 | ❌ banking/reconciliation unproven |
| Shift cash movements | 0 | 0 | 1 | ❌ cash flow barely exercised |
| Tax rates configured | 6 | 7 | 8 | ✅ |
| Fiscal rules configured | 0 | 0 | 0 | ❌ fiscal engine unconfigured per tenant |
| Currencies configured | 3 | 3 | 3 | ✅ multi-currency real |
| `tenant_id` present on all financial tables | yes | yes | yes | ✅ |
| RLS on all financial tables | yes | yes | yes | ✅ |

**Conclusion carried into the deck:** the double-entry core is correct and provable; banking, cash flow and fiscal configuration are not. Slide 5 and slide 6 therefore state **"Financial Engine — Requires Hardening"** rather than presenting it as production-ready.

## 4. Verified functionality (may be claimed as 🟢 LIVE)

Multi-tenancy and tenant switching · RBAC matrix with server-side resolution (`my_permissions`) · POS in three vertical variants with active-shift gating, parked sales, split bills, receipt printing, credit sales blocked without an associated customer/employee · sales and sale returns · purchases with receiving and payables · inventory with kardex, lots, serials, variants, warehouse↔store association, transfers with carrier tracking, physical counts, recipe consumption · shifts with one-open-shift-per-store enforcement and PIN-verified worker assignment · chart of accounts with templates, journal, general ledger, fiscal years, periods and closing · server-side financial statements (P&L, balance sheet, trial balance, journal, ledger) · analytics/BI layer with period presets, comparison deltas, ABC analysis and export · realtime for tables, kitchen and dashboard · audit/activity log · i18n (es/en/pt-BR) · PWA install and offline shell.

## 5. Partial functionality (must be marked 🟡)

AI agents (7 per tenant, 5 AI edge functions, 25 actions, 8 decisions; no guardrails, no evaluation, no cost caps) · knowledge graph · digital twin (single-scenario UI over a tested pure engine) · event store in shadow mode (not source of truth) · marketplace and online orders (order capture only, no payments) · invoicing (only TechStore has invoices) · treasury and cash flow · HR (structures complete, low real usage) · fiscal/tax engine (generic computation present, per-tenant rules empty) · MCP integrations · delivery.

## 6. Non-existent functionality (must be ⚪ ROADMAP or omitted)

Subscription billing and plan gating · AI usage metering and quotas · payment processing (marketplace or subscriptions) · self-service onboarding/sign-up funnel · bank feed integrations and automated reconciliation at scale (tables exist, 0 bank accounts) · configured automation workflows (0) · registered webhooks (0) · e-invoicing transmission to a live tax authority · integration/E2E test suite · SOC2/ISO-type compliance artifacts.

## 7. Screenshots used

All captured on 2026-08-08 from `http://localhost:8080` at 1440×900, authenticated as an admin of "Bar El Trópico", using headless Chromium with the injected session. No stock imagery, no AI-generated interfaces, no mockups. Full index: `docs/MARIA_OS_SCREENSHOT_INVENTORY.md`.

Observations recorded during capture (disclosed rather than hidden):
- `dashboard.png` shows zero sales for the default 7-day window because seeded transactions predate it; the inventory value tile ($444,615) and category structure are real.
- `contabilidad.png` shows the account "Saldo" column as $0 for every account although the general ledger has rows — a UI/aggregation gap, logged as a product gap.
- `digital-twin.png` explicitly warns that no sales exist in the last 30 days and falls back to the last active window — honest degradation, kept as-is.
- Console output contains React `forwardRef` and unknown-prop warnings; no blocking runtime errors on the captured routes.

## 8. Maturity score calculation

16 areas scored 0–5 from the evidence above: core platform 4, multi-tenancy 4, POS 4, inventory 4, procurement 3, accounting 3, finance 2, HR 2, AI 2, digital twin 2, security 3, RBAC 3, reporting 3, observability 3, automated testing 1, SaaS readiness 1.
Sum = **43**. Areas = **16**. Unweighted mean = 43 / 16 = **2.6875 → 2.7 / 5**.
No weighting was applied, so the figure is reproducible from the table alone.

## 9. Financial assumptions

- Replacement/valuation context comes from a prior internal exercise (`/mnt/documents/MarIA-OS-Dossier-Comercial.md`) and is **not** presented as a market valuation in this deck.
- No revenue, MRR, ARR, ARPU, CAC, LTV, churn or NRR figure exists. All such rows in slide 8 are labeled Target/Projection with an explicit "0 / not available" actual.
- The proposed R$500k–R$1.5M range is an indicative reference for a pre-seed round in Brazil; it is not a committed, structured or open round, and slide 10 says so.

## 10. Market assumptions

None. No TAM/SAM/SOM study exists in the project and none was fabricated. Slide 9 states "Market sizing requires external validation" and lists commissioning that study as a use of funds.

## 11. Risks

1. **Financial hardening risk** — banking, reconciliation and cash flow are the least exercised paths in the most sensitive module.
2. **Regression risk** — 66 pure unit tests cannot protect a 130-table transactional system; no integration or E2E coverage.
3. **Fiscal compliance risk** — Cuban and Brazilian fiscal modules are scaffolded, not certified; `fiscal_rules` is empty in every tenant.
4. **AI cost/quality risk** — no metering, ceilings or output evaluation on agent runs.
5. **Commercial risk** — zero customers means every ROI and pricing statement is unvalidated.
6. **Architecture debt** — 38/56 pages couple UI directly to the database; only 3 pages paginate server-side, which will bite at real data volumes.
7. **Security surface** — 5 edge functions run with `verify_jwt = false` and require independent review.

## 12. Requires validation before any external use

Pricing and packaging · customer ROI figures · TAM/SAM/SOM · churn and retention assumptions · fiscal certification claims for Cuba and Brazil · any statement that the three "MarIA Demo" tenants are functional demos · the account balance figures shown in the chart-of-accounts screen until the aggregation gap is fixed.
