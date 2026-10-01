# Estado real de módulos (2026-09-30)

Leyenda: FUNCIONA · PARCIAL · MOCK · NO IMPL. "Probado" = existe evidencia en TESTING_MASTER.

| Módulo | Estado | Probado | Nota |
|---|---|---|---|
| Auth / Superadmin / selector tenant | FUNCIONA | parcial | Falta test A↔B autenticado |
| RBAC (role_permissions, PermissionGate) | FUNCIONA | no automatizado | |
| POS tienda/bar/restaurante | FUNCIONA (online) | unit stockRule | Stock por tienda; offline aún usa global |
| Pagos múltiples (Cuba) | FUNCIONA | E2E 12/12 (manual SQL) | |
| Turnos / caja / cierre Z | FUNCIONA | E2E manual | |
| Inventario / kardex / lotes / seriales | FUNCIONA | unit (product) | |
| Stock por ubicación | PARCIAL | no | Trigger de sincronización global recién añadido; checkout no valida tienda |
| Transferencias | PARCIAL | no | Tránsito sin asiento |
| Compras / CxP | FUNCIONA | E2E manual | |
| Ventas / devoluciones / facturas | FUNCIONA | E2E manual | |
| Contabilidad (maestro, resolver estricto, reportes) | FUNCIONA | invariants.test | |
| Fiscalidad genérica | FUNCIONA | no | Datos legales solo Cuba (y BR parcial) |
| Tesorería / bancos | PARCIAL | no | |
| RRHH / nómina | FUNCIONA | payrollInvariants.test | Devengo como CxP pendiente |
| Delivery | PARCIAL | no | Comisión sin asiento |
| Marketplace | FUNCIONA | no | |
| Fidelización | PARCIAL | no | |
| Data Center (import/export/backup) | FUNCIONA | productImport.test | |
| Offline (Dexie outbox) | PARCIAL | idempotency.test | Sin pruebas multi-device ni reconciliación de stock |
| IA agentes / riesgos / gemelo | PARCIAL | twin.test | Recomendación; sin control plane ni estados VERIFIED/ROLLED_BACK |
| Workflows | PARCIAL | no | Sin compensación/reintentos formales |
| Event store | FUNCIONA (shadow) | domainEvent.test | |
| API v1 / MCP / Webhooks | FUNCIONA | no | api-v1 sin rate limit |
