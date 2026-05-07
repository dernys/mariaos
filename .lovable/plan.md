## Objetivo
1. Convertir el "historial" de Clientes, Ventas, Empleados y Proveedores en **vistas dedicadas a página completa** (no diálogos), con todos los datos relacionados.
2. Implementar **gestión completa de deudas por pagar a proveedores** (cuentas por pagar).
3. Implementar **consignación de productos**: rastrear lotes recibidos de proveedores cuyo pago se difiere hasta que el producto se venda, con liquidación automática.

---

## 1. Vistas de detalle dedicadas

Crear 4 nuevas rutas con layout consistente (header con datos clave, tabs por sección, timeline de actividad, KPIs):

| Ruta | Página | Tabs incluidos |
|---|---|---|
| `/clientes/:id` | `ClienteDetalle.tsx` | Resumen · Compras · Pagos · Fidelización · Actividad |
| `/empleados/:id` | `EmpleadoDetalle.tsx` | Resumen · Turnos · Asistencia · Nómina · Adelantos · Actividad |
| `/proveedores/:id` | `ProveedorDetalle.tsx` | Resumen · Compras · Pagos · **Consignaciones** · Actividad |
| `/ventas/:id` | `VentaDetalle.tsx` | Items · Pagos · Devoluciones · Factura · Actividad |

Cambios en páginas existentes (`Clientes.tsx`, `Empleados.tsx`, `Cuentas.tsx`/lista de ventas, `Compras.tsx` para proveedores): el botón "Historial" ahora navega a la ruta de detalle en lugar de abrir Dialog. Los Dialogs de detalle existentes se eliminan.

Componente compartido nuevo: `src/components/detail/DetailHeader.tsx` (avatar/icon, nombre, badges de estado, KPIs y acciones).

---

## 2. Cuentas por pagar a proveedores

Ya existe `suppliers.balance` y `account_payments` con `party_type='supplier'`. Se añade una **vista consolidada** dentro de `/proveedores/:id` (tab Pagos) y un **panel global** en `/cuentas` (sección "Por pagar"):

- Lista de compras con `total > amount_paid` (deuda).
- Antigüedad de saldo (0-30, 30-60, 60-90, +90 días).
- Botón rápido **"Registrar pago"** que invoca `register_account_payment(...)` con `direction='out'`.
- Total adeudado por proveedor + total global.
- Alerta de notificación cuando una compra pasa los 30 días sin pago completo.

---

## 3. Consignación de productos (pago al vender)

### Modelo de datos (migración nueva)

**Tabla `consignment_lots`** — lote recibido en consignación:
- `supplier_id`, `product_id`, `tenant_id`
- `received_at`, `quantity_received`, `quantity_sold`, `quantity_returned`, `quantity_remaining` (generada)
- `unit_cost` (precio acordado a pagar al proveedor por unidad vendida)
- `location_type`, `location_id`
- `status`: `active` | `settled` | `closed`
- `notes`, `expires_at`

**Tabla `consignment_settlements`** — liquidaciones (pagos al proveedor por las unidades vendidas):
- `lot_id`, `supplier_id`, `tenant_id`
- `quantity`, `unit_cost`, `total`
- `payment_id` (FK a `account_payments`, opcional)
- `settled_at`, `performed_by`

**Extensión a `purchases`**: añadir columna `is_consignment boolean default false`. Al marcarla, `receive_purchase` crea `consignment_lots` en lugar de generar deuda inmediata.

**Trigger sobre `sale_items`** (después de venta `paid`): asigna FIFO el `qty` vendido a lotes activos del producto, incrementa `quantity_sold` y crea `consignment_settlements` pendientes con el `unit_cost` del lote.

**RPC `settle_consignment(lot_ids[], method, currency)`**: agrupa settlements pendientes y registra un `account_payment` outbound al proveedor.

RLS: políticas por `tenant_id` igual que el resto.

### UI

- Nueva página `/consignaciones` (`Consignacion.tsx`): lista de lotes activos, filtros por proveedor/producto, KPIs (unidades en consignación, valor pendiente de liquidar, vendido sin liquidar).
- En `Compras.tsx` (form de compra): checkbox "Compra en consignación".
- En `ProveedorDetalle.tsx` tab Consignaciones: lotes y botón "Liquidar seleccionados".
- Sidebar: nueva entrada "Consignaciones" bajo Inventario.

---

## Archivos a crear
- `src/pages/ClienteDetalle.tsx`
- `src/pages/EmpleadoDetalle.tsx`
- `src/pages/ProveedorDetalle.tsx`
- `src/pages/VentaDetalle.tsx`
- `src/pages/Consignacion.tsx`
- `src/components/detail/DetailHeader.tsx`
- `src/components/detail/PayablesPanel.tsx`
- `src/components/consignment/ConsignmentLotsTable.tsx`
- `src/components/consignment/SettleDialog.tsx`
- `supabase/migrations/<timestamp>_consignment.sql`

## Archivos a editar
- `src/App.tsx` (rutas nuevas)
- `src/components/AppSidebar.tsx` (entrada Consignaciones)
- `src/components/CommandPalette.tsx`
- `src/pages/Clientes.tsx` (link al detalle, quitar dialog)
- `src/pages/Empleados.tsx` (link al detalle, quitar dialog)
- `src/pages/Compras.tsx` (link a proveedor, checkbox consignación)
- `src/pages/Cuentas.tsx` (panel cuentas por pagar)

---

## Notas técnicas
- FIFO de consignación: orden por `received_at ASC`, `id ASC`.
- `quantity_remaining` como columna generada `quantity_received - quantity_sold - quantity_returned`.
- Las páginas detalle leen `id` con `useParams` y usan los mismos hooks de datos ya existentes.
- Mantener semántica de tokens (sin colores hardcoded).

¿Procedo con la implementación completa?