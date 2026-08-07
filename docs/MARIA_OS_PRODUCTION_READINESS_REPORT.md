# MarIA OS — Fase 6

# Enterprise Functional Certification & Production Readiness Report

Fecha: 2026-08-07 · Alcance: auditoría **sin cambios de código ni de base de datos**
Evidencia: repositorio (`src/`, `supabase/functions/`) + consultas reales contra la base de datos productiva de la plataforma.

---

## 1. Resumen ejecutivo

MarIA OS es hoy un **MVP muy avanzado con arquitectura enterprise parcialmente implantada**, no un ERP SaaS certificable para clientes reales.

Medición objetiva del sistema:

| Dimensión | Medición real |
|---|---|
| Tablas en `public` | 126 (todas con RLS habilitada, 0 sin RLS) |
| Vistas | 17 (7 de ellas **sin `security_invoker`** → no aplican RLS) |
| Funciones SQL | 156 (154 `security definer`, **0 sin `search_path`** fijado) |
| Triggers | 232 (**28 combinaciones tabla+función duplicadas**) |
| Políticas RLS | 362 |
| Edge functions | 17 (5 con `verify_jwt = false`) |
| Páginas React | 56 |
| Páginas con `supabase.from()` directo | 37 |
| Páginas con módulo DDD | 3 (`Inventario`, `EventStore`, `DigitalTwin`) |
| Páginas con paginación server-side (`.range()`) | **0** |
| Tests automatizados | 66 (7 archivos, todos de dominio puro) |
| Tests de integración / E2E | **0** |

**Veredicto**: `NO CERTIFICABLE` para venta a clientes reales en el estado actual.
Existen **5 bugs críticos** que corrompen o falsean información financiera (triggers duplicados que aplican saldos dos veces, taxonomía contable mixta que vacía el Estado de Resultados, reportes que filtran por estados de venta inexistentes, ventas que no generan kardex, vistas contables sin RLS ni permisos). Ninguno es de arquitectura: todos son corregibles en un sprint de estabilización.

Estimación para certificación comercial: **4 sprints (~300–380 h)**.

---

## 2. Estado actual del producto

Fortalezas reales, verificadas:

- **Multi-tenancy sólido**: 126/126 tablas con RLS activa; 362 políticas; helpers `is_tenant_member`, `is_tenant_owner`, `has_role` con `security definer` y `search_path` fijo. Roles en tabla separada (`user_roles`), sin escalada por perfil.
- **Motor contable de partida doble operativo**: en los 3 tenants demo, `SUM(debe) = SUM(haber)` exacto (135.500 / 192.258 / 1.832.512), 0 asientos sin período, 0 ventas completadas sin asiento.
- **Event store en shadow mode** funcionando (114 eventos, panel de divergencias).
- **Idempotencia financiera** en las 3 RPC críticas + tabla `operation_idempotency`.
- **Observabilidad y correlación** (`operation_id` / `correlation_id`) implantadas.
- **Módulos DDD** (inventario, eventos, inteligencia) con dominio puro testeado.

Debilidades estructurales:

- La UI sigue siendo el repositorio: 37 páginas consultan la base de datos directamente, **0 usan TanStack Query** pese a que el provider está montado.
- Los permisos existen en BD pero **no gobiernan la aplicación**.
- Los reportes de gestión se calculan en el frontend, no en contabilidad.
- No hay cobertura de pruebas de flujo (todo el testing es de funciones puras).

---

## Fase 1 — Inventario funcional completo

Estado: `COMPLETO` (funciona de punta a punta) · `PARCIAL` · `CON ERRORES` · `SOLO UI` (pantalla sin flujo operativo real).

| Módulo | Estado | % | Terminado | Incompleto | Errores encontrados | Dependencias | Prioridad |
|---|---|---|---|---|---|---|---|
| Dashboard (`Index`) | PARCIAL | 70 | KPIs, accesos rápidos | Sin filtros de período; consultas con `limit` fijo | Métricas calculadas en cliente | Contabilidad, Ventas | ALTO |
| POS (núcleo) | COMPLETO | 90 | Venta, pagos multi-moneda, split, offline queue, turno obligatorio | `Money` no propagado (FX en cliente) | FX calculado en `PaymentDialog.tsx` | Turnos, Inventario | CRÍTICO |
| POS Restaurante | COMPLETO | 85 | Mesas (24 en demo), comandas, KDS (17), división de cuenta | Sin control de tiempos por mesa | — | Cocina | ALTO |
| POS Bar | COMPLETO | 85 | Venta rápida, recetas de cóctel (10), KDS (4) | Sin control de mermas de bebida | — | Recetas | ALTO |
| Inventario | PARCIAL | 65 | Módulo DDD, movimientos, ajustes, alertas | **Las ventas no descuentan kardex** | 54 ventas completadas / solo 24 movimientos totales | POS, Recetas | CRÍTICO |
| Compras | PARCIAL | 70 | OC, recepción, consignación, FX, AP automática | 12 de 30 compras sin asiento contable | `compras_sin_asiento = 4` por tenant | Contabilidad, Proveedores | CRÍTICO |
| Ventas | COMPLETO | 85 | Ventas, líneas, pagos, devoluciones, tickets | Estados no normalizados (`completed`/`paid`/`pending`) | Reportes filtran estados inexistentes | POS | CRÍTICO |
| Clientes / CRM | PARCIAL | 60 | Alta, saldo, fidelización, cupones, timeline | Sin segmentación ni campañas; listado sin paginación | `Clientes.tsx` sin `limit`/`range` | Ventas | MEDIO |
| Proveedores | PARCIAL | 65 | Alta, compras asociadas, deuda (`v_ap_aging`) | Sin evaluación ni comparativa de precios | Vista de aging sin permisos concedidos | Compras | MEDIO |
| Productos | COMPLETO | 85 | Catálogo, variantes, categorías, costos, imágenes | Rentabilidad por producto no consolidada | — | Inventario | ALTO |
| Lotes / Series | SOLO UI | 25 | Tablas y pantalla existen | **0 lotes en los 3 demos**; sin flujo de caducidad | Nunca ejercitado | Inventario | MEDIO |
| Almacenes | COMPLETO | 80 | 3 por tenant, stock por ubicación | Listado sin paginación | — | Inventario | MEDIO |
| Transferencias | PARCIAL | 55 | Flujo completo en TechStore (3) | 0 transferencias en bar y restaurante; sin asiento contable de traslado | Sin impacto contable | Almacenes | MEDIO |
| Contabilidad | PARCIAL | 70 | Diario, mayor, cierre de período, plantillas de plan | **Taxonomía de cuentas mixta ES/EN**; Estado de Resultados vacío | `v_income_statement` devuelve 0 filas | Todos | CRÍTICO |
| Tesorería | SOLO UI | 30 | Pantalla, previsión, cuentas bancarias, SEPA, conciliación | **0 cuentas bancarias y 0 movimientos bancarios en los 3 demos** | Conciliación jamás ejecutada | Contabilidad | ALTO |
| Facturación | PARCIAL | 55 | Series, emisión, PDF, envío por email, transmisión | Solo 8 facturas y solo en 1 tenant; bar y restaurante con 0 | Flujo e-invoice no validado | Ventas | ALTO |
| RRHH | PARCIAL | 70 | Empleados (23), contratos, asistencia, PIN cifrado, vacaciones | Página con 22 accesos directos a BD | Sin paginación ni control de errores | Turnos | ALTO |
| Nómina | PARCIAL | 65 | Cálculo, conceptos, tramos, AP y asiento automáticos | 16 corridas totales; sin recibo formal ni retenciones por país | Impuestos de nómina solo CU | Contabilidad | ALTO |
| Turnos / Caja | COMPLETO | 90 | Apertura única por tienda, trabajador con PIN, cierre Z, auditoría | Arqueo por moneda parcial | — | POS | ALTO |
| Marketplace | COMPLETO | 80 | Catálogo público, carrito, pedidos, reseñas verificadas | Sin pago online (por diseño) | — | Productos | MEDIO |
| IA / Agentes | PARCIAL | 60 | 21 agentes, acciones, riesgos, decisiones, MCP | Autonomía real no ejercitada; acciones sin aprobación en flujo | Solo shadow | Event Store | MEDIO |
| Gemelo Digital | PARCIAL | 65 | Baseline adaptativo, simulación sobre `Money`, KG (58–66 nodos) | Sin predicción temporal ni escenarios guardados | — | Event Store, KG | MEDIO |
| Reportes | CON ERRORES | 40 | Ventas, inventario, clientes, exportación | **Filtra `status IN ('paid','partial')` sobre datos `completed`** | `Reportes.tsx:43` → reportes casi vacíos | Contabilidad | CRÍTICO |
| Configuración | COMPLETO | 85 | Categorías, impuestos, monedas, métodos de pago, POS, módulos | País/perfil contable editables pero poco propagados | — | — | MEDIO |
| Usuarios | PARCIAL | 70 | Alta vía edge function, asignación a tenant, demos por rol | Sin invitación por email ni desactivación | — | Auth | ALTO |
| Roles | COMPLETO | 80 | 5 roles, matriz de 20 módulos × 5 roles poblada | Faltan roles `contador` y `empleado` exigidos | — | — | ALTO |
| Permisos | CON ERRORES | 35 | Matriz completa en BD y panel de administración | **La UI no consume `role_permissions`**; rutas solo verifican sesión | `ProtectedRoute.tsx` sin chequeo de rol | Roles | CRÍTICO |
| Integraciones | PARCIAL | 60 | API v1, webhooks (cola + dispatcher), MCP, OAuth | 4 endpoints públicos sin auditoría cerrada | `verify_jwt=false` ×5 | Seguridad | ALTO |

---

## Fase 2 — Validación de demos por tipo de tenant

Datos reales medidos por tenant demo:

| Entidad | Bar El Trópico | Restaurante La Mesa | TechStore Cuba |
|---|---|---|---|
| Usuarios / roles | 3 | 3 | 5 |
| Tiendas / almacenes | 3 / 3 | 4 / 3 | 4 / 3 |
| Productos | 32 | 34 | 30 |
| Recetas | 10 | 7 | 0 (n/a) |
| Mesas | 7 | 24 | 0 (n/a) |
| Comandas KDS | 4 | 17 | 0 (n/a) |
| Ventas / líneas / pagos | 24 / 66 / 22 | 20 / 74 / 18 | 18 / 41 / 18 |
| Compras | 10 | 10 | 8 |
| Cuentas por pagar | 7 | 2 | 13 |
| Movimientos de inventario | 7 | 7 | 10 |
| Asientos / líneas / mayor | 33 / 108 / 64 | 30 / 92 / 65 | 26 / 84 / 70 |
| Facturas | **0** | **0** | 8 |
| Cuentas bancarias / movimientos | **0 / 0** | **0 / 0** | **0 / 0** |
| Lotes | **0** | **0** | **0** |
| Transferencias | **0** | **0** | 3 |
| Cobros a clientes | 1 | **0** | **0** |
| Empleados / nóminas | 7 / 7 | 9 / 2 | 7 / 7 |
| Turnos | 2 | 2 | 2 |
| Eventos de dominio | 41 | 37 | 36 |

### Veredicto por tenant

**TENANT 1 — Restaurante La Mesa**: `PARCIAL`. Cubre empresa, sucursales, usuarios, roles, mesas, menú, recetas, compras, ventas, caja, turnos, cocina y contabilidad. **Faltan: facturación (0), tesorería (0 bancos), y el inventario no se descuenta por venta** (7 movimientos frente a 20 ventas y 74 líneas).

**TENANT 2 — Bar El Trópico**: `PARCIAL`. Ventas rápidas, recetas de cóctel, cierre de caja y reportes existen. **Falta control real de bebidas**: sin lotes, sin mermas y sin descuento de stock por consumo (7 movimientos / 66 líneas vendidas).

**TENANT 3 — TechStore Cuba**: `PARCIAL`, el más completo. Compras, ventas, clientes, proveedores, almacenes, transferencias y facturación (8) operativos. **Faltan finanzas reales**: 0 cuentas bancarias, 0 conciliación, 0 cobros registrados frente a 13 cuentas por pagar.

### Matriz CRUD + trazabilidad exigida

| Capacidad | Restaurante | Bar | Comercial |
|---|---|---|---|
| Crear operación | Sí | Sí | Sí |
| Modificar operación | Parcial (venta cerrada no editable, sin nota de ajuste) | Parcial | Parcial |
| Eliminar/anular | Sí (`cancel_sale`, devoluciones) | Sí | Sí |
| Ver historial | Sí (`activity_log` + `domain_events`) | Sí | Sí |
| Generar reportes | **No fiable** (bug de estados) | **No fiable** | **No fiable** |
| Impactar contabilidad | Ventas sí; compras parcial; inventario **no** | Igual | Igual |

---

## Fase 3 — Auditoría del motor financiero

### VENTAS

| Artefacto esperado | Resultado |
|---|---|
| `sales` | OK (54 completadas) |
| `sale_items` | OK (181 líneas) |
| `sale_payments` | OK (58) |
| `inventory_movements` | **FALLA — 54 ventas completadas, 0 con movimiento asociado** |
| `journal_entries` | OK (0 ventas sin asiento) |
| `journal_entry_lines` | OK (Debe = Haber exacto) |
| `general_ledger` | OK (199 filas en balance de comprobación) |

### COMPRAS

| Artefacto esperado | Resultado |
|---|---|
| `purchases` (equivale a `purchase_orders`) | OK (28) |
| `purchase_items` | OK |
| Entradas de inventario | Parcial — solo al ejecutar `receive_purchase` |
| `accounts_payable` | OK (22) |
| `journal_entries` | **FALLA — 12 compras sin asiento (4 por tenant)** |

### PAGOS

| Flujo | Resultado |
|---|---|
| Cobros a clientes (`account_payments`) | **1 registro en total** → flujo prácticamente no ejercitado |
| Pagos a proveedores | Parcial (`amount_paid` en `purchases`, sin pago formal) |
| Caja | OK vía turnos y `shift_cash_movements` |
| Bancos | **0 cuentas, 0 movimientos** → módulo no operativo |
| Conciliación | **No ejecutable** (sin extractos ni movimientos) |

### Errores detectados — causa raíz y corrección

**BUG-01 · CRÍTICO · Triggers duplicados con efectos de negocio**
Ubicación: base de datos, 28 pares tabla+función duplicados.
Los siguientes **modifican estado** y se ejecutan dos o tres veces por operación:

| Tabla | Función | Triggers | Efecto |
|---|---|---|---|
| `account_payments` | `apply_account_payment_balance` | `trg_apply_account_payment_balance`, `account_payments_apply` | Saldo de cliente/proveedor descontado **dos veces** |
| `sales` | `apply_sale_credit_balance` | `trg_apply_sale_credit_balance`, `sales_apply_credit` | Crédito de cliente aplicado dos veces |
| `purchases` | `apply_purchase_credit_balance` | `trg_apply_purchase_credit_balance`, `purchases_apply_credit` | Crédito de proveedor aplicado dos veces |
| `purchase_items` | `sync_supplier_product_from_purchase` | 3 triggers | Coste de proveedor recalculado 3 veces |
| `sales` | `trg_auto_award_loyalty` | `trg_auto_award_loyalty` (U), `sales_loyalty` (I+U) | Puntos de fidelidad duplicados |
| `sales` | `trg_consignment_on_paid` | `trg_consignment_on_paid`, `sales_consignment_alloc` | Asignación de consignación duplicada |
| `account_payments`, `invoices`, `sales_shifts`, `product_stock` | notificaciones | ×2 | Notificaciones duplicadas |
| 15 tablas | `update_updated_at_column` | ×2 | Inocuo, ruido |

Causa raíz: migraciones sucesivas crearon el mismo trigger con nombre distinto sin `DROP TRIGGER IF EXISTS`.
Corrección: eliminar el duplicado de cada par (conservar uno), y auditar saldos de `customers.balance` y `suppliers` para recalcular los ya corrompidos.

**BUG-02 · CRÍTICO · Las ventas no generan kardex**
Ubicación: no existe trigger sobre `sale_items`/`sales` que invoque `process_sale_stock`; la función solo se llama desde `create_quick_sale` y `sync_offline_sale`.
Evidencia: 54 ventas completadas, 24 movimientos de inventario en total (todos de compras/ajustes).
Consecuencia: stock inflado, coste de ventas ausente, márgenes irreales, recetas nunca consumidas.
Corrección: trigger `AFTER INSERT` en `sale_items` (o llamada única en la frontera de venta) con guardas de idempotencia.

**BUG-03 · CRÍTICO · Estado de Resultados vacío por taxonomía mixta**
Ubicación: `accounting_accounts.type` contiene simultáneamente `asset/liability/equity/income/expense/cost` **y** `activo/pasivo/capital/ingreso/gasto` (12 valores distintos, 61 cuentas en español).
`v_income_statement` filtra `type IN ('income','expense')` → **0 filas**.
Corrección: enum canónico + migración de datos + `CHECK`; revisar todas las vistas y funciones que filtran por `type`.

**BUG-04 · CRÍTICO · Reportes filtran estados inexistentes**
Ubicación: `src/pages/Reportes.tsx:43` — `.in("status", ["paid","partial"])`.
Estados reales de `sales`: `completed` (54), `pending` (7), `paid` (1).
Consecuencia: todos los reportes de gestión muestran 1 venta de 54.
Corrección: normalizar estados y consumir contabilidad, no `sales`.

**BUG-05 · CRÍTICO · Vistas contables sin RLS y sin permisos**
Ubicación: `v_income_statement`, `v_balance_sheet`, `v_trial_balance`, `v_ar_aging`, `v_ap_aging`, `v_cash_flow`, `tenants_public`, `stores_public` creadas **sin `security_invoker=on`**; además **no tienen `GRANT` a `authenticated` ni `anon`**.
Doble consecuencia: (a) inaccesibles desde la aplicación (permission denied), (b) si se concedieran permisos tal cual, expondrían datos de **todos los tenants** al ignorar RLS.
Corrección: `ALTER VIEW ... SET (security_invoker = on)` + `GRANT SELECT` explícito.

**BUG-06 · ALTO · Compras sin asiento**
12 de 28 compras sin `journal_entries`. Causa probable: `trg_post_purchase_journal` condicionado a `status='received'` y compras en `pending`/`draft`/`partial` (20 de 28). Corrección: definir política contable de reconocimiento y backfill.

---

## Fase 4 — Auditoría contable profesional

| Informe | Existe | Fuente | Veredicto |
|---|---|---|---|
| Estado de Resultados | Sí (`v_income_statement`) | `general_ledger` | **FALLA — 0 filas** (BUG-03). La UI de gestión lo suple con cálculo frontend sobre `sales` (`Reportes.tsx:277`) |
| Balance General | Sí (`v_balance_sheet`) | `general_ledger` | Datos presentes (35 filas) pero **incompleto**: excluye las 61 cuentas con tipo en español |
| Balance de Comprobación | Sí (`v_trial_balance`, `trial_balance_view`) | `general_ledger` | **OK** — 199/321 filas; Debe = Haber exacto en los 3 tenants |
| Libro Diario | Sí (`Contabilidad.tsx`, `AccountingReports.tsx:140`) | `journal_entries` + `journal_entry_lines` | **OK** — fecha, cuenta, descripción, debe, haber, referencia |
| Libro Mayor | Sí (`general_ledger_view`) | `general_ledger` | **OK** — saldo inicial, débitos, créditos, saldo final, herencia entre períodos |

### Pruebas matemáticas ejecutadas

| Prueba | Bar | Restaurante | TechStore |
|---|---|---|---|
| `SUM(debe)` | 135.500,00 | 192.258,00 | 1.832.512,00 |
| `SUM(haber)` | 135.500,00 | 192.258,00 | 1.832.512,00 |
| Diferencia | **0,00** | **0,00** | **0,00** |
| Asientos sin período | 0 | 0 | 0 |
| Asientos sin postear | 0 | 1 | 1 |
| Ventas completadas sin asiento | 0 | 0 | 0 |

**Conclusión contable**: la partida doble es correcta y el mayor es reconstruible. El problema no es el motor, es la **taxonomía de cuentas** y que **la gestión no lee de contabilidad**: `Reportes.tsx` construye P&L desde `sales`, `purchases` y `product_stock` en el navegador (7 consultas directas), incumpliendo el requisito "los reportes deben salir desde la contabilidad real".

---

## Fase 5 — Auditoría de datos históricos

| Entidad | Historial exigido | Estado real |
|---|---|---|
| Clientes (28) | Compras, pagos, facturas, saldo | **PARCIAL** — compras y saldo sí; **1 pago en todo el sistema**; facturas solo en 1 tenant |
| Empleados (23) | Contratos, asistencia, nómina, pagos | **PARCIAL** — contratos y nómina (16 corridas) sí; asistencia dispersa; pago de nómina genera AP pero sin liquidación |
| Proveedores (8) | Compras, pagos, deuda | **PARCIAL** — compras (28) y deuda (`v_ap_aging`, 20 filas) sí; **sin pagos formales a proveedor** |
| Productos (96) | Movimientos, costos, ventas, rentabilidad | **FALLA** — movimientos casi inexistentes (BUG-02); sin coste de ventas → **rentabilidad no calculable** |

Timeline: existe infraestructura completa (`activity_log`, `domain_events` con 114 eventos, `ActivityTimeline.tsx`, `DetailHeader.tsx`) y las páginas de detalle la usan. El problema es **densidad de datos**, no capacidad.

---

## Fase 6 — Paginación y performance

| Métrica | Valor |
|---|---|
| Páginas con paginación server-side (`.range()`) | **0 de 56** |
| Páginas con `.limit()` (tope fijo, no paginación) | 22 |
| Páginas con acceso a BD sin ningún límite | **16** |
| Páginas con TanStack Query | **0** (el provider está montado y sin usar) |
| Páginas con estado vacío explícito | 14 de 56 |
| Páginas con manejo de error visible | ~12 de 37 con acceso a BD |
| N+1 con `.map(async` | 0 detectados |

Páginas de mayor riesgo (listados sin límite): `Clientes`, `Empleados`, `Tiendas`, `Almacenes`, `Recetas`, `Reportes`, `SuperAdmin`, `Developers`, `Agents`, `Workflows`, `Mesas`, `Analytics`, `Auditoria`, `PedidosOnline`, `TurnoDetalle`, `VentaDetalle`.

`TablePagination.tsx` y `TableToolbar.tsx` existen pero implementan **paginación de cliente** sobre datos ya descargados. Con 10.000 ventas por tenant, la aplicación colapsa.

Índices: los 10 índices del Sprint 0–30 están aplicados sobre las tablas calientes; la deuda de performance es **exclusivamente de frontend**.

---

## Fase 7 — Seguridad y permisos

### Multi-tenancy

`SÓLIDO CON UNA BRECHA`. 126/126 tablas con RLS, 362 políticas, 154 funciones `security definer` **todas** con `search_path` fijado. Las políticas amplias (`USING (true)`) son 8 y todas sobre catálogos no sensibles (`app_modules`, `posting_rules`, `chart_account_templates`, `tax_templates`, `accounting_profiles`, `role_permissions`, `profiles`).

**Brecha real**: 7 vistas sin `security_invoker` (BUG-05) — incluidas `v_balance_sheet`, `v_trial_balance`, `v_ar_aging`, `v_ap_aging`, `v_cash_flow`. Hoy no filtran datos porque carecen de `GRANT`, pero cualquier concesión futura expone la contabilidad de todos los tenants.

### Control de acceso en la aplicación

`INSUFICIENTE`.

- `ProtectedRoute.tsx` verifica **únicamente sesión**: cualquier usuario autenticado puede navegar a `/superadmin`, `/roles`, `/contabilidad`. La protección depende de que el sidebar no muestre el enlace.
- `role_permissions` (matriz de 20 módulos × 5 roles, poblada) se consulta en **un solo sitio**: `PermissionsTab.tsx`. **No gobierna la UI**.
- El único chequeo de rol en toda la aplicación es `AppSidebar.tsx:291` (`admin` sí/no). El resto del menú se filtra por `business_type`, no por permisos.

### Matriz Rol → Permisos → Módulos (estado real en BD)

| Rol | Módulos | Ver | Crear | Editar | Eliminar |
|---|---|---|---|---|---|
| admin | 20 | 20 | 20 | 20 | 20 |
| gerente | 20 | 20 | 19 | 19 | 11 |
| supervisor | 20 | 19 | 7 | 17 | 0 |
| cajero | 20 | 10 | 4 | 4 | 0 |
| inventarista | 20 | 9 | 5 | 5 | 1 |
| **contador** | **NO EXISTE** | — | — | — | — |
| **empleado** | **NO EXISTE** | — | — | — | — |

CRUD de permisos: crear/modificar/asignar existen en `PermissionsTab`/`UsersTab`; **falta crear roles nuevos** (el enum `app_role` es fijo: 5 valores) y falta eliminar permisos.

### Superficie pública

5 edge functions con `verify_jwt=false`: `check-superadmin`, `register-superadmin` (cerrada tras bootstrap), `api-v1`, `webhook-dispatcher`, `ensure-demo-user` (rate-limited + validación por `is_demo`). Auditadas en `docs/security-audit.md`; **`api-v1` y `webhook-dispatcher` siguen sin firma HMAC verificada**.

---

## Fase 8 — Fiscalidad internacional

Estado: `ARQUITECTURA A MEDIAS`.

Ya existe: `tenants.country_code` + `accounting_profile_code`, plantillas de plan contable (`cu_onat`, `es_pgc`, `mx_sat`, `niif_generic`), `tax_rates` por tenant, `tax_templates`, `br_tax_jurisdictions`, funciones `br_get_icms_rate` / `br_get_iss_rate`, `cu_tax_declarations`.

Faltas y acoplamientos a Cuba:

| Problema | Ubicación |
|---|---|
| `"CUP"` como moneda por defecto en código | `usePOSSettings.tsx:40`, `TurnoDetalle.tsx:95`, `Tesoreria.tsx:38,40,74`, `Compras.tsx:138,605`, `DigitalTwin.tsx:45` |
| Locale y moneda fijos `es-CU` / `CUP` | `CuCostSheetsTab.tsx:42` |
| Etiqueta "IVA" fija en el flujo de venta, ignorando el nombre configurado en `tax_rates` | `QuickSaleDialog.tsx:179,198`, `ConfigModules.tsx:63`, `es.json:963` |
| Tab "Declaraciones ONAT" visible sin condicionar por país | `Contabilidad.tsx:690` |
| Plantilla contable por defecto `cu_onat` | `Contabilidad.tsx:120` |
| No existe **Fiscal Rules Engine** unificado: la lógica fiscal está repartida entre `tax_rates`, funciones `br_*`, funciones `cu_*` y componentes | transversal |

Cobertura por impuesto: IVA (genérico, configurable) `PARCIAL`; ICMS/ISS (BR) `PARCIAL` (funciones sin UI); IGV (PE) `NO EXISTE`; retenciones `NO EXISTE` fuera de nómina CU; impuestos especiales `NO EXISTE`; Sales Tax (US, por estado) `NO EXISTE`.

---

## Fase 9 — Gemelo digital e IA

**Qué consume**: `twin_baseline(tenant, days)` con ventana adaptativa sobre `sales` con `status='completed'`; `kg_nodes`/`kg_edges` reconstruidos por `rebuild_knowledge_graph`.

**Qué modela**: producto↔categoría, cliente→producto, tienda→producto, proveedor→producto, empleado→tienda. 58–66 nodos y hasta 108 aristas por empresa.

**Qué simula**: variación de precio, coste, demanda, gastos fijos, horizonte temporal, punto de equilibrio y runway de caja, sobre el value object `Money` (14 tests).

**Faltantes identificados**:

| Componente | Estado | Falta |
|---|---|---|
| Event Store | Implementado en shadow (114 eventos) | Proyecciones reales; ningún trigger legado retirado (regla de 14 días limpios aún no cumplida) |
| Knowledge Graph | Implementado | No incorpora eventos ni series temporales; solo relaciones estáticas |
| Motor de simulación | Implementado | Determinístico y de un solo escenario; sin Montecarlo, sin escenarios persistidos, sin comparación contra realidad |
| Predicciones | **NO EXISTE** | Sin forecast de demanda, tesorería ni rotación; los 21 agentes IA no consumen el gemelo |
| Cierre del bucle | **NO EXISTE** | Las decisiones (`business_decisions`) no se contrastan contra el resultado real |

Además, el gemelo hereda BUG-02: sin kardex ni coste de ventas, el margen simulado se basa en `cost` de catálogo, no en coste real.

---

## Fase 10 — Reporte final CTO

### Bugs críticos (bloquean la comercialización)

| ID | Bug | Impacto | Prioridad |
|---|---|---|---|
| BUG-01 | 6 triggers de negocio duplicados (saldos, crédito, fidelidad, consignación) | Corrupción financiera silenciosa | CRÍTICO |
| BUG-02 | Las ventas no generan movimientos de inventario | Stock, coste de ventas y margen falsos | CRÍTICO |
| BUG-03 | Taxonomía contable mixta ES/EN → Estado de Resultados vacío | Informe legal inexistente | CRÍTICO |
| BUG-04 | `Reportes.tsx` filtra estados de venta inexistentes | Reportes de gestión vacíos | CRÍTICO |
| BUG-05 | 7 vistas contables sin `security_invoker` ni `GRANT` | Fuga cross-tenant potencial + informes inaccesibles | CRÍTICO |
| BUG-06 | 12 de 28 compras sin asiento contable | Gasto y pasivo subestimados | ALTO |
| BUG-07 | Rutas protegidas solo por sesión, no por rol | Acceso a `/superadmin` y `/roles` por cualquier usuario | CRÍTICO |
| BUG-08 | 0 paginación server-side; 16 listados sin límite | Colapso con volumen real de cliente | ALTO |

### Riesgos empresariales

1. **Riesgo contable/legal**: sin Estado de Resultados y sin coste de ventas, MarIA OS no puede sustentar una declaración fiscal. Bloqueante absoluto para venta.
2. **Riesgo de confianza**: los saldos duplicados por BUG-01 aparecen como errores de dinero del cliente; un solo incidente destruye la relación comercial.
3. **Riesgo de escalabilidad**: el primer cliente con 50.000 ventas hace inutilizable la aplicación.
4. **Riesgo de seguridad**: la ausencia de autorización por ruta es un hallazgo que suspende cualquier due diligence de un cliente enterprise.
5. **Riesgo de internacionalización**: la promesa multi-país no es sostenible hoy fuera de Cuba.

### Deuda técnica

| Deuda | Magnitud |
|---|---|
| Acceso directo a BD desde la UI | 37 páginas, 78 archivos |
| TanStack Query montado y sin usar | 0 de 56 páginas |
| Módulos DDD | 3 de ~25 dominios |
| Tests de integración / E2E | 0 |
| Triggers duplicados | 28 pares |
| Estados de negocio no normalizados | `sales`: 3 valores; `purchases`: 5 |
| i18n | 3 páginas sin traducir; ~45 con traducción mínima; `Landing` con 73 literales |
| Lógica fiscal dispersa | sin motor unificado |

### Roadmap de cierre

**Sprint A — Estabilización financiera (CRÍTICO · ~80 h)**
Eliminar triggers duplicados y recalcular saldos afectados (16 h) · Trigger de kardex en venta + backfill de movimientos y coste de ventas (24 h) · Enum canónico de tipos de cuenta + migración de las 61 cuentas en español (16 h) · `security_invoker` + `GRANT` en las 7 vistas (4 h) · Backfill de asientos de compra y política de reconocimiento (12 h) · Suite de invariantes ampliada (8 h). Dependencias: ninguna. Complejidad: alta (toca dinero).

**Sprint B — Seguridad y autorización (CRÍTICO · ~60 h)**
Guard de rutas por rol y permiso, alimentado por `role_permissions` (20 h) · Hook `usePermissions` y gating de acciones CRUD en la UI (20 h) · Roles `contador` y `empleado` + gestión de roles personalizados (12 h) · HMAC en `api-v1` y `webhook-dispatcher` (8 h). Dependencia: Sprint A no bloqueante.

**Sprint C — Datos, reportes y performance (ALTO · ~100 h)**
Migrar los 16 listados críticos a TanStack Query + `.range()` server-side (40 h) · Reescribir `Reportes.tsx` para consumir contabilidad, no `sales` (16 h) · Completar demos: bancos, conciliación, facturación en los 3 tenants, lotes, cobros y pagos (24 h) · Estados vacíos y manejo de error homogéneos (20 h).

**Sprint D — Fiscalidad e inteligencia (MEDIO · ~90 h)**
Fiscal Rules Engine por país con `tax_rules` declarativas (32 h) · Eliminar defaults `CUP`/`IVA`/ONAT del código (16 h) · IGV, retenciones y Sales Tax (24 h) · Forecast de demanda y tesorería en el gemelo + conexión con los agentes (18 h).

**Total estimado: 330 h (~4 sprints de 2 semanas con 2 desarrolladores).**

### Certificación

| Criterio de ERP SaaS comercializable | Estado |
|---|---|
| Integridad financiera end-to-end | **NO** (BUG-01, 02, 06) |
| Informes contables legales | **NO** (BUG-03) |
| Aislamiento multi-tenant | **SÍ** en tablas · **NO** en vistas (BUG-05) |
| Autorización por rol | **NO** (BUG-07) |
| Escalabilidad de datos | **NO** (BUG-08) |
| Multi-país fiscal | **PARCIAL** |
| Trazabilidad y auditoría | **SÍ** |
| Cobertura de pruebas de flujo | **NO** |

**Veredicto final: MarIA OS es un MVP avanzado con cimientos enterprise reales (RLS, partida doble, event store, idempotencia, DDD parcial). No es certificable hoy. Con los Sprints A y B cerrados pasa a "vendible con acompañamiento"; con A–D cerrados alcanza la condición de ERP SaaS empresarial comercializable.**
