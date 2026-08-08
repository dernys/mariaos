# MarIA OS — Product Maturity Assessment

Date: **2026-08-08** · Scale: **0** none · **1** conceptual · **2** prototype · **3** implemented · **4** production ready · **5** enterprise ready.
Every score is justified by evidence collected in `MARIA_OS_INVESTOR_DECK_EVIDENCE.md`. No score is aspirational.

## Scorecard

| # | Area | Score | Evidence for the score | What blocks the next level |
|---|---|---|---|---|
| 1 | Core platform | **4** | 56 screens, 130 tables, 3 locales, audit log (5,261 entries), PWA with offline shell, command palette, notifications | Direct DB coupling in 38/56 pages; no design-system regression tests |
| 2 | Multi-tenancy | **4** | 0/130 tables without RLS, 372 policies, security-definer helpers with fixed `search_path`, tenant context switcher, 6 live tenants | No tenant-level resource quotas or noisy-neighbour controls; no per-tenant backup/restore |
| 3 | POS | **4** | Three vertical variants (bar/restaurant/enterprise), shift gating, parked sales, split bills, thermal receipt printing, barcode scanning, credit sale blocked without customer/employee | No offline-first sale queue proven under failure; no E2E test of the sale flow |
| 4 | Inventory | **4** | Kardex, lots, serials, variants, warehouse↔store many-to-many, transfers with carrier tracking and event timeline, physical counts, recipe consumption; 158 movements across demos | Valuation methods not user-selectable; no cycle-count scheduling |
| 5 | Procurement | **3** | Purchases with receiving, supplier products and costs, automatic payables (22 rows across demos), purchase journal posting | Only 1 payment registered across all tenants — payment path barely exercised; no approval workflow |
| 6 | Accounting | **3** | Balanced double entry in all 3 tenants (debit = credit exactly), 0 completed sales without an entry, general ledger populated, fiscal years, periods, closing, chart templates | Account "Saldo" column renders 0 in the UI despite ledger rows; no auditor-grade export; no multi-book support |
| 7 | Finance (cash, banks, treasury) | **2** | Cash movement RPC posts journal entries; treasury forecast RPC; A/R and A/P present | **0 bank accounts and 1 cash movement in the entire database** — reconciliation, bank statements and cash flow are effectively unproven |
| 8 | HR | **2** | Employees (26 across demos), contracts, attendance, schedules, leave, payroll computation and posting RPCs, employee portal | Payroll not run on real data at volume; no legal payroll certification |
| 9 | AI | **2** | 7 agents per tenant, 5 AI edge functions, 25 recorded actions, 8 decisions with approval flow, autonomy levels, correlation IDs end-to-end | No cost ceilings, no usage metering, no output evaluation harness, low decision volume, 0 risk alerts generated |
| 10 | Digital twin | **2** | Pure simulation domain with 14 unit tests; scenario UI over real aggregates (413,405 CUP base for the bar tenant) | Single scenario at a time, no saved scenarios or comparisons, degrades when the window has no sales |
| 11 | Security | **3** | RLS on every table, roles in a separate table, fixed `search_path` on functions, all 17 views `security_invoker`, rate limiting on auth functions | 5 edge functions with `verify_jwt = false`; no external audit; no pen test; no compliance artifacts |
| 12 | RBAC | **3** | `role_permissions` matrix (175 rows / 35 modules), `my_permissions` RPC resolving the union of roles server-side, `PermissionGate` component, route-level module guards | Only 5 files consume the gate — most action-level UI is not permission-governed |
| 13 | Reporting | **3** | Server-side P&L, balance sheet, trial balance, journal, ledger; BI layer with presets, deltas, sparklines, ABC analysis, export; accounting audit panel | Balance display bug in the chart of accounts; no scheduled/emailed reports; no report versioning |
| 14 | Observability | **3** | Correlation IDs propagated client → edge → DB, activity log, audit page, event divergence panel, 248 domain events | No external APM/alerting, no SLO dashboards, no error budget |
| 15 | Automated testing | **1** | 66 unit tests in 7 files, all pure domain (money, invariants, idempotency, product, events, twin) | 0 integration tests, 0 E2E, no CI gate on coverage for the transactional core |
| 16 | SaaS readiness | **1** | Module registry and per-tenant module settings; tenant API keys; public API function | No billing, no plan gating, no metering, no self-service sign-up, no dunning, no trial mechanics |

**Sum = 43 · Areas = 16 · Current Product Maturity = 43 / 16 = 2.7 / 5**

## Verdict by layer

| Layer | Verdict |
|---|---|
| Core & Operations | **Production-adjacent** — the strongest part of the product; needs test coverage and data-access refactoring, not redesign |
| Finance | **Requires Hardening** — the double-entry core is provably correct, but banking, cash flow and fiscal configuration are not exercised |
| Intelligence & AI | **Prototype-plus** — real code on real data, missing guardrails, metering and evaluation |
| Commercial (SaaS) | **Not started** — billing, packaging and metering are absent |

## Strengths

1. Multi-tenant isolation with zero RLS gaps across 130 tables and 372 policies.
2. Operations-to-accounting integration that balances to the cent in every populated tenant, with no completed sale missing its journal entry.
3. Functional breadth in one codebase: POS, inventory, procurement, finance, HR, BI, marketplace.
4. Vertical adaptivity — bar, restaurant and enterprise tenants share the core and differ by module set.
5. Intelligence layer already reading governed production data (knowledge graph, twin, agents, event store).

## Gaps

1. Financial engine hardening: banks, reconciliation, cash flow, per-tenant fiscal rules.
2. Test pyramid: no integration or end-to-end coverage of the transactional core.
3. SaaS commercial layer: billing, plan gating, AI usage metering, self-service onboarding.
4. Architectural debt: 38/56 pages query the database directly; 3 pages paginate server-side.
5. AI governance: cost ceilings, output evaluation, and enough decision volume to prove usefulness.

## Path to 4.0 / 5

1. Integration + E2E suite over POS → inventory → accounting, gated in CI.
2. Bank accounts, statements and reconciliation exercised end-to-end; cash flow closed against the ledger.
3. Fix the chart-of-accounts balance aggregation and add auditor-grade exports.
4. Configure and validate `fiscal_rules` for Cuba and Brazil.
5. Extend permission gating to action level across the operational pages.
6. Add billing, plan gating and AI metering.
7. External security review, including the 5 `verify_jwt = false` functions.
