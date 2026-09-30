# Arquitectura actual

```text
React SPA (Vite, PWA) ── Dexie (maria_offline_v1: pending_ops, snapshots, customers, meta)
      │  supabase-js (anon key + JWT)
      ▼
Lovable Cloud
  ├─ Postgres: ~140 tablas, RLS por tenant (is_tenant_member, sa_active_tenant)
  ├─ RPC SECURITY DEFINER: pos_checkout, create_quick_operation, sync_offline_operation,
  │   place_order_group, compute_payroll_full, close_shift_z, resolve_account_strict...
  ├─ Triggers: audit_trigger, inmutabilidad, sync products.stock ← product_stock, domain events
  ├─ Realtime: mesas, cocina, delivery, driver_locations
  └─ Edge Functions (21): agent-runner, risk-scanner, inventory-intelligence, logistics-optimizer,
      workflow-runner, mcp, api-v1, webhook-dispatcher, data-center, import-products,
      provision-business, manage-users, audit-logs, check/register-superadmin,
      ensure-demo-user, seed-demo, seed-demo-users, public-demo-stats,
      send-invoice-email, transmit-invoice
```

Capas frontend: `src/pages` (pantallas), `src/components/<dominio>`, `src/hooks`, `src/lib/{finance,offline,mcp}`, `src/modules/<bc>/{domain,application,infrastructure,ui}` (hexagonal, solo inventory/events/intelligence).

Deuda arquitectónica: coexistencia `useTenant` / `useTenantContext`; módulos hexagonales solo parciales; `financial_events` y triggers legacy coexisten.
