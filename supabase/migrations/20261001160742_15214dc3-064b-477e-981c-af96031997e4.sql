DO $mig$
DECLARE d text;
BEGIN
  d := pg_get_functiondef((SELECT oid FROM pg_proc WHERE proname='pos_checkout' AND pronamespace='public'::regnamespace));
  d := replace(d,
    'IF v_stock IS NULL THEN SELECT COALESCE(p.stock,0) INTO v_stock FROM products p WHERE p.id = v_pid; END IF;
        IF COALESCE(v_stock,0) < v_qty THEN',
    'IF v_stock IS NULL THEN
          IF v_loc_type = ''store'' THEN v_stock := 0;
          ELSE SELECT COALESCE(p.stock,0) INTO v_stock FROM products p WHERE p.id = v_pid; END IF;
        END IF;
        IF COALESCE(v_stock,0) < v_qty AND NOT COALESCE((SELECT ps.allow_negative_stock FROM pos_settings ps WHERE ps.tenant_id = p_tenant_id LIMIT 1), false) THEN');
  IF position('v_stock := 0' in d) = 0 THEN RAISE EXCEPTION 'patch target not found'; END IF;
  EXECUTE d;
END $mig$;