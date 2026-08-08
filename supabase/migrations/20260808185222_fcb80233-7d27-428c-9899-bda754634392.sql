-- 1. Almacén ↔ Tiendas (N:M)
CREATE TABLE IF NOT EXISTS public.warehouse_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, store_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouse_stores TO authenticated;
GRANT ALL ON public.warehouse_stores TO service_role;
ALTER TABLE public.warehouse_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warehouse_stores tenant members" ON public.warehouse_stores
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_warehouse_stores_wh ON public.warehouse_stores(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stores_store ON public.warehouse_stores(store_id);
CREATE TRIGGER trg_warehouse_stores_updated BEFORE UPDATE ON public.warehouse_stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Transferencias: documento + transportación
ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS carrier_name text,
  ADD COLUMN IF NOT EXISTS carrier_driver text,
  ADD COLUMN IF NOT EXISTS carrier_phone text,
  ADD COLUMN IF NOT EXISTS carrier_vehicle text,
  ADD COLUMN IF NOT EXISTS carrier_plate text,
  ADD COLUMN IF NOT EXISTS tracking_code text,
  ADD COLUMN IF NOT EXISTS estimated_arrival timestamptz;

-- 3. Seguimiento (timeline) de transferencias
CREATE TABLE IF NOT EXISTS public.stock_transfer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  transfer_id uuid NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.stock_transfer_events TO authenticated;
GRANT ALL ON public.stock_transfer_events TO service_role;
ALTER TABLE public.stock_transfer_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transfer events tenant read" ON public.stock_transfer_events
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY "transfer events tenant insert" ON public.stock_transfer_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_transfer_events_transfer ON public.stock_transfer_events(transfer_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_stock_transfer_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.stock_transfer_events (tenant_id, transfer_id, status, note, performed_by)
    VALUES (NEW.tenant_id, NEW.id, NEW.status, NEW.notes, COALESCE(NEW.created_by, NEW.requested_by));
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.stock_transfer_events (tenant_id, transfer_id, status, note, performed_by)
    VALUES (NEW.tenant_id, NEW.id, NEW.status,
            CASE WHEN NEW.carrier_name IS NOT NULL THEN 'Transportista: ' || NEW.carrier_name ELSE NULL END,
            COALESCE(NEW.received_by, NEW.shipped_by, NEW.approved_by, NEW.requested_by));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_stock_transfer_status ON public.stock_transfers;
CREATE TRIGGER trg_stock_transfer_status
  AFTER INSERT OR UPDATE ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.log_stock_transfer_status();

-- 4. Movimientos de inventario: notas, edición e historial
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS edited_by uuid,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

CREATE TABLE IF NOT EXISTS public.inventory_movement_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  movement_id uuid NOT NULL REFERENCES public.inventory_movements(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.inventory_movement_history TO authenticated;
GRANT ALL ON public.inventory_movement_history TO service_role;
ALTER TABLE public.inventory_movement_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "movement history tenant read" ON public.inventory_movement_history
  FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE POLICY "movement history tenant insert" ON public.inventory_movement_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_tenant_member(tenant_id) OR public.is_superadmin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_movement_history_movement ON public.inventory_movement_history(movement_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_inventory_movement_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.reason IS DISTINCT FROM OLD.reason THEN
    INSERT INTO public.inventory_movement_history (tenant_id, movement_id, field, old_value, new_value, changed_by)
    VALUES (NEW.tenant_id, NEW.id, 'reason', OLD.reason, NEW.reason, auth.uid());
  END IF;
  IF NEW.notes IS DISTINCT FROM OLD.notes THEN
    INSERT INTO public.inventory_movement_history (tenant_id, movement_id, field, old_value, new_value, changed_by)
    VALUES (NEW.tenant_id, NEW.id, 'notes', OLD.notes, NEW.notes, auth.uid());
  END IF;
  IF NEW.reference_type IS DISTINCT FROM OLD.reference_type THEN
    INSERT INTO public.inventory_movement_history (tenant_id, movement_id, field, old_value, new_value, changed_by)
    VALUES (NEW.tenant_id, NEW.id, 'reference_type', OLD.reference_type, NEW.reference_type, auth.uid());
  END IF;
  NEW.edited_at := now();
  NEW.edited_by := COALESCE(auth.uid(), NEW.edited_by);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_inventory_movement_edit ON public.inventory_movements;
CREATE TRIGGER trg_inventory_movement_edit
  BEFORE UPDATE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.log_inventory_movement_edit();
