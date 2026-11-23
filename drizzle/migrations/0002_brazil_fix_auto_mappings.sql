UPDATE public.accounting_mappings m
   SET account_id = a.id, updated_at = now()
  FROM public.tenants t, public.accounting_accounts a
 WHERE t.id = m.tenant_id AND t.accounting_profile_code LIKE 'BR-%'
   AND a.tenant_id = t.id
   AND a.code = public.br_mapping_account_code(m.mapping_key, t.accounting_profile_code)
   AND a.is_postable AND COALESCE(a.is_active, true)
   AND m.account_id IS DISTINCT FROM a.id;