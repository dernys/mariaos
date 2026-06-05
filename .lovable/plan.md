
# Auditoría integral y rearquitectura — MarIA OS

> Documento de auditoría + roadmap. **No ejecuto cambios hasta aprobación**. Cada fase se aprueba antes de implementarse para no romper multi-tenant, RLS, contabilidad, inventario, marketplace, delivery ni analytics.

---

## 1. Estado actual (auditoría)

### 1.1 Inventario del sistema
- **53 páginas** en `src/pages/`, **41 migraciones** SQL, ~30 funciones SECURITY DEFINER, 11 edge functions.
- Verticales soportados: `bar`, `restaurant`, `empresa` (sin BR localizado).
- Multi-tenant funcional vía `tenants` + `tenant_users` + `is_tenant_member()` + `is_superadmin()` en RLS.

### 1.2 Flujos que SÍ funcionan end-to-end ✅
| Flujo | Trigger / función |
|---|---|
| Venta POS → asiento contable | `trg_post_sale_journal` → `post_sale_journal_entry` |
| Venta crédito → balance cliente/empleado | `apply_sale_credit_balance` |
| Cobro / pago → balance + actualiza venta/compra | `register_account_payment` + `apply_account_payment_balance` |
| Compra recibida → stock + asiento | `receive_purchase` + `trg_post_purchase_journal` |
| Cierre de turno → arqueo | `calculate_shift_summary` |
| Devolución con restock | `process_sale_return` |
| Transferencia entre almacenes | `receive_stock_transfer` |
| Fidelización auto al pagar | `trg_auto_award_loyalty` |
| Sync offline POS idempotente | `sync_offline_sale` (client_uuid) |

### 1.3 Problemas detectados 🔴

**Críticos (rompen integridad):**
1. **`process_sale_stock` no se llama si el turno no tiene `store_id`** → ventas sin descuento de stock. (Ya identificado en blueprint anterior — sigue sin parche.)
2. **Nómina no genera CxP** del empleado: `post_payroll_journal_entry` saltea cuando falta plan contable, y no llama `register_account_payment('employee', …, direction='out')`. `employees.balance` queda en 0.
3. **CxC / CxP sin desglose por moneda real**: `account_payments` guarda `amount_in_base` pero `customers.balance / suppliers.balance / employees.balance` son escalares — no hay vista por moneda origen ni reevaluación por diferencia de cambio.
4. **`process_sale_stock` ambigüedad de columnas** ya corregida; revisar que `compute_payroll_full` no tenga el mismo patrón en `hours_worked` (alias de columna vs variable). Confirmado: la función actual usa variables `_hours` — OK. Pero el reporte del usuario seguía apareciendo; raíz probable: vista o función auxiliar de payroll que aún referencia `hours_worked` sin calificar.
5. **`tenants.business_type`** acepta strings libres (`restaurant`, `restaurante`, `bar`, `empresa`). El sidebar y POS hacen comparaciones por string — riesgo de divergencia. Falta enum.
6. **`suppliers` no está en types generados** → casts `(as any)` en frontend.

**Altos:**
7. **Dashboard sin Realtime** — KPIs estáticos hasta refresh.
8. **`RRHHEnterprise.tsx` es código muerto** (no enrutado).
9. **Sidebar**: `Almacenes`, `Transferencias`, `Tiendas`, `Operaciones` no tienen filtro `types` — aparecen en bares donde no aplican igual.
10. **Marketplace** permite pedidos sin cuenta (`upsert_customer_for_online_order` crea cliente fantasma con `'Cliente Marketplace'`).
11. **Delivery**: no hay tabla `delivery_drivers` con documentos/licencia/vehículo, ni estados (`available`, `picking`, `in_route`…), ni tracking GPS, ni clasificación bronce/plata/oro.
12. **Recetas / BOM**: tablas existen pero no hay descuento automático por receta al cerrar venta de plato preparado en restaurante (sólo descuenta el producto vendido).
13. **No hay `cost_centers`** ni dimensión analítica en `journal_entry_lines`.
14. **No hay `budgets`** (presupuestos por sucursal/departamento/mes).
15. **Plan contable**: sólo `es_pgc`, `mx_sat`, `niif_generic`. Faltan **`cu_onat` y `br_sped`**.
16. **Multimoneda**: `exchange_rates` existe pero no se reevalúan balances; asientos no almacenan `(currency_origin, fx_rate, base_currency)` consistentemente en cada línea.
17. **Auditoría**: `activity_log` registra eventos puntuales, pero **no captura `old_value` / `new_value` ni IP / device** sistemáticamente.

**Medios:**
18. Duplicidad: `RRHH.tsx` y `RRHHEnterprise.tsx`; pestaña "Proveedores" eliminada de Compras pero quedan helpers sin uso.
19. Tablas con poco uso aparente: `ai_agents` aprovisionada por trigger pero pocos lugares la consumen; `decisions`, `digital_twin`, `risk_engine` — requieren auditoría de uso real.
20. `RRHH` flujo: `compute_payroll_full` usa fallback fijo (15% IRPF, 6.35% SS, 29.8% SS empresa) si no hay brackets — correcto para ES pero **inválido para CU/BR**.

---

## 2. Principios de rearquitectura

1. **Toda operación de negocio genera 5 movimientos** (cuando aplique):
   `operativo → financiero (tesorería) → contable (asiento) → analítico (KPI realtime) → auditoría (old/new)`.
2. **Una sola fuente de verdad por dominio**: stock = `product_stock` + `inventory_movements`; deuda = `account_payments` agregado; contabilidad = `journal_entries`.
3. **Idempotencia y trazabilidad**: todo flujo asíncrono usa `client_uuid` o `reference_(type,id)`.
4. **Multi-tenant + RLS estricto** vía `is_tenant_member()`; nada de `auth.uid()` en CHECKs.
5. **Multimoneda en origen**: cada movimiento guarda `(currency, amount, fx_rate, amount_base)`; conversión sólo para reporting.
6. **Vertical-aware**: enum `business_type` + matriz módulo×vertical centralizada (no strings dispersos en sidebar).

---

## 3. Roadmap por fases (cada fase = 1 PR aprobable)

### Fase 0 — Saneamiento (no rompe nada) 🔴
- Crear enum `business_type` (`bar`,`restaurant`,`empresa`) + migración de datos existentes; remplazar comparaciones por string.
- Añadir `suppliers` y tablas faltantes a tipos generados (vía migración trivial / `select`).
- Filtros `types` en sidebar para Almacenes / Transferencias / Tiendas / Operaciones.
- Eliminar `RRHHEnterprise.tsx` y código muerto verificado.
- Auditar `compute_payroll_full` y cualquier vista/función con `hours_worked` no calificado; calificar con alias.

### Fase 1 — Integridad de flujos críticos 🔴
- **Stock siempre se descuenta**: `process_sale_stock` recibe fallback `location_type='tenant'`, `location_id=tenant_id` cuando turno no tiene store; añadir `location_type='virtual'` para no romper FK.
- **Nómina genera CxP**: al cerrar nómina, `register_account_payment('employee', emp_id, net_pay, direction='out', reference=('payroll', payroll_id))` si `paid_at` es null deja pendiente; cuando se paga, registra el cobro.
- **Recetas descuentan ingredientes**: trigger `process_sale_recipe_consumption` por cada `sale_item` con receta activa (sólo restaurant/bar).
- **Dashboard realtime**: suscripción a `sales`, `purchases`, `account_payments`, `inventory_movements` filtradas por tenant.

### Fase 2 — Contabilidad empresarial 🟠
- **Centros de costo**: tabla `cost_centers` + columna `cost_center_id` en `journal_entry_lines` y `sales`/`purchases`.
- **Presupuestos**: `budgets` + `budget_lines` por cuenta/CC/mes; vista de ejecución vs real.
- **Estado de Resultados / Balance / Flujo de Caja** parametrizables por estructura (no hardcoded).
- **Reversión de asientos** ya existe; añadir **ajustes de cierre** + **asientos recurrentes**.
- **Plan `cu_onat`** (ONAT Cuba) y **`br_sped`** (SPED Brasil) en `import_chart_template`.
- **Diario / Mayor / Sumas y saldos** como reports SQL parametrizados (no recalcular en cliente).

### Fase 3 — Multimoneda real 🟠
- `exchange_rates(tenant_id, from_currency, to_currency, rate, valid_from)` con histórico.
- `account_payments` y `journal_entry_lines` guardan `(currency, amount, fx_rate)` siempre.
- Vista materializada `party_balance_by_currency` para CxC/CxP desglosados.
- Función `revalue_fx(date)` que genera asiento de diferencia de cambio.

### Fase 4 — Restaurantes / Bares profesional 🟠
- **Recetas compuestas** (semielaborados): `recipe_items` puede referenciar otra receta.
- **Variantes** (`product_variants` + modificadores con delta de costo/precio e impacto inventario).
- **Combos** con BOM propio (`combo_items` → productos o recetas).
- **Escandallo**: vista `recipe_costing` con costo alimento, costo bebida, margen, %.

### Fase 5 — Marketplace v2 🟡
- Forzar `auth.user` en checkout (sin guest checkout).
- Catálogo público con `stock_disponible` (= stock − reservas) y ETA.
- Geolocalización: `customer_addresses(lat,lng)` + función `nearest_store(lat,lng)`.
- Recomendaciones: SQL básico (productos co-comprados) + hook para Lovable AI.

### Fase 6 — Delivery tipo Uber 🟡
- `delivery_drivers` (documentos, licencia, vehículo, seguro, estado validación).
- `driver_status` enum + `driver_locations` (lat,lng,heading,speed,ts) con Realtime.
- Asignación automática por cercanía (función + edge function).
- Clasificación: vista `driver_tier` calculada por entregas/tiempo/rating/incidencias.
- Dashboard mapa con `mapbox-gl` o `leaflet`.

### Fase 7 — Auditoría y seguridad 🟠
- Trigger genérico `audit_trigger()` en tablas críticas (`sales`,`purchases`,`payroll_runs`,`accounting_*`,`products`,`customers`,`suppliers`,`employees`) que escribe en `audit_log(table, op, old, new, user, ip, ua, ts)`.
- IP/UA capturados desde edge function `audit-logs` (ya existe — extender).
- 2FA opcional vía Supabase MFA (no romper login actual).

### Fase 8 — Analytics realtime + QA 🟡
- Migrar Dashboard, Reportes, InventoryIntelligence a TanStack Query + canales Realtime.
- Suite Vitest mínima para funciones críticas (`process_sale_stock`, `register_account_payment`, `compute_payroll_full`).
- Playwright E2E: venta POS → asiento, compra → stock, nómina → CxP.

---

## 4. Informe QA final (entregable al cierre)

Al terminar cada fase produzco un `AUDIT_REPORT_FASE_N.md` con:
1. Problemas resueltos.
2. Tests pasados / fallidos.
3. Migraciones aplicadas.
4. RLS validada por tabla.
5. Riesgos residuales.
6. Pendiente para la siguiente fase.

---

## 5. Decisiones que necesito de ti antes de empezar

1. **¿Por qué fase empezamos?** Recomiendo **Fase 0 + Fase 1** juntas (saneamiento + integridad crítica) — es el bloque que cierra los bugs reales sin meter scope nuevo.
2. **País prioritario** para el plan contable nuevo: ¿Cuba (`cu_onat`) o Brasil (`br_sped`) primero?
3. **Delivery con mapas**: ¿Mapbox (requiere `MAPBOX_TOKEN`) o Leaflet+OSM (gratis, menos pulido)?
4. **Marketplace**: ¿forzamos cuenta obligatoria ya, o mantenemos guest checkout opcional durante migración?

Respóndeme esos 4 puntos y arranco con la fase elegida (una sola fase por iteración, con migración + código + verificación).
