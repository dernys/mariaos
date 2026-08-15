-- 1) Referencia local única para operaciones creadas offline
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS client_uuid uuid;
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS client_uuid uuid;
ALTER TABLE public.sales_shifts ADD COLUMN IF NOT EXISTS client_uuid uuid;
ALTER TABLE public.shift_cash_movements ADD COLUMN IF NOT EXISTS client_uuid uuid;
ALTER TABLE public.sale_returns ADD COLUMN IF NOT EXISTS client_uuid uuid;

CREATE UNIQUE INDEX IF NOT EXISTS customers_client_uuid_key ON public.customers(client_uuid) WHERE client_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_movements_client_uuid_key ON public.inventory_movements(client_uuid) WHERE client_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sales_shifts_client_uuid_key ON public.sales_shifts(client_uuid) WHERE client_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shift_cash_movements_client_uuid_key ON public.shift_cash_movements(client_uuid) WHERE client_uuid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sale_returns_client_uuid_key ON public.sale_returns(client_uuid) WHERE client_uuid IS NOT NULL;

-- 2) Sincronizador genérico de operaciones offline
CREATE OR REPLACE FUNCTION public.sync_offline_operation(
  p_type text,
  p_client_uuid uuid,
  p_tenant_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_existing uuid;
  v_key text;
  v_found boolean;
  v_shift uuid;
BEGIN
  IF p_client_uuid IS NULL THEN
    RAISE EXCEPTION 'client_uuid requerido';
  END IF;
  IF NOT (public.is_superadmin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid() AND tenant_id = p_tenant_id
  )) THEN
    RAISE EXCEPTION 'No autorizado en este negocio';
  END IF;

  v_key := 'offline:' || p_type || ':' || p_client_uuid::text;

  IF p_type = 'sale' THEN
    v_id := public.sync_offline_sale(p_payload || jsonb_build_object('client_uuid', p_client_uuid, 'tenant_id', p_tenant_id));
    RETURN jsonb_build_object('status', 'synced', 'id', v_id);

  ELSIF p_type = 'customer' THEN
    SELECT id INTO v_existing FROM public.customers WHERE client_uuid = p_client_uuid;
    IF v_existing IS NOT NULL THEN
      UPDATE public.customers SET
        name = COALESCE(p_payload->>'name', name),
        phone = COALESCE(p_payload->>'phone', phone),
        email = COALESCE(p_payload->>'email', email),
        address = COALESCE(p_payload->>'address', address),
        notes = COALESCE(p_payload->>'notes', notes),
        updated_at = now()
      WHERE id = v_existing;
      RETURN jsonb_build_object('status', 'synced', 'id', v_existing);
    END IF;
    INSERT INTO public.customers (tenant_id, client_uuid, name, phone, email, address, notes, credit_limit, created_at)
    VALUES (
      p_tenant_id, p_client_uuid,
      COALESCE(NULLIF(p_payload->>'name',''), 'Cliente offline'),
      NULLIF(p_payload->>'phone',''),
      NULLIF(p_payload->>'email',''),
      NULLIF(p_payload->>'address',''),
      NULLIF(p_payload->>'notes',''),
      COALESCE((p_payload->>'credit_limit')::numeric, 0),
      COALESCE((p_payload->>'created_at')::timestamptz, now())
    )
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('status', 'synced', 'id', v_id);

  ELSIF p_type = 'inventory_adjust' THEN
    SELECT id INTO v_existing FROM public.inventory_movements WHERE client_uuid = p_client_uuid;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'synced', 'id', v_existing);
    END IF;
    v_id := public.register_stock_adjustment(
      (p_payload->>'product_id')::uuid,
      COALESCE(p_payload->>'location_type', 'store'),
      NULLIF(p_payload->>'location_id','')::uuid,
      COALESCE((p_payload->>'quantity')::numeric, 0),
      COALESCE(p_payload->>'reason', 'Ajuste offline'),
      NULLIF(p_payload->>'photo_url',''),
      COALESCE(p_payload->>'kind', 'adjust')
    );
    UPDATE public.inventory_movements SET client_uuid = p_client_uuid WHERE id = v_id;
    RETURN jsonb_build_object('status', 'synced', 'id', v_id);

  ELSIF p_type = 'shift_open' THEN
    SELECT id INTO v_existing FROM public.sales_shifts WHERE client_uuid = p_client_uuid;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'synced', 'id', v_existing);
    END IF;
    v_id := public.open_shift(
      NULLIF(p_payload->>'store_id','')::uuid,
      NULLIF(p_payload->>'employee_id','')::uuid,
      COALESCE((p_payload->>'opening_cash')::numeric, 0),
      NULLIF(p_payload->>'pin',''),
      NULLIF(p_payload->>'notes','')
    );
    UPDATE public.sales_shifts SET client_uuid = p_client_uuid WHERE id = v_id;
    RETURN jsonb_build_object('status', 'synced', 'id', v_id);

  ELSIF p_type = 'shift_close' THEN
    v_shift := NULLIF(p_payload->>'shift_id','')::uuid;
    IF v_shift IS NULL THEN
      RAISE EXCEPTION 'shift_id requerido para cerrar turno';
    END IF;
    SELECT s.id INTO v_existing FROM public.sales_shifts s WHERE s.id = v_shift AND s.status = 'closed';
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'synced', 'id', v_existing);
    END IF;
    PERFORM public.close_shift_with_summary(
      v_shift,
      COALESCE((p_payload->>'declared_cash')::numeric, 0),
      NULLIF(p_payload->>'notes','')
    );
    RETURN jsonb_build_object('status', 'synced', 'id', v_shift);

  ELSIF p_type = 'cash_movement' THEN
    SELECT id INTO v_existing FROM public.shift_cash_movements WHERE client_uuid = p_client_uuid;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'synced', 'id', v_existing);
    END IF;
    v_id := public.register_shift_cash_movement(
      (p_payload->>'shift_id')::uuid,
      COALESCE(p_payload->>'movement_type', 'in'),
      COALESCE((p_payload->>'amount')::numeric, 0),
      COALESCE(p_payload->>'category', 'other'),
      NULLIF(p_payload->>'reason',''),
      COALESCE(p_payload->>'currency', 'CUP'),
      COALESCE((p_payload->>'exchange_rate')::numeric, 1)
    );
    UPDATE public.shift_cash_movements SET client_uuid = p_client_uuid WHERE id = v_id;
    RETURN jsonb_build_object('status', 'synced', 'id', v_id);

  ELSIF p_type = 'sale_return' THEN
    SELECT id INTO v_existing FROM public.sale_returns WHERE client_uuid = p_client_uuid;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'synced', 'id', v_existing);
    END IF;
    v_id := public.create_sale_return(
      (p_payload->>'sale_id')::uuid,
      COALESCE(p_payload->'items', '[]'::jsonb),
      NULLIF(p_payload->>'reason',''),
      COALESCE(p_payload->>'refund_method', 'cash'),
      COALESCE((p_payload->>'restock')::boolean, true),
      NULLIF(p_payload->>'location_type',''),
      NULLIF(p_payload->>'location_id','')::uuid
    );
    UPDATE public.sale_returns SET client_uuid = p_client_uuid WHERE id = v_id;
    RETURN jsonb_build_object('status', 'synced', 'id', v_id);
  END IF;

  RAISE EXCEPTION 'Tipo de operación offline no soportado: %', p_type;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_offline_operation(text, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_offline_operation(text, uuid, uuid, jsonb) TO authenticated;