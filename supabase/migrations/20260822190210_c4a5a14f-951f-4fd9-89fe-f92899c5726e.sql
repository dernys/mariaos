CREATE OR REPLACE FUNCTION public.accounting_config_report(p_tenant uuid)
 RETURNS TABLE(mapping_key text, module text, operation text, status text, account_code text, account_name text, expected_type text, actual_type text, lines_count bigint, detail text, remediation text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_tenant_access(p_tenant);
  RETURN QUERY
  WITH cat AS (SELECT * FROM public.accounting_mapping_catalog()),
  m AS (SELECT * FROM public.accounting_mappings WHERE tenant_id = p_tenant AND COALESCE(is_active,true)),
  usage AS (
    SELECT jel.mapping_key AS mk, jel.account_id, COUNT(*) cnt
    FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id = jel.entry_id
    WHERE je.tenant_id = p_tenant GROUP BY 1,2),
  base AS (
    SELECT c.mapping_key, c.module, c.operation, c.account_type AS expected_type,
           m.account_id, a.code, a.name, a.type AS actual_type, a.is_active, a.is_postable,
           COALESCE((SELECT SUM(u.cnt) FROM usage u WHERE u.mk = c.mapping_key),0) AS lines_count,
           (SELECT COUNT(*) FROM m m2 WHERE m2.account_id = m.account_id AND m2.mapping_key <> c.mapping_key
              AND m2.mapping_key IN (SELECT c2.mapping_key FROM cat c2 WHERE c2.account_type <> c.account_type)) AS conflicts
    FROM cat c
    LEFT JOIN m ON m.mapping_key = c.mapping_key
    LEFT JOIN public.accounting_accounts a ON a.id = m.account_id AND a.tenant_id = p_tenant)
  SELECT b.mapping_key, b.module, b.operation,
    CASE
      WHEN b.account_id IS NULL THEN 'MISSING'
      WHEN b.code IS NULL OR COALESCE(b.is_active,true)=false OR COALESCE(b.is_postable,false)=false THEN 'INVALID'
      WHEN b.actual_type IS DISTINCT FROM b.expected_type THEN 'INVALID'
      WHEN b.conflicts > 0 THEN 'CONFLICTING'
      WHEN b.lines_count > 0 THEN 'USED'
      ELSE 'UNUSED'
    END AS status,
    b.code, b.name, b.expected_type, b.actual_type, b.lines_count,
    CASE
      WHEN b.account_id IS NULL THEN 'Operación sin cuenta configurada: se bloqueará al contabilizar.'
      WHEN b.code IS NULL OR COALESCE(b.is_active,true)=false OR COALESCE(b.is_postable,false)=false THEN 'La cuenta asignada no existe, está inactiva o no admite movimientos.'
      WHEN b.actual_type IS DISTINCT FROM b.expected_type THEN 'La cuenta es de tipo '||COALESCE(b.actual_type,'?')||' y la operación exige '||b.expected_type||'.'
      WHEN b.conflicts > 0 THEN 'La misma cuenta se usa en operaciones de naturaleza distinta.'
      WHEN b.lines_count > 0 THEN 'Configurada y en uso.'
      ELSE 'Configurada, aún sin movimientos.'
    END,
    CASE
      WHEN b.account_id IS NULL THEN 'Asigne una cuenta de tipo '||b.expected_type||' en el Maestro de Cuentas.'
      WHEN b.actual_type IS DISTINCT FROM b.expected_type THEN 'Reasigne a una cuenta de tipo '||b.expected_type||'.'
      WHEN b.conflicts > 0 THEN 'Separe las operaciones en cuentas distintas.'
      ELSE 'Sin acción requerida.'
    END
  FROM base b
  UNION ALL
  SELECT m.mapping_key, 'desconocido', '—', 'ORPHAN', a.code, a.name, '—', a.type, 0,
         'Clave configurada que ya no forma parte del catálogo de operaciones.',
         'Elimine o revise esta configuración.'
  FROM m LEFT JOIN public.accounting_accounts a ON a.id = m.account_id
  WHERE m.mapping_key NOT IN (SELECT c3.mapping_key FROM cat c3)
  ORDER BY 4, 1;
END $function$;