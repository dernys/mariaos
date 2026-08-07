# Informe de cierre — Sprint 0–30 (Enterprise Baseline)

MarIA OS · Kirabit · Plataforma: Lovable Cloud
Estado: **cerrado**. Paso 8 del plan (`docs/MARIA_OS_TRANSFORMATION_PLAN.md`).

## 1. Qué se entregó

| # | Iniciativa | Entrega | Evidencia |
|---|---|---|---|
| 1 | QW5 Seguridad | Auditoría de las 5 funciones sin `verify_jwt` + fix SEC-001 | `docs/security-audit.md`, `supabase/functions/ensure-demo-user` |
| 2 | QW6a Quality gate | Script `verify` (tsgo + lint + test + build) y CI | `package.json`, `.github/workflows/quality.yml` |
| 3 | QW3 Observabilidad | Logger con contexto + handlers globales, desactivable | `src/lib/observability/index.ts` |
| 4 | QW2 Correlation ID | Contexto de operación y propagación en auditoría | `src/lib/context/operationContext.ts`, `src/hooks/useActivityLog.tsx` |
| 5 | QW1 Idempotencia | Tabla `operation_idempotency`, overloads de `create_quick_sale`, `register_account_payment`, `receive_purchase`; frontera única en cliente | `src/lib/finance/idempotentRpc.ts` |
| 6 | QW4 Performance | 10 índices justificados en tablas calientes | migración de índices |
| 7 | QW6b Invariantes | Reglas puras + suite de pruebas | `src/lib/finance/invariants.ts` |

## 2. Cierre fino (ejecutado ahora)

- `logActivity` hereda `correlation_id` y `operation_id` del contexto de operación (explícito, `ctx` o ambiental) y rellena `tenant_id`/`performed_by` desde ese contexto. La auditoría queda enlazable de extremo a extremo: UI → caso de uso → RPC → `activity_log`.
- Este informe (paso 8) documenta métricas y rollback.

## 3. Métricas antes / después

| Métrica | Antes | Después |
|---|---|---|
| RPC financieras idempotentes | 0/3 | 3/3 |
| Flujos con correlation_id extremo a extremo | 0 | venta rápida, cobro de cuenta, recepción de compra, inventario |
| Tests automatizados | 1 | 27 (verdes) |
| Funciones públicas auditadas | 0/5 | 5/5 (1 corregida, 4 con acción documentada) |
| Pipeline de calidad | inexistente | bloqueante en CI |
| FKs críticas sin índice | 10 | 0 en las 5 tablas calientes |
| Capa de datos en módulo piloto | 0 | Inventario encapsulado (Fase 3) |

## 4. Rollback

| Entrega | Rollback |
|---|---|
| Observabilidad | `VITE_OBSERVABILITY=off` → no-op |
| Correlation / auditoría | Campos opcionales en metadata; ignorarlos no altera comportamiento |
| Idempotencia | Llamar los RPC sin `p_idempotency_key`; migración inversa documentada en el propio archivo |
| Índices | `DROP INDEX`, sin pérdida de datos |
| Invariantes y tests | Sin efecto en runtime |
| Quality gate | Desactivar el workflow |

## 5. Deuda abierta que entra al siguiente sprint

- `api-v1`, `webhook-dispatcher`, `check-superadmin`, `register-superadmin`: acción de QW5 documentada pero **no ejecutada** (firma/secreto compartido).
- ~300 llamadas `supabase.from()` directas en páginas fuera de Inventario.
- FX calculado en cliente: pendiente el value object `Money` (Fase 5).
