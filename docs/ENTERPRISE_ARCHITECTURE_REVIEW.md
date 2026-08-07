# MarIA OS — Enterprise Architecture Review & Evolution Roadmap
**Comité de Arquitectura Empresarial (TOGAF ADM · ISO/IEC 42010 · C4)**
Versión 1.0 — Agosto 2026 · Kirabit

---

## 0. Resumen ejecutivo

MarIA OS es hoy un **monolito modular de front-end sobre una base de datos con lógica de negocio en PL/pgSQL**, con una cobertura funcional inusualmente amplia (55 páginas, ~16.000 LOC de UI, 120+ tablas, 130+ funciones de BD, 17 edge functions, 79 migraciones). Esa amplitud es su mayor activo comercial y, simultáneamente, su mayor riesgo estructural.

**Diagnóstico central del comité:**

| Dimensión | Nivel actual (0-5) | Nivel objetivo 12m |
|---|---|---|
| Cobertura funcional | 4.0 | 4.5 |
| Modelo de datos / multi-tenant | 3.5 | 4.5 |
| Arquitectura de aplicación (capas, DDD) | 1.5 | 4.0 |
| Orientación a eventos | 1.5 | 4.0 |
| Motor financiero | 3.5 | 4.5 |
| IA / Agentes / Gemelo digital | 2.0 | 4.0 |
| Extensibilidad / plataforma | 2.0 | 4.0 |
| Observabilidad / DevSecOps | 1.0 | 3.5 |
| Calidad / testing | 0.5 | 3.5 |
| UX / consistencia | 3.0 | 4.5 |

**Los cinco hallazgos críticos (bloqueantes para escalar):**

1. **No existe capa de dominio ni capa de datos en el cliente.** Las páginas invocan `supabase.from(...)` directamente (RRHH 20 llamadas, Compras 12, Inventario 11, Contabilidad 11). `@tanstack/react-query` está instalado pero con **0 usos**: no hay caché, ni invalidación, ni reintentos, ni estado de carga unificado. Cada página reimplementa fetching, paginación y errores.
2. **El bus de eventos es decorativo.** Existe `business_events` + `workflow-runner`, pero solo **3 productores** en todo el sistema (Compras.tsx, PaymentDialog.tsx, agent-runner). El resto de efectos (stock, caja, contabilidad, notificaciones) se propagan por **triggers SQL acoplados punto a punto** (`sales_post_journal`, `sales_apply_credit`, `sales_loyalty`, `sales_consignment_alloc`, `sales_webhook`…). Un mismo hecho de negocio dispara 5+ triggers independientes sin orden garantizado, sin idempotencia y sin trazabilidad de causalidad.
3. **Lógica de negocio duplicada en tres planos**: PL/pgSQL (RPCs), edge functions y componentes React. Ejemplo: emisión de eventos de negocio desde el cliente (`PaymentDialog.tsx` inserta en `business_events` con `as any`), cálculo de totales en POS y de nuevo en `create_quick_sale`.
4. **Calidad e infraestructura de confianza ausentes**: 1 test de ejemplo, sin E2E, sin CI de migraciones, sin observabilidad (no hay Sentry/OTel), sin runbooks ni DR documentado. Un motor financiero sin suite de regresión es un pasivo, no un activo.
5. **La capa de inteligencia no está fundada en datos estructurados.** Agentes, gemelo digital y memoria empresarial existen como tablas y páginas, pero **no hay grafo de conocimiento ni feature store**: la IA razona sobre consultas ad-hoc, no sobre un modelo semántico del negocio. Es el mayor diferencial prometido y el menos soportado arquitectónicamente.

**Recomendación estratégica:** no reescribir. Ejecutar una **estrangulación progresiva hacia un Modular Monolith orientado a eventos** (cinco plataformas: Core, Business, Finance, Intelligence, Platform), con un **Event Store canónico** como columna vertebral y una **capa de acceso a datos tipada** en el cliente. Reescribir sería suicida con esta superficie funcional; modularizar por contextos es viable en 12 meses.

---

# FASE 1 — Auditoría funcional por módulo

Leyenda de estado: 🟢 sólido · 🟡 funcional con deuda · 🟠 frágil · 🔴 crítico

### 1.1 Core & Plataforma

| Módulo | Estado | Fortalezas | Debilidades / errores | Deuda técnica | Mejora recomendada |
|---|---|---|---|---|---|
| **Auth** | 🟡 | Sesión Supabase, `onAuthStateChange` correcto, sin deadlock (`setTimeout 0`) | `getSession()` solo apaga el loader; roles se recargan en cada evento de auth; sin refresh de roles tras cambio de permisos | Sin MFA, sin política de sesión, sin device trust | Añadir MFA/TOTP, cachear claims en JWT (custom claims) en vez de query a `user_roles` en cada login |
| **Multi-tenant** | 🟡 | `tenants` + `tenant_users` + `is_tenant_member()` security-definer; RLS en todas las tablas | Tenant activo en `localStorage` (`sa_active_tenant`) sin validación servidor; superadmin lee todos los tenants en cliente; `useTenant` y `useTenantContext` coexisten (duplicación) | Sin tenant en JWT → toda query depende de RLS por subconsulta (coste) | Inyectar `tenant_id` como claim JWT; unificar en un solo `TenantProvider`; `SET LOCAL app.tenant_id` en RPCs |
| **RBAC** | 🟡 | Roles en tabla separada (`user_roles`), enum `app_role`, `has_role()` security-definer, matriz `role_permissions` por módulo | 5 roles fijos en enum → no hay roles personalizados por tenant; permisos leídos en cliente sin enforcement equivalente en BD para todas las tablas | Enum rígido; `role_permissions` no se aplica en RLS, solo en UI | Migrar a roles dinámicos por tenant (`tenant_roles`), y derivar RLS de `role_permissions` vía función `can(module, action)` |
| **Configuración** | 🟡 | `system_settings`, `module_settings`, `pos_settings`, `app_modules` | Tres tablas de settings con solapamiento semántico; sin versionado ni auditoría de cambios de configuración | Duplicación | Consolidar en un `settings` jerárquico (global → tenant → tienda → usuario) con resolución en cascada |
| **i18n** | 🟢 | es / en / pt-BR, `useLocale`, formateadores separados | Textos hardcodeados en páginas nuevas (Marketplace, Turnos); sin i18n de datos (nombres de producto) | — | Lint rule anti-hardcode; tabla `*_translations` para catálogo |
| **PWA / Offline** | 🟡 | `vite-plugin-pwa`, `src/sw.ts`, Dexie, `useOfflineQueue`, banner offline, iframe guard | Cola offline sin resolución de conflictos ni idempotencia por `client_operation_id`; solo cubre POS parcialmente | Riesgo de duplicar ventas al reconectar | Idempotencia end-to-end: UUID de operación cliente + `ON CONFLICT DO NOTHING` en servidor |
| **MCP** | 🟢 | Servidor MCP con OAuth gestionado, 5 tools con RLS por token de usuario, consent page propia | Tools solo de lectura + 2 acciones; sin paginación ni límites de coste; sin tools financieras | Cobertura escasa | Ampliar a tools de Finance e Intelligence; añadir rate limiting y scopes por tool |
| **Webhooks** | 🟡 | `webhooks`, `webhook_deliveries`, `enqueue_webhook_event`, dispatcher | Sin backoff exponencial documentado, sin firma HMAC verificable ni replay protection, sin DLQ | — | Firmar payload (HMAC-SHA256 + timestamp), reintentos con backoff, DLQ y consola de reenvío |
| **API pública (`api-v1`)** | 🟠 | Existe, con `tenant_api_keys` | Sin OpenAPI, sin versionado real, sin rate limit por key, sin paginación estándar | Contrato no publicado | Generar OpenAPI 3.1, versionar `/v1`, cuotas por key, respuestas RFC 7807 |

### 1.2 Business

| Módulo | Estado | Diagnóstico |
|---|---|---|
| **POS** | 🟡 | Fortalezas: tres variantes especializadas (Bar/Restaurante/Empresa), mobile-first, atajos, escáner, ventas aparcadas, pagos múltiples y multi-moneda, gate de turno. Debilidades: `PaymentDialog.tsx` contiene lógica de negocio (emite eventos, calcula, escribe en varias tablas) — debería llamar **una sola** RPC transaccional; `as any` sobre `supabase.from` (bypass de tipos); sin idempotencia de cobro. **Riesgo alto de venta duplicada** ante doble clic o reintento offline. |
| **Inventario** | 🟡 | Movimientos, lotes, series, variantes, stock por almacén, recetas, conteos, transferencias, consignación. Deuda: 686 LOC en una página con 11 accesos directos a datos; valoración (FIFO/medio) no explícita por producto; kardex incompleto respecto al blueprint. |
| **Compras** | 🟡 | PO, recepciones, costos por proveedor, crédito aplicado por trigger. Falta: aprobaciones multinivel, conciliación 3-way formal, RMA. Emite `business_events` desde el cliente (antipatrón). |
| **Ventas / Devoluciones** | 🟡 | Cadena completa venta → stock → asiento → fidelización mediante triggers. Debilidad: **cascada de 5 triggers** sobre `sales` sin orquestación explícita ni compensación si uno falla parcialmente. |
| **Marketplace** | 🟢 | Rediseño reciente sólido: filtros, orden, reviews con vista agregada segura, stock en tiempo real, checkout multi-paso. Falta: pasarela de pago, wishlist, direcciones múltiples, SEO (sitemap/schema.org). |
| **Delivery** | 🟡 | Zonas, riders, asignaciones, comisiones, mapa, ubicaciones en tiempo real. Falta: optimización de rutas real (existe `logistics-optimizer` pero sin SLA ni métricas), tracking público del cliente. |
| **RRHH / Nómina** | 🟠 | Muy amplio (empleados, contratos, asistencia, permisos, horas extra, nóminas, tramos fiscales, portal empleado). Página de 862 LOC con 20 accesos directos: **el módulo con mayor deuda estructural**. PIN POS cifrado ✅. Falta: evaluaciones, calendario laboral, recibos PDF firmados. |
| **CRM** | 🟠 | Solo clientes + fidelización + reviews. **No existe pipeline de oportunidades ni presupuestos** — brecha frente a benchmark. |
| **Restaurante** | 🟢 | Mapa de mesas, KDS, división de cuenta, realtime. Falta: reservas, modificadores, menú QR. |

### 1.3 Finance

| Módulo | Estado | Diagnóstico |
|---|---|---|
| **Contabilidad** | 🟡 | Partida doble real, plan contable importable, `general_ledger` reconstruible con herencia de saldos, cierre de periodos y ejercicio, reglas de asiento (`posting_rules`), auditoría contable, KPIs y smoke test automatizado. **Es el subsistema más maduro.** Debilidades: `Contabilidad.tsx` con 897 LOC; despacho financiero con solo **3 llamadas a `post_financial_event`** → cobertura parcial de orígenes; sin asientos de regularización automáticos; sin activos fijos. |
| **Tesorería / Bancos** | 🟡 | Cuentas, conciliación (auto-match), extractos, previsión, SEPA. Falta: importación OFX/API bancaria, y la previsión no consume el grafo de vencimientos AP/AR de forma unificada. |
| **Facturación** | 🟡 | Series, e-invoice settings, transmisión, NF-e (BR), SPED, ONAT (CU). Falta: rectificativas/abonos formales, plantillas por tenant, envío automático. |
| **Impuestos** | 🟢 | Multi-jurisdicción (BR ICMS/ISS, CU declaraciones, tax_rates/templates). Riesgo: reglas fiscales embebidas en funciones SQL → cambios normativos exigen migración. Mover a **Rule Engine** con vigencia temporal. |
| **Multi-moneda** | 🟡 | `currencies`, `exchange_rates_history`, `fill_fx_*`. Incidencia histórica de tasas erróneas ya corregida → señal de que **falta validación de invariantes** y tests. |
| **Costos** | 🟡 | Fichas de costo (CU) con recálculo. No cubre costeo por orden ni por centro de actividad genérico. |

### 1.4 Intelligence

| Módulo | Estado | Diagnóstico |
|---|---|---|
| **Agentes IA** | 🟠 | 7 tipos, estados, niveles de autonomía, `agent_actions` con aprobación. Pero: el `agent-runner` es un ejecutor genérico; **no hay contratos de herramientas por agente, ni memoria de episodios, ni evaluación de calidad**. Autonomía declarada > autonomía real. |
| **Memoria empresarial** | 🟠 | Tabla `business_memory` (8 columnas) sin embeddings ni recuperación semántica (no hay pgvector). Es un bloc de notas, no una memoria. |
| **Gemelo digital** | 🔴 | Página `DigitalTwin.tsx` sin modelo de simulación subyacente: no hay motor de escenarios, ni estado paramétrico, ni backtesting. **Es la brecha más grande entre promesa y realidad.** |
| **Risk Engine** | 🟡 | `risk_alerts` + `risk-scanner`: reglas fijas en código de la función. Debe migrar a Rule Engine. |
| **Inventory Intelligence** | 🟡 | Edge function con heurísticas; sin backtesting ni métricas de acierto. |
| **Analytics / BI** | 🟠 | Reportes y KPIs por consulta directa a tablas transaccionales. **Sin capa analítica** (marts, materialized views): riesgo de degradación con volumen y de divergencia entre reportes. |

### 1.5 Duplicaciones e inconsistencias detectadas (catálogo)

1. `useTenant` vs `useTenantContext` — dos fuentes de verdad de tenant.
2. Emisión de `business_events` desde cliente y desde servidor, con formas de payload distintas.
3. `as any` sobre el cliente Supabase en al menos POS y Compras → pérdida de tipado generado.
4. Tres tablas de configuración solapadas.
5. Cálculo de totales/impuestos en cliente y en RPC.
6. Notificaciones emitidas tanto por triggers (`*_notify`) como por código de aplicación.
7. Exportaciones implementadas ad-hoc por página junto a `exportData.ts` genérico.
8. `@tanstack/react-query` como dependencia muerta (peso sin beneficio).
9. Reglas fiscales y de riesgo hardcodeadas en SQL/TS en vez de datos.
10. Ausencia total de contratos entre módulos: cualquier página puede leer cualquier tabla.

---

# FASE 2 — Auditoría arquitectónica

### 2.1 Estilo actual (as-is)

```text
   React SPA (Vite)  ──────────────┐
   55 páginas · sin capa de datos  │  supabase-js directo (RLS)
                                   ▼
                      PostgreSQL (Supabase)
                      ├── 120+ tablas (RLS por tenant)
                      ├── 130+ funciones PL/pgSQL  ← lógica de negocio
                      └── ~60 triggers             ← orquestación implícita
                                   ▲
   17 Edge Functions ──────────────┘  (IA, webhooks, API, seeds, MCP)
```

**Clasificación:** *Database-centric Transaction Script* con UI monolítica. No es un monolito modular: **no hay módulos**, hay carpetas.

### 2.2 Evaluación DDD

| Concepto | Presencia | Veredicto |
|---|---|---|
| Bounded Contexts | ❌ implícitos | Los límites existen mentalmente (POS, Contabilidad) pero nada los aplica: cualquier componente accede a cualquier tabla. |
| Aggregate Roots | ⚠️ parcial | `sales`, `purchases`, `journal_entries` se comportan como agregados en BD (con hijos y triggers), pero sin invariantes explícitas ni encapsulación. |
| Entities / Value Objects | ❌ | No existen tipos de dominio; se usan filas crudas y `number` para dinero. **Riesgo financiero real: dinero como float en TS.** |
| Repositories | ❌ | Acceso directo desde componentes. |
| Domain Events | ⚠️ | `business_events` existe pero infrautilizado; los "eventos" reales son triggers. |
| CQRS | ❌ | Lecturas y escrituras contra las mismas tablas. |
| Anti-corruption layers | ❌ | Integraciones fiscales (NF-e, SPED, ONAT) acopladas al modelo interno. |

### 2.3 Event-Driven

- **Event Store:** ausente (no hay log inmutable append-only con `stream_id`, `version`, `causation_id`, `correlation_id`).
- **Message Bus:** `business_events` + polling del `workflow-runner` (max 200/lote) — es una cola pobre, sin garantías de orden, sin *exactly-once*, sin visibilidad de latencia.
- **Idempotencia:** ausente en productores y consumidores.
- **Sagas / compensación:** inexistentes. Un fallo a mitad de la cascada de triggers deja estado inconsistente (mitigado solo por la transacción SQL, que no cubre efectos en edge functions).

### 2.4 Integración y APIs

REST implícito vía PostgREST (superficie enorme y no gobernada) + `api-v1` + MCP + webhooks. **No hay API Gateway ni BFF**: el cliente conoce el esquema físico de la base. Esto congela el modelo de datos — cualquier refactor rompe la UI.

### 2.5 Observabilidad, seguridad, entrega

| Área | Estado | Riesgo |
|---|---|---|
| Logging estructurado | ❌ `console.log` en edge functions | Alto |
| Tracing distribuido | ❌ | Alto |
| Métricas / SLO | ❌ | Alto |
| Error tracking | ❌ | Alto |
| Auditoría | 🟢 `audit_trigger` + `activity_log` en tablas críticas | — |
| Secretos | 🟢 gestionados en plataforma | — |
| RLS | 🟢 amplio; ⚠️ verificar GRANTs y vistas `security_invoker` | Medio |
| CI/CD | ❌ sin pipeline de migraciones ni gates | Alto |
| Tests | 🔴 1 archivo de ejemplo | Crítico |
| DR / backups | ⚠️ dependiente del proveedor, sin RTO/RPO declarado ni ensayo de restauración | Alto |
| Escalabilidad | ⚠️ una BD compartida, sin read replicas, sin particionado de tablas de alto volumen (`activity_log`, `general_ledger`, `inventory_movements`) | Medio-alto |

---

# FASE 3 — Arquitectura objetivo (to-be)

### 3.1 Principios rectores

1. **Modular Monolith primero, microservicios solo por necesidad medida** (volumen, aislamiento de fallo o cadencia de despliegue divergente).
2. **El evento es la verdad de la integración**; el estado es una proyección.
3. **Ningún módulo lee tablas de otro módulo**: solo eventos o API pública del módulo.
4. **La contabilidad no se calcula, se deriva** de eventos financieros normalizados.
5. **Las reglas son datos**, no código (fiscalidad, riesgo, reposición, precios).
6. **La IA consume un modelo semántico**, no SQL improvisado.
7. **Todo lo que el usuario ve tiene un contrato tipado** (BFF), nunca el esquema físico.

### 3.2 Las cinco plataformas

```text
┌──────────────────────────── MarIA PLATFORM ─────────────────────────────┐
│  Extension Marketplace · SDK · Plugins · Workflow Engine · Rule Engine  │
│  Conectores · APIs públicas (OpenAPI) · MCP tools · Automatizaciones    │
└────────────▲──────────────────────────────────────────▲────────────────┘
             │                                          │
┌────────────┴──────────┐  ┌──────────────┐  ┌──────────┴───────────────┐
│   MarIA BUSINESS      │  │ MarIA FINANCE│  │   MarIA INTELLIGENCE     │
│ POS · CRM · Ventas    │  │ Financial    │  │ Agentes · Memoria (RAG)  │
│ Compras · Inventario  │─▶│ Core:        │─▶│ Gemelo digital · KG      │
│ Producción · Market   │  │ Contab · Tes │  │ Predicción · Anomalías   │
│ Delivery · RRHH       │  │ AR/AP · Fisc │  │ Process mining           │
└───────────┬───────────┘  └──────┬───────┘  └──────────┬───────────────┘
            │                     │                     │
┌───────────┴─────────────────────┴─────────────────────┴───────────────┐
│                            MarIA CORE                                  │
│ AuthN/AuthZ · RBAC/ABAC · Tenants · Usuarios · i18n/regiones           │
│ Settings · EVENT STORE + BUS · Auditoría · Observabilidad · Gateway/BFF│
└────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Bounded contexts y agregados propuestos

| Contexto | Agregado raíz | Invariantes clave | Eventos publicados |
|---|---|---|---|
| Sales | `Sale` | total = Σ líneas − descuentos + impuestos; no confirmable sin turno abierto | `SaleCompleted`, `SaleCancelled`, `SaleReturned` |
| Inventory | `StockItem` (producto×almacén×lote) | stock ≥ 0 salvo política de negativo; movimiento siempre con contrapartida | `StockReserved`, `StockMoved`, `StockAdjusted`, `LowStockDetected` |
| Procurement | `PurchaseOrder` | recepción ≤ pedido; 3-way match antes de pago | `PurchaseOrdered`, `GoodsReceived`, `SupplierInvoiceMatched` |
| Cash | `Shift` | máx. 1 turno abierto por tienda ✅ (ya implementado); cierre requiere arqueo | `ShiftOpened`, `CashMovementRegistered`, `ShiftClosed` |
| Accounting | `JournalEntry` | Σ debe = Σ haber; periodo abierto; moneda con tasa vigente | `JournalPosted`, `PeriodClosed` |
| Treasury | `BankAccount` | saldo conciliado = extracto ± pendientes | `PaymentSettled`, `ReconciliationClosed` |
| Billing | `Invoice` | serie correlativa sin huecos; inmutable tras transmisión | `InvoiceIssued`, `InvoiceTransmitted` |
| HR | `Employee` / `PayrollRun` | nómina calculada solo con contrato vigente | `PayrollComputed`, `PayrollPaid` |
| Delivery | `DeliveryAssignment` | un pedido, un rider activo | `OrderDispatched`, `OrderDelivered` |
| Intelligence | `AgentAction` | acción autónoma requiere política de autonomía y límite de impacto | `DecisionProposed`, `ActionExecuted` |

### 3.4 Estructura de código objetivo

```text
src/
  core/            auth, tenant, rbac, settings, i18n, telemetry, event-client
  platform/        workflow-engine (UI), rule-engine (UI), sdk, connectors
  modules/
    sales/         domain/ (tipos, invariantes) · api/ (repos tipados) · ui/
    inventory/     idem
    accounting/    idem
    ...
  shared/          ui-kit (shadcn), money, dates, formatting
supabase/
  functions/       gateway/ · projections/ · agents/ · integrations/
  migrations/      por contexto, con naming <ctx>_<intent>
```

Regla de dependencia (verificable con ESLint `import/no-restricted-paths`):
`ui → api → domain → core`. Nunca `modules/x → modules/y`.

### 3.5 Modelo de dinero

Sustituir `number` por un `Money { amount: bigint /* minor units */, currency }` con aritmética explícita y `numeric(18,4)` + moneda en toda columna monetaria. **Iniciativa no negociable** para un sistema financiero.

---

# FASE 4 — Verificación integral de la cadena de valor

Trazabilidad exigida: **Venta → Inventario → Caja → Contabilidad → Analytics → IA → Gemelo → Dashboard → Reportes → Auditoría.**

| Enlace | Estado hoy | Mecanismo actual | Brecha |
|---|---|---|---|
| Venta → Inventario | 🟢 | trigger `process_sale_stock` + recetas | Sin reservas ni compensación en fallo |
| Venta → Caja/Turno | 🟡 | `sale_payments` + `sales_shifts` | No hay evento; el arqueo depende de agregación tardía |
| Venta → Contabilidad | 🟢 | `sales_post_journal` / `post_sale_journal_entry` | Cobertura verificada solo para ventas y compras; pagos, nómina, inventario parcialmente |
| Compra → Contabilidad | 🟢 | `purchases_post_journal` | Falta 3-way match previo |
| Inventario → Contabilidad | 🟠 | ajustes con asiento parcial | Valoración y variación de existencias no siempre contabilizada |
| Nómina → Contabilidad | 🟡 | `post_payroll_journal_entry` | Sin conciliación con pagos SEPA |
| Delivery → Finanzas | 🟠 | comisiones registradas | Sin asiento automático garantizado |
| Marketplace → Ventas | 🟡 | `place_online_order` | Pedido online no genera venta ni asiento hasta intervención manual |
| Todo → Analytics | 🟠 | consultas directas | Sin capa de marts; KPIs recalculados por página |
| Todo → IA | 🟠 | consultas ad-hoc | Sin feature store ni grafo |
| IA → Gemelo digital | 🔴 | inexistente | No hay motor de simulación |
| Todo → Auditoría | 🟢 | `audit_trigger`, `activity_log` | Sin correlación causal entre eventos |

**Conclusión Fase 4:** la cadena está **conectada en su tramo transaccional-contable** (mérito real) y **rota en su tramo analítico-cognitivo**. Los cuatro últimos eslabones (Analytics → IA → Gemelo → Dashboard) son los que hay que construir sobre eventos.

---

# FASE 5 — Arquitectura orientada a eventos (diseño)

### 5.1 Event Store canónico

```sql
-- núcleo del bus (reemplaza conceptualmente a business_events)
domain_events(
  id uuid pk,
  tenant_id uuid not null,
  stream_type text not null,        -- 'sale','purchase','shift',...
  stream_id uuid not null,
  version int not null,             -- unique(stream_type, stream_id, version)
  event_type text not null,         -- 'sales.completed.v1'
  payload jsonb not null,
  metadata jsonb not null,          -- actor, source, ip, device
  correlation_id uuid,              -- caso de negocio
  causation_id uuid,                -- evento que lo causó
  occurred_at timestamptz not null,
  recorded_at timestamptz default now()
);
-- consumidores con checkpoint propio
event_subscriptions(name, last_position, status, lag_seconds)
event_deliveries(event_id, subscription, status, attempts, error, next_retry_at)
```

Particionado mensual por `recorded_at`. Append-only (sin UPDATE/DELETE, revocado por GRANT).

### 5.2 Convención de eventos

`<contexto>.<hecho-en-pasado>.v<n>` — `sales.completed.v1`, `inventory.stock_depleted.v1`, `finance.journal_posted.v1`. Payload versionado con contrato JSON Schema registrado en `event_schemas` (validación en el productor).

### 5.3 Flujo objetivo de una venta

```text
POS ──(1 RPC transaccional: register_sale, idempotency_key)──▶ Sales aggregate
                                        │ append
                                        ▼
                                 domain_events: sales.completed.v1
                                        │
        ┌────────────┬────────────┬─────┴──────┬─────────────┬──────────────┐
        ▼            ▼            ▼            ▼             ▼              ▼
   Inventory      Cash        Accounting   Projections    Intelligence   Platform
   stock.moved  shift.cash   journal.posted  KPIs/marts   features/KG    webhooks
                                                              │            workflows
                                                              ▼            notifications
                                                        digital twin state
```

**Reglas:** un solo productor por hecho (la RPC del agregado); consumidores idempotentes por `(event_id, subscription)`; ningún consumidor escribe en el agregado de otro contexto — emite su propio evento.

### 5.4 Migración desde los triggers actuales

Estrangulamiento en tres pasos por cada trigger:
1. El trigger, además de su efecto, **publica el evento** (fase de sombra).
2. Se crea el consumidor equivalente y se **compara** su salida con la del trigger (reconciliación diaria, tolerancia 0 en importes).
3. Se desactiva el trigger y el consumidor queda como única vía.

Orden recomendado: `sales_webhook` → `sales_loyalty` → `notify_*` → `sales_apply_credit` → `process_sale_stock` → `sales_post_journal` (último, por criticidad).

---

# FASE 6 — Enterprise Knowledge Graph

### 6.1 Modelo

Grafo de propiedades sobre PostgreSQL (evita introducir Neo4j en esta etapa):

```sql
kg_nodes(id, tenant_id, kind, ref_table, ref_id, label, props jsonb, embedding vector(1536))
kg_edges(id, tenant_id, src_id, rel, dst_id, props jsonb, valid_from, valid_to)
```

**Tipos de nodo:** Empresa, Sucursal, Almacén, Empleado, Puesto, Cliente, Proveedor, Producto, Lote, Compra, Venta, Factura, Cobro, Pago, Asiento, Cuenta, Activo, Turno, Pedido, Ruta, Workflow, Agente, Gemelo, Riesgo, Decisión.

**Relaciones canónicas:** `PERTENECE_A`, `TRABAJA_EN`, `SUMINISTRA`, `COMPRA`, `VENDE_A`, `CONTIENE`, `FACTURA`, `LIQUIDA`, `AFECTA_CUENTA`, `CONSUME_STOCK`, `ORIGINA`, `APRUEBA`, `PREDICE`, `SIMULA`, `ALERTA_SOBRE`.

### 6.2 Alimentación

Proyector suscrito al Event Store (`kg-projector`): cada evento crea/actualiza nodos y aristas con validez temporal (grafo bitemporal → permite preguntar "¿cómo estaba el negocio en marzo?").

### 6.3 Consumo por IA

- **GraphRAG**: la pregunta del usuario → recuperación de subgrafo relevante + embeddings (`pgvector`) → contexto para el LLM.
- **Consultas de negocio**: caminos precompilados (p. ej. `Cliente → Ventas → Productos → Proveedor`) expuestos como MCP tools.
- **Explicabilidad**: toda recomendación de un agente debe citar los nodos/aristas que la sustentan.

---

# FASE 7 — Workflow Engine

### 7.1 Diseño

Modelo BPMN-lite persistido como datos:

```sql
wf_definitions(id, tenant_id, key, version, graph jsonb, status)
wf_instances(id, definition_id, correlation_id, state, context jsonb, started_at)
wf_tasks(id, instance_id, node_key, type, assignee_role, status, due_at, result jsonb)
wf_transitions(instance_id, from_node, to_node, event_id, at)
```

Nodos soportados: `start(event)`, `task(human)`, `service(rpc|http|agent)`, `gateway(rule)`, `timer`, `parallel`, `end`, `compensation`.

Disparo: suscripción a `domain_events`. Ejecución: worker con checkpoint, reintentos y timeouts. Editor visual drag-and-drop en `MarIA Platform`, con simulación en seco antes de publicar.

### 7.2 Flujo de referencia (Compras)

```text
[PurchaseRequested] → Aprobación (rol: gerente, SLA 24h)
       ├─ rechazada → fin
       └─ aprobada → Emitir PO → Esperar GoodsReceived
                                   → Registrar inventario
                                   → 3-way match (regla)
                                        ├─ discrepancia → Tarea revisión
                                        └─ ok → Asiento → Programar pago
                                                          → PaymentSettled → Cierre
```

Todo el flujo es configurable sin desplegar código; las versiones conviven (instancias en curso siguen su versión).

---

# FASE 8 — Rule Engine

### 8.1 Diseño

```sql
rules(id, tenant_id, domain, key, priority, when jsonb, then jsonb,
      effective_from, effective_to, enabled, created_by)
rule_executions(rule_id, event_id, matched, outcome jsonb, at)
```

Evaluador determinista y *sandboxed* (JSON-Logic, sin `eval`), con simulador y prueba contra histórico.

### 8.2 Dominios que deben salir del código

| Dominio | Hoy | Con Rule Engine |
|---|---|---|
| Reposición | heurística en edge function | `SI stock_disponible < punto_pedido ENTONCES crear_solicitud_compra` |
| Fiscalidad (ICMS, ISS, ONAT, IVA) | funciones SQL por país | reglas con vigencia temporal y jurisdicción |
| Precios y promociones | tabla + código | reglas de precio por segmento/canal/horario |
| Riesgo | `risk-scanner` hardcodeado | umbrales y severidades como datos |
| Autonomía de agentes | enum | política: límite de importe, módulos permitidos, requiere aprobación |
| Alertas y notificaciones | triggers `*_notify` | reglas sobre eventos |

**Beneficio directo:** un cambio normativo cubano o brasileño pasa de "migración + despliegue" a "alta de regla con fecha de vigencia".

---

# FASE 9 — Roadmap estratégico priorizado

Escalas: Prioridad P0-P3 · Impacto A/M/B · Complejidad A/M/B.

### Quick Wins (0-30 días) — estabilizar y detener la sangría

| # | Iniciativa | P | Imp | Cplx | Módulos | Riesgo si no se hace | Métrica de éxito |
|---|---|---|---|---|---|---|---|
| QW1 | **Idempotencia de cobro en POS** (`idempotency_key` en RPC + índice único) | P0 | A | B | POS, Ventas, Caja | Ventas duplicadas en reintento/offline | 0 duplicados en prueba de 500 reintentos |
| QW2 | Adoptar **TanStack Query** en las 6 páginas más pesadas | P0 | A | B | RRHH, Contab., Inventario, Compras | Latencia y estado inconsistente | −40 % de peticiones, TTI −30 % |
| QW3 | Eliminar todos los `as any` sobre el cliente de datos | P0 | M | B | POS, Compras | Errores en runtime silenciosos | 0 ocurrencias en lint |
| QW4 | Unificar `useTenant`/`useTenantContext` | P1 | M | B | Core | Fugas cross-tenant en UI | 1 sola fuente de verdad |
| QW5 | **Error tracking + logging estructurado** (Sentry + logs JSON en edge) | P0 | A | B | Todos | Ceguera operativa | MTTD < 5 min |
| QW6 | Suite de **regresión contable** (invariantes: debe=haber, GL=asientos, stock=movimientos) en CI | P0 | A | M | Finance | Errores financieros no detectados | 12 invariantes verdes por commit |
| QW7 | Firmar webhooks (HMAC) + backoff + DLQ | P1 | M | B | Platform | Integraciones inseguras | 100 % entregas firmadas |
| QW8 | Publicar **OpenAPI** de `api-v1` + rate limit por key | P1 | M | B | Platform | Contrato no gobernado | Spec publicada, 429 correcto |

### 30-90 días — fundaciones

| # | Iniciativa | P | Imp | Cplx | Dependencias | Métrica |
|---|---|---|---|---|---|---|
| F1 | **Event Store `domain_events`** + convención + registro de esquemas | P0 | A | M | — | 100 % eventos con correlation/causation |
| F2 | Publicación en sombra desde triggers actuales | P0 | A | M | F1 | Cobertura ≥ 90 % de hechos de negocio |
| F3 | **Capa de repositorios tipados por módulo**; prohibir `supabase.from` en `ui/` (ESLint) | P0 | A | M | QW2 | 0 accesos directos en páginas |
| F4 | Refactor de las 5 páginas > 500 LOC en componentes < 200 LOC | P1 | M | M | F3 | LOC máx. por archivo ≤ 250 |
| F5 | **Money tipado** + `numeric(18,4)` auditado en columnas monetarias | P0 | A | M | QW6 | 0 columnas monetarias en float |
| F6 | Claims de tenant y rol en JWT; RLS simplificada | P1 | A | M | Core | −30 % coste medio de query |
| F7 | Roles dinámicos por tenant + `can(module, action)` aplicado en BD | P1 | A | M | F6 | RBAC verificado por tests de RLS |
| F8 | CI/CD: lint, typecheck, tests, validación de migraciones, preview por PR | P0 | A | M | — | 100 % PR con gates |
| F9 | Capa analítica: vistas materializadas / marts para KPIs y dashboards | P1 | A | M | F1 | Dashboard < 800 ms p95 |

### 3-6 meses — plataforma

| # | Iniciativa | P | Imp | Cplx | Métrica |
|---|---|---|---|---|---|
| M1 | **Workflow Engine** (motor + editor visual + 3 flujos de referencia: compra, devolución, cierre mensual) | P1 | A | A | 3 flujos en producción sin código |
| M2 | **Rule Engine** + migración de fiscalidad, reposición y riesgo a reglas | P1 | A | A | 0 reglas fiscales en código |
| M3 | Retirada de triggers en favor de consumidores de eventos (orden de la §5.4) | P0 | A | A | Reconciliación con desviación 0 |
| M4 | **Enterprise Knowledge Graph** + `pgvector` + proyector | P1 | A | A | 20 tipos de nodo poblados; consulta < 1 s |
| M5 | Sagas y compensación para venta, compra y nómina | P1 | A | M | 0 estados inconsistentes en caos-test |
| M6 | CRM real: pipeline, presupuestos, conversión a pedido | P2 | M | M | Ciclo lead→factura completo |
| M7 | Observabilidad OTel end-to-end + SLOs y alertas | P1 | A | M | p95 y lag de eventos monitorizados |
| M8 | E2E Playwright de los 10 flujos críticos | P0 | A | M | Cobertura de flujo 100 % |

### 6-12 meses — inteligencia y escala

| # | Iniciativa | P | Imp | Cplx | Métrica |
|---|---|---|---|---|---|
| L1 | **Gemelo digital real**: modelo paramétrico del negocio + motor de simulación de escenarios + backtesting | P1 | A | A | Error de predicción < 15 % a 30 días |
| L2 | Memoria empresarial con GraphRAG (episódica + semántica) | P1 | A | A | Respuestas con citación de fuentes ≥ 95 % |
| L3 | Agentes con contratos de herramientas, políticas de autonomía y evaluación continua | P1 | A | A | ≥ 70 % de acciones autónomas aceptadas |
| L4 | Process mining sobre el Event Store (cuellos de botella, desviaciones) | P2 | M | M | 5 procesos mapeados automáticamente |
| L5 | Marketplace de extensiones + SDK + plugins con sandbox y permisos | P2 | A | A | 3 extensiones de terceros publicadas |
| L6 | Escala: read replicas, particionado de tablas de alto volumen, caché de lectura | P1 | A | M | 10× volumen sin degradación p95 |
| L7 | Pasarelas de pago y facturación electrónica ampliada | P2 | M | M | Pago online end-to-end |
| L8 | DR formal: RTO 4 h / RPO 15 min, ensayo trimestral de restauración | P0 | A | M | Ensayo superado |

### 12-24 meses — categoría mundial

| # | Iniciativa | Métrica |
|---|---|---|
| X1 | Extracción selectiva a servicios (Intelligence, Delivery, Marketplace) donde la métrica lo justifique | Despliegue independiente sin regresión |
| X2 | Multi-región y residencia de datos por jurisdicción | 2 regiones activas |
| X3 | Consolidación multi-empresa (grupos) y reporte IFRS | Consolidado auditable |
| X4 | Certificaciones: SOC 2 Tipo II / ISO 27001 | Auditoría superada |
| X5 | Localizaciones fiscales ampliadas (MX, CO, AR, CL, ES) | 5 países en producción |
| X6 | Autonomía gobernada: agentes con presupuesto, límites y auditoría de decisiones | 0 incidentes de autonomía |

### Dependencias críticas (ruta)

```text
QW1,QW5,QW6 ─▶ F1 ─▶ F2 ─▶ M3 ─▶ M5
                 └─▶ F9 ─▶ M4 ─▶ L1,L2,L3
F3 ─▶ F4 ─▶ M1,M2 ─▶ L5
F8 ─▶ M8 ─▶ L8
```

### Riesgos de programa

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| Doble escritura durante la migración a eventos | Alta | Alto | Fase de sombra + reconciliación diaria automatizada |
| Regresión financiera en refactor | Media | Crítico | QW6 antes de cualquier cambio en Finance; congelar semántica contable |
| Sobrecarga de la BD única | Media | Alto | Marts + réplicas + particionado (L6) antes de escalar clientes |
| Expectativa de IA superior a la capacidad real | Alta | Alto | Comunicar roadmap por fases; L1-L3 antes de vender "autonomía" |
| Rotación de conocimiento (lógica en 130 funciones SQL) | Media | Alto | Documentar contratos por contexto (Technical Writer, continuo) |

---

# FASE 10 — Benchmark internacional

| Criterio | SAP S/4HANA | Oracle NetSuite | Dynamics 365 | Odoo | ERPNext | Zoho One | Holded | Acumatica | **MarIA OS (hoy)** | **MarIA OS (12m)** |
|---|---|---|---|---|---|---|---|---|---|---|
| Arquitectura | 5 | 4.5 | 4.5 | 3.5 | 3 | 3.5 | 3 | 4 | **1.5** | **4** |
| Profundidad ERP | 5 | 4.5 | 4.5 | 4 | 3.5 | 3 | 2.5 | 4 | **3.5** | **4** |
| Motor financiero | 5 | 5 | 4.5 | 3.5 | 3 | 3 | 3.5 | 4.5 | **3.5** | **4.5** |
| POS integrado | 3 | 3 | 3.5 | 4 | 3 | 3 | 2 | 3 | **4.5** | **5** |
| Marketplace/e-comm | 3 | 4 | 3.5 | 4 | 3 | 3.5 | 2 | 3 | **3.5** | **4.5** |
| Delivery/última milla | 2 | 2.5 | 2.5 | 2.5 | 2 | 2 | 1.5 | 2 | **3.5** | **4.5** |
| IA embebida | 4 (Joule) | 4 | 4.5 (Copilot) | 2.5 | 1.5 | 3 | 2 | 2.5 | **2** | **4** |
| Agentes autónomos | 3 | 2.5 | 3.5 | 1 | 1 | 1.5 | 1 | 1 | **2** | **4** |
| Gemelo digital | 3 | 1.5 | 2 | 1 | 1 | 1 | 1 | 1 | **0.5** | **3.5** |
| Automatización sin código | 4 | 4 | 4.5 | 3.5 | 3 | 4.5 | 2.5 | 4 | **1.5** | **4** |
| APIs / extensibilidad | 4.5 | 4.5 | 4.5 | 4 | 3.5 | 4 | 3 | 4.5 | **2.5** | **4** |
| UX | 3 | 3.5 | 4 | 4 | 3 | 3.5 | 4 | 3.5 | **4** | **4.5** |
| Time-to-value / coste | 1 | 2 | 2 | 4 | 4.5 | 4.5 | 4.5 | 3 | **4.5** | **4.5** |
| Localización LATAM/Cuba | 3 | 2.5 | 3 | 3.5 | 3 | 2.5 | 2 | 2.5 | **4.5** | **5** |

### Fortalezas competitivas reales

1. **POS especializado por vertical** (bar/restaurante/retail) integrado nativamente con contabilidad — Odoo lo hace peor y SAP/NetSuite ni lo intentan en este segmento.
2. **Localización cubana e iberoamericana de primera mano** (ONAT, fichas de costo, multi-moneda CUP/USD/EUR): barrera de entrada real frente a todos los competidores.
3. **Time-to-value**: un tenant operativo en minutos con bootstrap contable automático — NetSuite/Acumatica requieren meses de implantación.
4. **Amplitud vertical en un solo producto** (POS + delivery + marketplace + RRHH + contabilidad) que en la competencia exige varios módulos licenciados.
5. **MCP nativo**: MarIA OS ya es consumible por agentes externos con OAuth — capacidad que SAP y NetSuite aún no ofrecen de forma estándar.

### Brechas frente al benchmark

1. Automatización sin código (Dynamics Power Automate, Zoho Flow, Odoo Studio) — **la brecha más comercialmente dolorosa**.
2. Extensibilidad y ecosistema de terceros (Odoo Apps, NetSuite SuiteApps).
3. Observabilidad, SLA y certificaciones de seguridad — bloquea clientes medianos y financiadores institucionales.
4. Profundidad financiera avanzada: activos fijos, consolidación, IFRS, presupuestación por escenarios.
5. Madurez de IA: los competidores tienen copilotos evaluados; MarIA OS tiene el mejor *relato* pero necesita L1-L3 para sostenerlo.

### Oportunidades de posicionamiento

- **"El primer ERP nativo de agentes"**: si se ejecutan M4 (grafo) + L1-L3, MarIA OS puede ofrecer autonomía operativa auditable que ningún competidor de su rango de precio tiene.
- **Vertical-first LATAM/Caribe**: gastronomía y retail MIPYME con fiscalidad local, un nicho desatendido por los grandes y mal cubierto por Odoo.
- **Composabilidad**: el Marketplace de extensiones (L5) convierte el producto en plataforma y el margen en recurrente.

---

## Criterios de aceptación — verificación

| Criterio | Estado |
|---|---|
| Toda la arquitectura revisada | ✅ Fases 1-2: 30 módulos y 12 dimensiones arquitectónicas |
| Inconsistencias documentadas | ✅ §1.5 (10 duplicaciones) + tablas por módulo + §4 (12 enlaces) |
| Propuesta de arquitectura futura | ✅ Fase 3 (5 plataformas, contextos, agregados, estructura de código) |
| Roadmap priorizado y ejecutable | ✅ Fase 9 (38 iniciativas con prioridad, impacto, complejidad, dependencias, riesgos y métricas) |
| Recomendaciones justificadas | ✅ cada una anclada a evidencia del código actual |
| Preparación para escalar | ✅ ruta a plataforma componible, orientada a eventos y gobernada por IA |

## Decisiones que el comité eleva al Product Owner

1. ¿Se congela la incorporación de nuevos módulos funcionales durante los primeros 90 días para ejecutar F1-F9? **Recomendación del comité: sí.**
2. ¿Se asume el coste de tipar el dinero y auditar columnas monetarias ahora (F5) o tras la primera incidencia financiera en cliente real? **Recomendación: ahora.**
3. ¿El discurso comercial de "agentes autónomos y gemelo digital" se mantiene antes de L1-L3, o se reformula como visión de producto? **Recomendación: reformular como roadmap público.**

---

*Documento vivo. Revisión trimestral por el comité. Próxima puerta de decisión: fin de Quick Wins (+30 días), con QW1, QW5 y QW6 como criterios de salida obligatorios.*
