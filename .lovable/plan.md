## Objetivo

Unificar cobros y pagos en toda la app con soporte multi-moneda y múltiples métodos, y centralizar los ajustes operativos (POS, impuestos, propinas, etc.) en Configuración, vinculándolos a cada módulo.

---

## 1. Configuración centralizada

### Nueva pestaña "POS y Operaciones" en `/configuracion`
Componente: `src/components/config/ConfigPOS.tsx`

Ajustes (tabla nueva `pos_settings` por tenant):
- **Impuesto por defecto** (selector de `tax_rates`)
- **Impuesto incluido en precio** (sí/no)
- **Propina**: habilitada, porcentaje sugerido (10/15/20), obligatoria
- **Redondeo** (none / nearest / up)
- **Permitir descuentos** (% máximo por rol)
- **Permitir venta sin stock**
- **Imprimir ticket automático**
- **Moneda base de cobro POS** (selector de `currencies`)
- **Mostrar precios en moneda secundaria** (selector adicional)
- **Días de crédito por defecto** (clientes/empleados)

### Nueva pestaña "Operaciones por módulo"
- **Inventario**: alerta stock bajo (umbral global), método de costeo (FIFO/promedio)
- **Compras**: requerir aprobación, días pago proveedor por defecto
- **Facturación**: serie por defecto, prefijo, IVA por defecto
- **Turnos**: requerir conteo de apertura, requerir motivo en diferencias

Tabla `module_settings` con `(tenant_id, module, settings jsonb)`.

---

## 2. Pagos multi-moneda y multi-método universales

### Nuevo componente reusable
`src/components/payments/MultiPaymentDialog.tsx`

Acepta props: `partyType` (customer/employee/supplier), `partyId`, `referenceType` (sale/purchase/invoice/null), `referenceId`, `amountDue`, `currencyDefault`, `onPaid`.

Características:
- **Lista dinámica de métodos** desde `payment_methods` (tabla)
- **Lista de monedas** desde `currencies` con tasa de cambio editable
- **Pagos divididos**: agregar varias líneas (método + moneda + monto)
- **Total convertido a moneda base** mostrado en tiempo real
- **Validación**: total ≥ monto requerido (o permitir parcial)
- Llama RPC `register_account_payment` por cada línea

### Sustituye dialogs ad-hoc en:
- `src/pages/Compras.tsx` → reemplaza el dialog "Pagar compra"
- `src/pages/Cuentas.tsx` → reemplaza dialogs de pago a clientes/proveedores/empleados
- `src/components/pos/PaymentDialog.tsx` → reusa la lógica de líneas multi-método
- `src/pages/Facturas.tsx` → permitir cobrar factura
- `src/pages/Consignacion.tsx` → liquidación con multi-método

---

## 3. Vinculación módulo por módulo

### POS (`POSBar`, `POSRestaurant`, `POSEmpresa`, `PaymentDialog`)
- Lee `pos_settings`: aplica impuesto configurado, sugiere propina, respeta redondeo
- Bloquea ventas sin stock si está configurado
- Auto-imprime ticket si configurado
- Cobro permite N líneas en N monedas/métodos

### Inventario / Almacenes
- Usa `module_settings.inventory.low_stock_threshold` para alertas
- `notify_low_stock` ya respeta `min_stock` por producto; añadir fallback global

### Compras
- Estado por defecto desde settings
- Pago al recibir usando `MultiPaymentDialog`

### Cuentas (CxC/CxP)
- Pago en cualquier moneda con conversión automática
- Selector de método dinámico

### Facturas
- Serie + prefijo desde `module_settings.invoicing`
- Botón "Registrar pago" usando `MultiPaymentDialog`

### Turnos
- Apertura/cierre respetan `require_opening_count` y `require_difference_reason`

---

## 4. Migración SQL

```sql
-- pos_settings
CREATE TABLE pos_settings (
  id uuid PK, tenant_id uuid UNIQUE,
  default_tax_rate_id uuid, tax_included boolean,
  tip_enabled boolean, tip_percentages numeric[], tip_required boolean,
  rounding_mode text, allow_discounts boolean, max_discount_pct numeric,
  allow_negative_stock boolean, auto_print_receipt boolean,
  default_currency text, secondary_currency text,
  default_credit_days int
);

-- module_settings
CREATE TABLE module_settings (
  id uuid PK, tenant_id uuid, module text,
  settings jsonb DEFAULT '{}',
  UNIQUE(tenant_id, module)
);

-- RLS por tenant en ambas
-- Seed defaults vía función ensure_pos_settings(tenant_id)
```

---

## 5. Archivos a crear/editar

**Crear:**
- `supabase/migrations/<ts>_pos_module_settings.sql`
- `src/components/config/ConfigPOS.tsx`
- `src/components/config/ConfigModules.tsx`
- `src/components/payments/MultiPaymentDialog.tsx`
- `src/hooks/usePOSSettings.tsx`
- `src/hooks/useModuleSettings.tsx`

**Editar:**
- `src/pages/Configuracion.tsx` (añadir 2 tabs)
- `src/components/pos/PaymentDialog.tsx` (usar settings + multi-líneas)
- `src/components/pos/POSBar.tsx`, `POSRestaurant.tsx`, `POSEmpresa.tsx` (impuesto, propina, validaciones)
- `src/pages/Compras.tsx`, `Cuentas.tsx`, `Facturas.tsx`, `Consignacion.tsx` (usar `MultiPaymentDialog`)
- `src/pages/Turnos.tsx`, `TurnoDetalle.tsx` (validaciones de settings)

---

## Notas técnicas
- `register_account_payment` ya soporta `currency` y `exchange_rate` → la lógica multi-moneda se apoya en él.
- Los asientos contables se generan automáticamente vía triggers existentes.
- No se borran datos existentes; las settings tienen defaults seguros.
