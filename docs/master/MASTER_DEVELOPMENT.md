# MarIA OS — MASTER DEVELOPMENT (documento raíz)

Actualizado: 2026-09-30. Fuente de verdad: repositorio + Lovable Cloud. Este documento **manda** sobre cualquier documento anterior de `/docs` (ver "Documentación heredada").

## 1. Propósito y visión
Sistema operativo de negocio multi-tenant para pymes de Cuba y LatAm: POS (tienda, bar, restaurante), inventario multi-ubicación, caja/turnos, contabilidad de partida doble gobernada por maestro de cuentas, RRHH/nómina, marketplace público, delivery, y capa de IA (agentes, riesgos, gemelo digital).

## 2. Alcance real
- SPA React 18 + Vite + TS, PWA con Dexie/IndexedDB offline.
- Backend Lovable Cloud (Postgres + RLS + RPC `SECURITY DEFINER` + 21 Edge Functions).
- 61 páginas, ~140 tablas, 185 migraciones, 12 ficheros de test (unitarios + seguridad `anon`).

## 3. Arquitectura objetivo
Ver `ARCHITECTURE.md`. Lógica de negocio con impacto económico **solo en RPC transaccionales server-side**; el frontend nunca escribe directamente en tablas financieras.

## 4. Principios no negociables
1. Tenant resuelto server-side (`active_tenant_id`, `sa_active_tenant`, `_shared/tenantScope.ts`). Nunca confiar en `tenant_id` del cliente.
2. Superadmin GLOBAL ≠ TENANT: `is_superadmin()` nunca es bypass de datos.
3. Roles en `user_roles` + `role_permissions`; nunca en `profiles` ni en localStorage.
4. Toda operación económica: idempotente, atómica, trazable (audit_trigger + journal).
5. Cuentas contables solo vía `resolve_account_strict()` (fail-closed).
6. Sin mocks presentados como funcionalidad. Sin localStorage para datos de negocio.
7. Nada se marca COMPLETO sin prueba registrada en `TESTING_MASTER.md`.

## 5. Estado de módulos
Ver `MODULE_STATUS.md` (FUNCIONA / PARCIAL / MOCK / NO IMPLEMENTADO).

## 6. Prioridades
| P | Bloque | Estado |
|---|---|---|
| P0 | Security & tenant hardening | Mayormente hecho; falta test real cross-tenant autenticado (A vs B) |
| P1 | Transaction core (stock por ubicación) | **ABIERTO** — ver §9 |
| P1 | Offline core | Parcial: outbox+idempotencia sí; sin pruebas multi-device |
| P1 | AI control plane | No implementado (IA directa al gateway, sin usage/costs/quotas) |
| P2 | Autonomous engine / workflows | Parcial (agent_actions, workflows sin compensación) |
| P3 | UX, performance, docs | Continuo |

## 7. Dependencias entre módulos
POS → turnos (store) → product_stock (ubicación) → inventory_movements → journal (COGS) → reportes.
Marketplace → place_order_group → online_orders → delivery → ventas.
Nómina → compute_payroll_full → pay_payroll → journal.

## 8. Reglas de desarrollo con Lovable Cloud
- Cambios de esquema solo por migración; cada `CREATE TABLE` con `GRANT` + RLS + policies.
- No editar `client.ts`, `types.ts`, `.env`, `config.toml` de proyecto.
- Service role solo en Edge Functions.

## 9. Siguiente bloque autorizado (P1 Transaction Core — stock por ubicación)
Estado anterior: `products.stock` (global) se sincroniza por trigger desde `product_stock` (hecho en la última sesión). Pendiente:
1. HECHO 2026-09-30: `usePOSStock` sin fila = 0.
2. HECHO 2026-09-30: `pos_checkout` valida stock de tienda (respeta allow_negative_stock).
3. Tests: venta con stock solo en almacén debe fallar; venta con receta descuenta ingredientes.
4. Actualizar `MODULE_STATUS.md`, `DATABASE_MASTER.md`, `TESTING_MASTER.md`, `CHANGELOG_DEVELOPMENT.md`.

Tras cerrar §9: test cross-tenant autenticado (P0) antes de cualquier nueva funcionalidad.

## 10. Documentación heredada
Los ficheros en `/docs/*.md` (auditorías, pitch deck, readiness) son **históricos**. Algunas afirmaciones están obsoletas (p. ej. "offline-first COMPLETA", "financial_events 0 filas" puede haber cambiado, valoraciones comerciales). Se consolidan aquí; ante conflicto, prevalece `/docs/master/`.
