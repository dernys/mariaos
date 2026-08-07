# MarIA OS — Enterprise Transformation Plan (Fase 0)

Kirabit · MarIA OS · Plataforma: Lovable Cloud (sin migración fuera de la plataforma)
Estrategia: Strangler Pattern + Modular Monolith + DDD + EDA progresiva + Shadow Run
Estado del documento: **Fase 0 — análisis y planificación. Ningún cambio de código ejecutado.**

---

## 1. Estado actual (medido sobre el repo y la base de datos)

| Dimensión | Medición | Lectura |
|---|---|---|
| Acceso a datos | `supabase.from()` / `supabase.rpc()` en **75 archivos** de `src/` (páginas, hooks y componentes) | No existe capa de datos; la UI es el repositorio |
| Capa de dominio | `src/modules/` **no existe** | Toda la lógica vive en páginas React o en SQL |
| Tests | **1** archivo real (`src/test/example.test.ts`) | Sin red de seguridad para refactor |
| Idempotencia | Solo en la cola offline (`src/lib/offline/db.ts`, `client_uuid`) | RPCs financieras (`create_quick_sale`, `register_account_payment`, `receive_purchase`) no son idempotentes |
| Trazabilidad | `correlation_id` presente solo en `useActivityLog`, `useAgent`, `agent-runner` | No hay trazabilidad extremo a extremo |
| Observabilidad | Ninguna (sin captura de errores centralizada) | Diagnóstico por inspección manual |
| Quality gate | Scripts `lint`, `test`, `build` existen; **sin pipeline** en `.github/workflows` | Nada bloquea una regresión |
| Backend | ~120 tables, ~100 funciones SQL, ~60 triggers, 17 edge functions | Lógica valiosa y frágil: no se toca sin shadow run |
| Seguridad | 5 funciones con `verify_jwt = false` (`check-superadmin`, `register-superadmin`, `api-v1`, `webhook-dispatcher`, `ensure-demo-user`) | Requiere auditoría formal (QW5) |
| Dinero | `numeric` en DB, `number` en TS; FX calculado en el cliente (`PaymentDialog.tsx`) | Riesgo de descuadres multi-moneda |

### Arquitectura actual (resumen)

```text
React pages/components ──► supabase-js ──► PostgREST ──► Postgres
        │                                                   │
        └── lógica de negocio (totales, IVA, FX)             ├── ~60 triggers punto a punto
                                                            ├── ~100 funciones SQL (RPC)
                                                            └── RLS por tenant (correcta)
Edge Functions (17) ──► Postgres (service_role) · IA · webhooks
```

Fortalezas a preservar: RLS multi-tenant sólida, roles en tabla separada (`user_roles` + `has_role`), motor contable de partida doble funcional, libro mayor reconstruible, módulo fiscal CU/BR.

---

## 2. Arquitectura objetivo (destino, no big-bang)

```text
UI (React)
  └─► Application Services (use cases, por módulo)
        └─► Repositories (única frontera con Lovable Cloud)
              └─► RPC / tablas / edge functions
Dominio: Money value object, invariantes, políticas
Eventos: domain_events (append-only) en SHADOW MODE ─► proyecciones
Inteligencia: Knowledge Graph ─► agentes IA + gemelo digital
```

Cinco plataformas lógicas dentro del mismo monolito modular: **Core** (tenancy, auth, RBAC), **Business** (inventario, compras, POS, ventas), **Finance** (contabilidad, tesorería, fiscal), **Intelligence** (agentes, riesgos, gemelo), **Platform** (API, webhooks, MCP, observabilidad).

---

## 3. Riesgos y mitigaciones

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R1 | Cambiar RPCs financieras rompe ventas en producción | Crítico | Parámetro `p_idempotency_key` **opcional con default null**: compatibilidad hacia atrás garantizada |
| R2 | Índices nuevos degradan escrituras en tablas calientes | Medio | Solo FKs sin índice y consultas medidas; justificar cada uno; máximo 1 índice por consulta crítica |
| R3 | Refactor de UI a capas introduce regresiones | Alto | Strangler: solo Inventario primero; la UI antigua sigue funcionando hasta validar |
| R4 | Cerrar `verify_jwt` rompe integraciones externas | Alto | Auditar y documentar antes de cambiar; secreto compartido/firma en lugar de cerrar el endpoint |
| R5 | Event store duplica efectos (doble asiento, doble stock) | Crítico | Shadow mode: los eventos **no escriben estado crítico**, solo se comparan |
| R6 | Quality gate bloquea entregas por deuda preexistente | Medio | Gate incremental: falla solo en lo nuevo (TS + build siempre; lint en modo aviso al inicio) |
| R7 | Migraciones sobre tablas grandes bloquean | Medio | `CREATE INDEX` con estrategia no bloqueante y migraciones cortas y separadas |

---

## 4. Dependencias

```text
QW5 Seguridad ──┐
QW3 Observabilidad ──┼─► QW2 Correlation ID ──► QW1 Idempotencia ──► QW6 Invariantes
QW4 Performance ──┘                                    │
                                                       └─► Fase 3 Módulo DDD (Inventario)
                                                             └─► Fase 4 domain_events (shadow)
                                                                   └─► Fase 5 Knowledge Graph / IA
```

- QW1 depende de QW2 (el `correlation_id` viaja junto a la `idempotency_key`).
- Las invariantes (QW6/Fase 2) necesitan fixtures de los 3 tipos de tenant, ya existentes en los demos.
- Ningún trigger se elimina hasta que su evento equivalente pase 2 semanas en shadow sin divergencias.

---

## 5. Orden exacto de ejecución — Sprint 0–30 días

| Paso | Entrega | Naturaleza del cambio | Riesgo |
|---|---|---|---|
| 0 | Este documento | Doc | Nulo |
| 1 | **QW5** `docs/security-audit.md`: inventario de las 5 funciones sin `verify_jwt`, superficie expuesta, veredicto y acción | Doc (sin cambios funcionales) | Nulo |
| 2 | **QW6a** Quality gate: script `verify` (tsgo + lint + test + build) y workflow CI | Tooling | Bajo |
| 3 | **QW3** Observabilidad: `src/lib/observability/` (logger con tenant/user/módulo/operación/correlation, captura global de errores, sink a `activity_log`/consola) | Código nuevo aditivo | Bajo |
| 4 | **QW2** Correlation ID: `src/lib/context/operationContext.ts` (genera `operation_id`, `correlation_id`), propagación en `useActivityLog` y en el wrapper de RPC | Código nuevo + edición puntual | Bajo |
| 5 | **QW1** Idempotencia: migración con tabla `operation_idempotency` (tenant_id, key, operation, result_id, unique) y parámetro opcional `p_idempotency_key` en `create_quick_sale`, `register_account_payment`, `receive_purchase`; wrapper cliente que genera la clave por intento de usuario | Migración + SQL compatible | Medio → controlado por default null |
| 6 | **QW4** Performance: informe de FKs sin índice en `sales`, `sale_items`, `inventory_movements`, `journal_entries`, `journal_entry_lines` + migración solo con los índices justificados | Migración | Medio |
| 7 | **QW6b** Suite de invariantes: tests de Debe=Haber, ecuación de stock, cuadre de venta y obligatoriedad de `currency`+`exchange_rate` sobre los 3 tenants demo | Tests | Nulo |
| 8 | Informe de cierre de sprint: cambios, pruebas, métricas antes/después, rollback | Doc | Nulo |

Fuera del alcance de este sprint: `src/modules/`, `domain_events`, `Money`, Knowledge Graph (Fases 3–5).

---

## 6. Plan de rollback

| Paso | Rollback |
|---|---|
| Docs (1, 8) | Ninguno necesario |
| Quality gate (2) | Desactivar el workflow; los scripts locales son inertes |
| Observabilidad (3) | Flag `OBSERVABILITY_ENABLED=false`; el logger degrada a no-op |
| Correlation ID (4) | Los campos son opcionales; ignorarlos no altera el comportamiento |
| Idempotencia (5) | Llamar los RPC sin `p_idempotency_key` restaura el comportamiento exacto anterior; migración inversa: `DROP TABLE operation_idempotency` y restaurar la firma previa de la función (guardada en el propio archivo de migración) |
| Índices (6) | `DROP INDEX` — reversible y sin pérdida de datos |
| Invariantes (7) | Los tests no afectan runtime |

Regla transversal: cada migración incluye en comentario su SQL inverso.

---

## 7. Criterios de aceptación del Sprint 0–30

1. Doble envío de una venta con la misma `idempotency_key` produce **una** venta, **un** asiento, **un** movimiento de inventario. Verificado con prueba explícita.
2. Igual comportamiento para `register_account_payment` y `receive_purchase`.
3. Llamar los tres RPC sin la clave nueva funciona exactamente como hoy (compatibilidad hacia atrás).
4. Toda operación instrumentada emite `tenant_id`, `user_id`, `operation_id`, `correlation_id`, `timestamp`, y se puede reconstruir el recorrido completo de una venta.
5. `docs/security-audit.md` clasifica las 5 funciones públicas con veredicto y acción propuesta.
6. Suite de invariantes verde en los 3 tenants demo (bar, restaurante, comercio).
7. `npm run verify` pasa: TypeScript, lint, tests, build.
8. Cero funcionalidades eliminadas; cero triggers borrados; cero cambios en RLS o en el modelo de roles.

### Métricas antes/después a reportar

| Métrica | Antes | Objetivo |
|---|---|---|
| RPC financieras idempotentes | 0/3 | 3/3 |
| Operaciones con correlation_id extremo a extremo | 0 | flujos de venta, cobro y compra |
| Tests | 1 | ≥ 12 (invariantes + idempotencia) |
| Funciones públicas auditadas | 0/5 | 5/5 |
| Pipeline de calidad | no existe | bloqueante |
| FKs críticas sin índice | por medir en QW4 | 0 en las 5 tablas calientes |

---

## 8. Fases posteriores (resumen, no ejecutar aún)

- **Fase 3 (30–60 d)** — `src/modules/inventory/{domain,application,infrastructure,ui}`; la UI de Inventario deja de llamar a Supabase; regla de lint que prohíbe `supabase.from()` dentro de `src/modules/**/ui`.
- **Fase 4 (60–90 d)** — `domain_events` append-only, eventos `sales.completed`, `purchase.received`, `inventory.moved`, `payment.registered` en shadow mode con panel de divergencias.
- **Fase 5 (90 d+)** — `Money {amount, currency}` como estándar, Knowledge Graph empresarial y motor de simulación del gemelo digital sobre el event store.

## Estado Sprint 0–30 (actualizado)

| Iniciativa | Estado | Evidencia |
|---|---|---|
| QW5 Seguridad edge functions | Hecho | `docs/security-audit.md`, fix SEC-001 en `ensure-demo-user` |
| QW6a Quality gate CI | Hecho | `.github/workflows/quality.yml`, script `verify` |
| QW3 Observabilidad | Hecho | `src/lib/observability/index.ts` + handlers globales |
| QW2 Correlation ID | Hecho | `src/lib/context/operationContext.ts` (3 tests) |
| QW1 Idempotencia financiera | Hecho | tabla `operation_idempotency`, overloads de `create_quick_sale` / `register_account_payment` / `receive_purchase`, frontera única `src/lib/finance/idempotentRpc.ts` cableada en Venta rápida, Pagos multi-moneda y Recepción de compra |
| QW4 Índices calientes | Hecho | 10 índices justificados (ventas, mayor, kardex, cola de webhooks) |
| QW6b Invariantes financieras | Hecho | `src/lib/finance/invariants.ts` + 13 tests (Debe=Haber, venta liquidada, ecuación de stock, multi-moneda) |

Siguiente sprint (30–60): repositorios por módulo + TanStack Query para eliminar los ~316 `supabase.from` directos en páginas.
