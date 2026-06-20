
-- 1) Borrar demos con bucle iterativo
DO $$
DECLARE
  v_demo_ids uuid[]; r record; v_remaining bigint; v_iter int := 0;
BEGIN
  SELECT array_agg(id) INTO v_demo_ids FROM public.tenants WHERE slug LIKE 'demo-%';
  IF v_demo_ids IS NULL THEN RETURN; END IF;

  LOOP
    v_iter := v_iter + 1;
    FOR r IN
      SELECT n.nspname AS sch, c.relname AS tbl
        FROM pg_attribute a
        JOIN pg_class c ON c.oid=a.attrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE a.attname='tenant_id' AND a.attnum>0 AND NOT a.attisdropped
         AND c.relkind='r' AND n.nspname='public' AND c.relname<>'tenants'
    LOOP
      EXECUTE format('DELETE FROM %I.%I WHERE tenant_id = ANY($1)', r.sch, r.tbl) USING v_demo_ids;
    END LOOP;

    v_remaining := 0;
    FOR r IN
      SELECT n.nspname AS sch, c.relname AS tbl
        FROM pg_attribute a
        JOIN pg_class c ON c.oid=a.attrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE a.attname='tenant_id' AND a.attnum>0 AND NOT a.attisdropped
         AND c.relkind='r' AND n.nspname='public' AND c.relname<>'tenants'
    LOOP
      DECLARE v_cnt bigint;
      BEGIN
        EXECUTE format('SELECT count(*) FROM %I.%I WHERE tenant_id = ANY($1)', r.sch, r.tbl)
          INTO v_cnt USING v_demo_ids;
        v_remaining := v_remaining + v_cnt;
      END;
    END LOOP;

    EXIT WHEN v_remaining = 0 OR v_iter > 15;
  END LOOP;

  DELETE FROM public.tenant_users WHERE tenant_id = ANY(v_demo_ids);
  DELETE FROM public.tenants WHERE id = ANY(v_demo_ids);
  DELETE FROM public.activity_log WHERE tenant_id = ANY(v_demo_ids);
END $$;

-- 2) Asignar perfil regional
UPDATE public.tenants
   SET accounting_profile_code='CU-MIPYME'
 WHERE accounting_profile_code IS NULL AND country_code='CU';

-- 3) Bootstrap a todos los tenants con perfil
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.tenants WHERE accounting_profile_code IS NOT NULL LOOP
    PERFORM public.bootstrap_tenant_accounting(r.id);
  END LOOP;
END $$;

-- 4) Eliminar asientos descuadrados (se reprocesarán cuando se corrijan los datos de origen)
DELETE FROM public.journal_entry_lines
 WHERE entry_id IN (
   SELECT entry_id FROM public.journal_entry_lines
    GROUP BY entry_id HAVING abs(sum(debit)-sum(credit))>0.01
 );
DELETE FROM public.journal_entries
 WHERE id NOT IN (SELECT DISTINCT entry_id FROM public.journal_entry_lines);
