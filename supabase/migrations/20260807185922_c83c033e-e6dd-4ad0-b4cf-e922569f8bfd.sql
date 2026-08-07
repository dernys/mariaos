-- ============================================================
-- QW4 — Índices justificados en tablas calientes
-- Rollback: DROP INDEX de cada índice creado (sin pérdida de datos).
-- ============================================================

-- Detalle de venta / factura / devolución: siempre por sale_id.
CREATE INDEX IF NOT EXISTS sale_items_sale_id_idx ON public.sale_items (sale_id);
CREATE INDEX IF NOT EXISTS sale_payments_sale_id_idx ON public.sale_payments (sale_id);

-- Libro mayor y balances: líneas por asiento y por cuenta.
CREATE INDEX IF NOT EXISTS journal_entry_lines_entry_id_idx ON public.journal_entry_lines (entry_id);
CREATE INDEX IF NOT EXISTS journal_entry_lines_account_id_idx ON public.journal_entry_lines (account_id);

-- Reportes contables: asientos por empresa y período.
CREATE INDEX IF NOT EXISTS journal_entries_tenant_date_idx ON public.journal_entries (tenant_id, date);

-- Kardex y cálculo de stock.
CREATE INDEX IF NOT EXISTS inventory_movements_product_idx ON public.inventory_movements (product_id, created_at);
CREATE INDEX IF NOT EXISTS inventory_movements_warehouse_idx ON public.inventory_movements (warehouse_id);

-- Estado de cuenta del cliente y cierre de turno.
CREATE INDEX IF NOT EXISTS sales_customer_id_idx ON public.sales (customer_id);
CREATE INDEX IF NOT EXISTS sales_shift_id_idx ON public.sales (shift_id);

-- Cola de webhooks: es la consulta con más ejecuciones del sistema (>110k).
CREATE INDEX IF NOT EXISTS webhook_deliveries_pending_idx
  ON public.webhook_deliveries (next_attempt_at)
  WHERE status = 'pending';