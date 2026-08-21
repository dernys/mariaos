DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE proname = 'pos_checkout';

  d := replace(d,
    'IF v_qty <= 0 THEN RAISE EXCEPTION ''Cantidad inválida en la línea''; END IF;',
    'IF v_qty <= 0 OR v_qty > 1000000 THEN RAISE EXCEPTION ''Cantidad inválida en la línea''; END IF;');

  d := replace(d,
    '        IF v_stock IS NOT NULL AND v_stock < v_qty THEN',
    '        IF v_stock IS NULL THEN SELECT COALESCE(p.stock,0) INTO v_stock FROM products p WHERE p.id = v_pid; END IF;
        IF COALESCE(v_stock,0) < v_qty THEN');

  d := replace(d,
    '    v_line := round(v_price * v_qty, 2);',
    '    v_line := round(v_price * v_qty, 2);
    IF v_line >= 1e12 THEN RAISE EXCEPTION ''Importe de línea fuera de rango''; END IF;');

  d := replace(d,
    '    IF v_amount <= 0 THEN CONTINUE; END IF;',
    '    IF v_amount <= 0 THEN CONTINUE; END IF;
    IF v_amount >= 1e12 THEN RAISE EXCEPTION ''Importe de pago fuera de rango''; END IF;');

  EXECUTE d;
END $do$;