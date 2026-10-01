# Testing

Suite Vitest (12 ficheros): finance (idempotency, invariants, payrollInvariants), domain (money, product, domainEvent, twin), productImport, seguridad `anon` (isolation, tenant-isolation, superadmin-context).

Pruebas manuales registradas históricamente: E2E financiero 12/12 vía SQL; provisión de negocio + login admin.

Huecos por prioridad: 1) cross-tenant autenticado · 2) RBAC server-side · 3) RLS por tabla · 4) POS stock por tienda · 5) pagos · 6) contabilidad E2E automatizada · 7) offline multi-device · 8) Edge Functions · 9) acciones IA.

## Registro de ejecuciones
| Fecha | Alcance | Resultado |
|---|---|---|
| 2026-09-30 | Creación de MASTER files (sin cambios de código) | n/a |
| 2026-09-30 | POS stock por tienda (stockRule) | 4/4 OK; E2E pendiente |
