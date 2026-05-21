# Auditoría ERP/POS GaIA OS — Estado actual y plan de cierre

## 1. Estado actual (resumen de auditoría)

### Módulos sólidos (✅ funcionales end-to-end)
- **POS adaptativo** (Bar / Restaurante / Empresa) con turnos obligatorios, multi-pago, multi-moneda, devoluciones, cancelaciones con motivo, propinas, cupones.
- **Inventario**: stock por ubicación (`product_stock`), `inventory_movements` con kardex, transferencias entre tiendas/almacenes, compras + consignación, conteos físicos, recetas con descuento automático, alertas de stock bajo (`notify_low_stock`).
- **Cuentas/Tesorería**: `account_payments` con triggers que actualizan saldos de clientes/empleados/proveedores y estado de ventas/compras; conciliación bancaria; SEPA XML; previsión de tesorería.
- **Contabilidad**: plan contable configurable (ES PGC / MX SAT / NIIF), periodos contables, asientos manuales con validación de partida doble, asientos automáticos (venta, compra, nómina, devolución).
- **RRHH**: expediente digital, contratos, documentos en bucket privado, fichaje con geo + foto, vacaciones, horas extra, nómina con tramos IRPF/SS, recibo PDF, SEPA, portal del empleado.
- **Marketplace + tienda online**, delivery con zonas/repartidores, fidelización con tiers, facturación con series y CUFE/XML.
- **Multitenant** con `is_tenant_member` + `is_superadmin` en todas las RLS, selector de contexto para superadmin.
- **Agentes IA / Command Center / Workflows / Digital Twin / Inventory Intelligence**.

### Brechas críticas detectadas (🔴)
1. **Offline-first NO existe realmente**. Hay un `sw.ts` y PWA instalable, pero:
   - No hay IndexedDB local para ventas/inventario.
   - No hay cola de sincronización ni resolución de conflictos.
   - Una venta sin red **se pierde** (el POS llama directo a `supabase.from(...).insert`).
   - Apagón a mitad de turno = pérdida de operaciones.
2. **Cierre de turno automático "1-click"** existe (`calculate_shift_summary`) pero **no genera asiento contable** ni PDF de arqueo, ni dispara cierre fiscal del día.
3. **Dashboard ejecutivo real**: hay `/analytics` y `/reportes`, pero faltan KPIs consolidados multi-tienda, comparativas, horarios pico, predicción de reposición conectada al motor `inventory-intelligence`.
4. **Códigos de barras / escáner**: no hay lectura por cámara ni atajo de teclado HID en POS.
5. **Ventas suspendidas / parking** (dejar venta en espera y retomar) no implementado en POS Empresa/Bar (solo restaurante vía mesas).
6. **Productos favoritos** por cajero/turno: no existe.
7. **Impresión de ticket** (`printReceipt.ts`) existe pero no se invoca al cerrar venta en todos los variants.
8. **Vencimientos / lotes**: hay `consignment_lots` pero no `product_lots` generales con FEFO ni alertas de caducidad.
9. **Ajustes/pérdidas/roturas**: el tipo de movimiento existe en `inventory_movements` pero no hay UI dedicada para registrarlos rápidamente.
10. **Reportes exportables**: `exportData.ts` exporta CSV; falta PDF de cierre Z, libro diario, libro mayor, balance de comprobación, estado de resultados.
11. **Auditoría**: existe `activity_log` pero no se escribe consistentemente desde todos los flujos (ej. cambios de precio, ediciones de productos).
12. **Concurrencia y rendimiento**: queries del POS no usan paginación virtual; con miles de productos el grid se degrada.
13. **CUP/USD/EUR**: hay multi-moneda pero **no hay tabla de tasas históricas** — los reportes históricos se distorsionan cuando cambia la tasa.

## 2. Plan priorizado (10 fases ejecutables)

```text
FASE A — Resiliencia ante apagón (CRÍTICA)
  A1 Cola offline con IndexedDB (Dexie) para ventas + pagos
  A2 Worker de sincronización con reintentos + backoff exponencial
  A3 Detector online/offline + banner persistente + contador de pendientes
  A4 Idempotencia server-side (client_uuid en sales/account_payments)
  A5 Snapshot local de productos/precios/stock para POS offline

FASE B — POS profesional completo
  B1 Escáner de códigos (cámara + HID) + búsqueda por SKU/EAN
  B2 Ventas suspendidas (parking) en Bar y Empresa
  B3 Favoritos por cajero (tabla user_pos_favorites)
  B4 Impresión automática ticket 58/80mm al cerrar venta
  B5 Atajos de teclado (F1 cobrar, F2 buscar, F3 cliente, etc.)

FASE C — Cierre Z automático profesional
  C1 RPC close_shift_z: arqueo + asiento contable + PDF + bloqueo
  C2 PDF cierre Z con desglose por método, cajero, IVA, devoluciones
  C3 Email automático al dueño con resumen del día
  C4 Comparativa vs día anterior y promedio 7d

FASE D — Inventario inteligente avanzado
  D1 Tabla product_lots con FEFO + alertas de caducidad
  D2 UI rápida de ajustes/mermas/roturas con foto y motivo
  D3 Reposición sugerida (consumo medio + lead time + stock seguridad)
  D4 ABC analysis automático mensual

FASE E — Dashboard ejecutivo
  E1 KPIs consolidados multi-tienda en /index
  E2 Horarios pico (heatmap por hora/día)
  E3 Top productos, top clientes, productos sin movimiento
  E4 Comparativa entre tiendas + drill-down

FASE F — Reportes contables exportables PDF
  F1 Libro diario PDF
  F2 Libro mayor por cuenta PDF
  F3 Balance de comprobación PDF
  F4 Estado de resultados + Balance general PDF

FASE G — Multi-moneda histórica
  G1 Tabla exchange_rates_history con vigencia por fecha
  G2 Recalculo de reportes usando tasa de la fecha de operación

FASE H — Auditoría universal
  H1 Trigger genérico audit_log en tablas críticas (products, prices, employees, sales)
  H2 Vista /auditoria con filtros y export

FASE I — Rendimiento
  I1 Virtualización del grid POS (>1000 productos)
  I2 Índices en (tenant_id, created_at) en sales/movements
  I3 React Query con staleTime + invalidación selectiva
  I4 Lazy import por ruta de páginas pesadas (Agents, DigitalTwin, etc.)

FASE J — Escalabilidad / API externa
  J1 Edge function pública /api/v1/* con API keys por tenant
  J2 Webhooks de eventos (sale.created, stock.low, shift.closed)
  J3 Rate limiting básico
```

## 3. Recomendación de ejecución

El alcance total equivale a **8-12 sesiones de trabajo**. Propongo arrancar **inmediatamente por Fase A (resiliencia offline)** porque es el mayor riesgo operativo en Cuba — un apagón hoy pierde ventas. Luego B (POS pro) y C (cierre Z automático) que son los que más tiempo ahorran al dueño cada día.

## 4. Detalles técnicos (Fase A — primera entrega)

- `bun add dexie` → wrapper en `src/lib/offline/db.ts` con stores: `pending_sales`, `pending_payments`, `product_snapshot`, `customer_snapshot`.
- Hook `useOfflineQueue` que intercepta inserts del POS: si `navigator.onLine === false` o el `insert` falla con red, encola; si online, intenta enviar y en éxito limpia.
- Migration: añadir `client_uuid uuid unique` a `sales`, `account_payments`, `sale_items` para idempotencia. RPC `sync_offline_sale(payload jsonb)` que hace upsert por `client_uuid`.
- Service Worker (`src/sw.ts`) ya en NetworkFirst; añadir registro de `BackgroundSync` (fallback a polling cada 30s si el navegador no lo soporta — Safari iOS).
- UI: badge persistente "📡 N operaciones pendientes" en `AppLayout`, con detalle clickeable.

## 5. Qué necesito confirmar antes de codificar

1. ¿Arranco por **Fase A (offline)** o prefieres otro orden?
2. ¿Apruebas añadir dependencia **Dexie** (~25 KB gz) para IndexedDB?
3. ¿Cierre Z (Fase C) debe **bloquear** edición posterior del turno o solo dejar registro?

Confirma y ejecuto Fase A completa en la siguiente respuesta.
