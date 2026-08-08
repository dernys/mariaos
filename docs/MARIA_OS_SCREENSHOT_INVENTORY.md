# MarIA OS — Screenshot Inventory

All images below are **real captures of the running application**, taken on **2026-08-08** at 1440×900 from `http://localhost:8080` with headless Chromium, authenticated as an admin of the demo tenant **Bar El Trópico** (marketplace and landing captured on public routes). No stock images, no mockups, no AI-generated interfaces.

Location: `docs/screenshots/`

| # | Screenshot | Module | Route | Functionality demonstrated | Status | Used in slide |
|---|---|---|---|---|---|---|
| 1 | `dashboard.png` | Executive dashboard | `/dashboard` | Period presets and custom range, comparison toggle, KPI tiles (sales, transactions, units, average ticket, gross margin, customers served, inventory value $444,615, pending collections), sales evolution, category mix, sales by hour, per-store performance | 🟢 LIVE | 1 (cover), 4 |
| 2 | `pos.png` | Point of Sale — Bar variant | `/pos` | Active-shift banner with store and start time, service-bar catalog (27 products) with category filters, barcode/search field, parked sales, live cart with subtotal, 10% tax and total | 🟢 LIVE | 4 |
| 3 | `contabilidad.png` | Accounting | `/contabilidad` | Assets/liabilities/income/expenses headline figures, chart of accounts (56 accounts, 56 postable) with search and type/nature/status filters, template import, fiscal years and periods, operation/analysis/fiscal tabs | 🟢 LIVE (balance column shows 0 — known gap) | 4 |
| 4 | `reportes.png` | Reports & BI | `/reportes` | Server-side financial statements (P&L, balance sheet, trial balance, journal, ledger), period selection, export | 🟢 LIVE | 4 |
| 5 | `digital-twin.png` | Digital Twin | `/digital-twin` | 30-day revenue base 413,405 CUP, average ticket, gross margin 24.1%, cash runway, scenario levers (price/cost/demand/fixed costs/horizon), projected P&L, break-even and top-5 concentration, knowledge-graph and signals tabs, explicit warning when the window has no sales | 🟡 PARTIAL | 4, 5 |
| 6 | `command-center.png` | AI Command Center | `/command-center` | Agent roster with status and autonomy, pending business decisions, operational signals for the active tenant | 🟡 PARTIAL | 4, 5 |
| 7 | `inventario.png` | Inventory | `/inventario` | Product catalog with stock, searchable filters, stock adjustments, movement history, low-stock signals | 🟢 LIVE | Appendix / on request |
| 8 | `compras.png` | Purchases | `/compras` | Purchase orders, receiving, supplier selection, payables generation | 🟢 LIVE | Appendix / on request |
| 9 | `turnos.png` | Shifts & cash | `/turnos` | Shift list with store/cashier, open/close state, cash totals, one-open-shift-per-store enforcement | 🟢 LIVE (cash flow barely exercised) | Appendix / on request |
| 10 | `analytics.png` | Analytics | `/analytics` | Filter bar, KPI tiles with deltas, charts and analytical tables with pagination/export | 🟢 LIVE | Appendix / on request |
| 11 | `agents.png` | AI Agents | `/agents` | 7 configured agents per tenant, type, status, autonomy level, last run | 🟡 PARTIAL | Appendix / slide 5 |
| 12 | `risk.png` | Risk Engine | `/risk` | Risk scanner entry point and alert list (0 alerts generated to date) | 🔵 IN DEVELOPMENT | Appendix / slide 5 |
| 13 | `rrhh.png` | HR | `/rrhh` | Employees, contracts, attendance, schedules, payroll runs | 🟡 PARTIAL | Appendix / on request |
| 14 | `tesoreria.png` | Treasury | `/tesoreria` | Cash position and forecast view (0 bank accounts configured) | 🟡 PARTIAL | Appendix / slide 6 |
| 15 | `marketplace.png` | Marketplace | `/marketplace` | Public catalog, filters, sorting, cart sheet, product reviews (54 reviews) | 🟡 PARTIAL (order capture, no payments) | Appendix / on request |
| 16 | `marketplace-mobile.png` | Marketplace (mobile) | `/marketplace` | Mobile-first responsive marketplace layout | 🟡 PARTIAL | Appendix / on request |
| 17 | `landing.png` | Public landing | `/` | Product landing with live demo metrics and role-based demo access | 🟢 LIVE | Appendix / on request |
| 18 | `auth.png` | Authentication | `/auth` | Sign-in with demo account panel and role selection | 🟢 LIVE | Appendix / on request |

## Capture notes (disclosed, not corrected in the images)

- `dashboard.png` — the default 7-day range contains no seeded sales, so revenue tiles read $0 while inventory value and structure are real. When demoing live, select a 90-day or year range.
- `contabilidad.png` — the per-account "Saldo" column renders $0 even though the general ledger has 82 rows per tenant; this is an aggregation gap in the view, logged in the maturity assessment.
- `digital-twin.png` — the screen itself states that no sales exist in the last 30 days and analyses the last active window instead.
- Console during capture contained only React `forwardRef` / unknown-prop warnings; no blocking runtime errors on any captured route.
- Screens not captured because they hold no meaningful data in the demo tenants (and therefore must not be shown to investors as evidence): workflows (0 configured), webhooks (0 registered), bank reconciliation (0 bank accounts).
