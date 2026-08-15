# Auditoría MarIA OS — Informe y plan de corrección

## 1. Arquitectura encontrada

- React + Vite + TypeScript, backend Lovable Cloud (Postgres + RLS + RPC + edge functions).
- Contexto de tenant en `useTenantContext` (superadmin puede conmutar tenant activo; usuario normal toma su `tenant_users`).
- Dos patrones de listado convivientes:
  - `useServerTable` (paginación, búsqueda y filtros en base de datos) — usado solo en **Clientes, Facturas, Proveedores**.
  - `useTableState` (trae todo y filtra/pagina en memoria) — Almacenes, Compras, Contabilidad, Cuentas, Empleados, Inventario, Recetas, Transferencias, y 2 paneles de contabilidad.
  - Resto de páginas (~40): consultas con `.limit(50/100/200/500)` fijo, sin paginación ni total real.
- Componentes compartidos ya existentes y reutilizables: `TableToolbar`, `TablePagination`, `DataState`, `SearchableSelect`, `ExportButton`.

## 2. Tipos de tenant reales

`bar`, `restaurant`, `empresa` (columna `tenants.business_type`). No hay “cafetería” ni “retail” como tipo: el tenant llamado “Retail MarIA Demo” es `empresa`.

## 3. Estado de los datos (verificado con SQL)

| Tenant | Tipo | Productos | Categorías | Ventas | Devoluciones | Mesas |
|---|---|---|---|---|---|---|
| Bar El Trópico | bar | 32 | 10 | 24 | 0 | 7 |
| Restaurante La Mesa | restaurant | 34 | 12 | 20 | 0 | 24 |
| TechStore Cuba | empresa | 30 | 14 | 18 | 0 | 0 |
| Bar MarIA Demo | bar | 0 | 0 | 0 | 0 | 7 |
| Restaurante MarIA Demo | restaurant | 0 | 0 | 0 | 0 | 9 |
| Retail MarIA Demo | empresa | 0 | 0 | 0 | 0 | 0 |

Integridad referencial: **sin hallazgos negativos** — 0 ventas sin líneas, 0 líneas huérfanas, 0 filas sin `tenant_id`, 0 líneas de venta con producto de otro tenant, 0 clientes sin tenant.

Incoherencias reales encontradas:
- Los 3 tenants “MarIA Demo” tienen mesas y clientes pero **cero categorías, productos, inventario y ventas**: módulos vacíos que aparentan un sistema roto.
- La creación de un tenant (`trg_tenant_after_insert_bootstrap`) solo clona plan de cuentas, año fiscal y períodos. **No genera nada dependiente del tipo de negocio** (categorías, mesas si aplica, almacén/tienda por defecto, métodos de pago).

## 4. Devoluciones — causa raíz confirmada

- La UI llama `process_sale_return(p_sale_id, p_items, p_reason, p_refund_method, p_return_type)`; la función real en base de datos es `process_sale_return(p_return_id, p_location_type, p_location_id)` y **solo repone stock** de una devolución ya creada. Por eso **nunca se ha podido registrar una devolución** (0 filas en `sale_returns`).
- El historial lee columnas que no existen (`total_refunded`, `return_type`); las reales son `total`, `status`, `restock`, `performed_by`.
- No existe RPC que cree la devolución, valide cantidades ya devueltas, calcule importes ni asocie turno.
- El listado no tiene paginación, ni filtros, ni búsqueda, ni totales; la pestaña “Nueva” muestra solo las últimas 50 ventas filtradas en memoria por ticket.
- Sí existen las piezas contables: `post_sale_return_journal_entry`, `trg_post_sale_return_journal`, `notify_sale_return`, `trg_sale_return_to_event`.

## 5. Multi-tenancy

RLS activa y correcta en `sales`, `sale_items`, `sale_returns`, `sale_return_items`, `products` (scope por `tenant_users`) con excepciones de superadmin. Puntos a revisar: varias políticas están concedidas al rol `public` (incluye `anon`) en lugar de `authenticated`, y muchas consultas del frontend omiten `.eq("tenant_id", …)` confiando solo en RLS — funciona para usuarios normales, pero para superadmin (que ve todos los tenants) mezcla datos de varios tenants en los listados.

## 6. Plan de corrección por fases

**Fase A — Devoluciones (crítico)**
1. Migración: RPC `create_sale_return(p_sale_id, p_items, p_reason, p_refund_method, p_restock, p_location_type, p_location_id)` con `SECURITY DEFINER` que valide pertenencia al tenant, calcule `qty` devuelta acumulada por `sale_item_id`, rechace exceder lo vendido, genere `return_number`, inserte cabecera y líneas con precio real de la venta, registre `performed_by`, y llame a la reposición de stock existente. Vista/RPC auxiliar de cantidades devueltas por línea de venta.
2. Reescribir `Devoluciones.tsx`: usar el RPC correcto, mostrar por línea “vendido / ya devuelto / disponible a devolver”, y corregir el historial a las columnas reales.
3. Historial con `useServerTable`: paginación real, búsqueda por nº de devolución/ticket, filtros por rango de fechas, estado, método, cliente y usuario, ordenamiento persistente, total de devoluciones e importe devuelto.
4. Selector de venta en la pestaña “Nueva” con búsqueda server-side (ticket, cliente, fecha), no solo 50 filas.

**Fase B — Coherencia de datos por tipo de tenant**
1. Ampliar el bootstrap de tenant para crear datos iniciales según `business_type`: categorías propias del giro, tienda/almacén por defecto, métodos de pago, y mesas solo para `bar`/`restaurant`.
2. Completar los 3 tenants “MarIA Demo” con catálogo, inventario, clientes, ventas con líneas/pagos, turnos y al menos una devolución real por tenant, todo generado por cadena de IDs reales (sin IDs fijos) y coherente con el giro. Quitar las mesas del tenant `empresa`.

**Fase C — Paginación y filtros estándar**
1. Extender `useServerTable` con orden configurable desde la UI y rango de fechas reutilizable, manteniendo el contrato actual.
2. Migrar por prioridad de volumen: Ventas/turnos, Compras, Inventario y movimientos, Cuentas, Contabilidad (diario/mayor), Pedidos online, RRHH. Cada listado con búsqueda, filtros aplicables, orden estable, `DataState` para loading/vacío/error y `TablePagination`.

**Fase D — Aislamiento y KPIs**
1. Añadir scope explícito `tenant_id` a las consultas de listados y KPIs (imprescindible para el modo superadmin) y estrechar las políticas concedidas a `public` hacia `authenticated` donde no haya acceso anónimo previsto.
2. Verificar que cada KPI del Dashboard y Reportes derive de tablas reales del tenant activo y cuadre con los listados.

**Fase E — Validación**
1. Consultas de control post-cambio (huérfanos, cross-tenant, devoluciones > vendido, totales vs listados).
2. Pruebas de navegador de los flujos clave: crear devolución, paginar con filtros activos, cambiar de tenant.

## 7. Riesgos de migración

- No se eliminarán tablas ni columnas: solo se añaden funciones/índices y datos demo.
- Los datos demo nuevos se insertan solo en tenants con `is_demo` o en los tres tenants “MarIA Demo” vacíos; no se toca ningún dato transaccional existente.
- Estrechar políticas RLS puede afectar rutas públicas (marketplace); se revisará cada política antes de cambiarla y se hará en una fase aislada y verificable.

## 8. Orden de ejecución propuesto

Fase A → verificar → Fase B → verificar → Fase C (por bloques) → Fase D → Fase E.
