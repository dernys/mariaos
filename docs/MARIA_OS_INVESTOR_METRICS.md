# MarIA OS — Investor Metrics (internal)

Date: **2026-08-08**. Categories are never mixed. If a number is not under **VERIFIED**, it must not be presented as fact.

---

## VERIFIED — measured in the system on 2026-08-08

### Platform
| Metric | Value |
|---|---|
| Public tables | 130 |
| Tables without RLS | 0 |
| RLS policies | 372 |
| Server-side functions (schema `public`) | 177 |
| Non-internal triggers | 203 |
| Views | 17 (17/17 with `security_invoker`) |
| Edge functions | 17 |
| Application screens | 56 |
| Frontend LOC (ts/tsx) | 48,918 |
| i18n locales | 3 (es, en, pt-BR) |
| MCP tools exposed | 5 |
| Unit tests passing | 66 in 7 files |
| Integration / E2E tests | 0 |
| Pages with direct DB access | 38 / 56 |
| Pages with server-side pagination | 3 |
| Files using the permission gate | 5 |

### Tenancy and data
| Metric | Value |
|---|---|
| Tenants | 6 |
| Tenants with transactional data | 3 |
| Tenants structure-only | 3 |
| Business types supported in production code | bar, restaurant, empresa (retail/B2B) |
| Modules in registry | 35 |
| Role permission rows | 175 |
| Activity log entries | 5,261 |

### Operations (populated demo tenants)
| Metric | Bar El Trópico | Restaurante La Mesa | TechStore Cuba |
|---|---|---|---|
| Products | 32 | 34 | 30 |
| Sales | 24 | 20 | 18 |
| Purchases | 10 | 10 | 8 |
| Customers | 8 | 10 | 10 |
| Employees | 7 | 9 | 7 |
| Inventory movements | 75 | 57 | 26 |
| Shifts | 2 | 2 | 2 |
| Invoices | 0 | 0 | 8 |
| Users assigned | 3 | 3 | 5 |
| AI agents | 7 | 7 | 7 |

### Finance
| Metric | Bar El Trópico | Restaurante La Mesa | TechStore Cuba |
|---|---|---|---|
| Journal entries | 33 | 30 | 27 |
| Σ debit | 135,500.00 | 197,258.00 | 1,917,537.00 |
| Σ credit | 135,500.00 | 197,258.00 | 1,917,537.00 |
| Debit = credit | yes | yes | yes |
| Completed sales without journal entry | 0 | 0 | 0 |
| General ledger rows | 82 | 82 | 82 |
| Chart of accounts | 53 | 55 | 56 |
| Accounts payable | 7 | 2 | 13 |
| Payments registered | 1 | 0 | 0 |
| Bank accounts | 0 | 0 | 0 |
| Shift cash movements | 0 | 0 | 1 |
| Tax rates | 6 | 7 | 8 |
| Fiscal rules | 0 | 0 | 0 |
| Currencies | 3 | 3 | 3 |

### Intelligence
| Metric | Value |
|---|---|
| Domain events (shadow store) | 248 |
| Knowledge graph nodes / edges | 206 / 279 |
| Agent actions recorded | 25 |
| Business decisions | 8 |
| Business memory records | 5 |
| Risk alerts | 0 |
| Workflows configured | 0 |
| Webhooks registered | 0 |
| Online orders | 12 |
| Product reviews | 54 |

### Commercial
| Metric | Value |
|---|---|
| Paying customers | 0 |
| MRR | 0 |
| ARR | 0 |
| Revenue to date | 0 |
| Funding raised to date | 0 |
| Published prices | none |

---

## INFERRED — derived by analysis, not directly measured

| Metric | Value | Derivation |
|---|---|---|
| Product maturity | **2.7 / 5** | Unweighted mean of 16 area scores (43/16), scores justified in `MARIA_OS_PRODUCT_MATURITY.md` |
| Functional module coverage | 4 layers (Core, Operations, Finance, Intelligence) with 🟢 coverage in the first three | Route map (56 routes) cross-checked against populated tables |
| Financial engine correctness | Correct in the double-entry core; unproven in banking/cash | Balance checks pass; bank/cash tables near-empty |
| Vertical readiness | bar 🟢, restaurant 🟢, retail/B2B 🟢, services ⚪ (no service-specific module set) | `business_type` handling in POS/sidebar plus tenant data |
| Regression exposure | High | 66 pure unit tests vs 130 transactional tables, 0 integration tests |
| Scale exposure | Medium-high | 38/56 pages query directly, 3 paginate server-side |
| Replacement cost of built software | Materially above the proposed round | Prior internal dossier estimate; not a valuation |

---

## TARGET — objectives, not results

| Metric | Target |
|---|---|
| Pilot customers | 5–10 after funding |
| Product maturity | 4.0 / 5 (production ready) before paid general availability |
| Test coverage | Integration suite for the financial engine + E2E for POS→accounting |
| Financial engine | Bank accounts, reconciliation and cash flow exercised on real customer data |
| Fiscal engine | `fiscal_rules` configured and validated for Cuba and Brazil |
| Billing | Subscription billing, plan gating and AI usage metering implemented |
| Security | External security audit; review of the 5 `verify_jwt = false` functions |
| First recurring revenue | First paid contracts within the funded period |

---

## PROJECTED — financial projections (hypothetical)

| Item | Projection | Basis |
|---|---|---|
| Proposed pre-seed range | R$500k – R$1.5M | Indicative reference for a Brazil pre-seed; no round open or committed |
| Use of funds split | Product hardening, Brazil entry, AI, sales, security, team | Founder plan, no external validation |
| Pricing tiers (Starter/Professional/Business/Enterprise) | To be defined during pilot pricing tests | Pricing hypothesis only |
| ARPU / MRR / ARR ramp | Not modeled — no pricing and no cohort data | Requires pilot data first |
| Gross margin | Not modeled — depends on AI inference cost per tenant | Requires metering |
| Illustrative ROI scenario (12 employees, 2 stores, ~2,500 monthly transactions) | Consolidation of 3–5 vendor line items and reduction of manual reconciliation hours | Hypothetical, explicitly not customer data |

---

## UNKNOWN — does not exist yet

TAM, SAM, SOM · ARPU · CAC · LTV · churn · net revenue retention · gross margin · sales cycle length · conversion rate · customer-validated ROI · NPS · uptime/SLA history · production load characteristics · cost per AI agent run · certified fiscal compliance status for any country · competitive win/loss data.

Standard phrasing for all of the above in external material: **"Not available currently — requires commercial validation."**
