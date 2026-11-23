DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.tenants WHERE accounting_profile_code LIKE 'BR-%' LOOP
    PERFORM set_config('maria.provisioning_tenant', r.id::text, true);
    PERFORM public.bootstrap_tenant_accounting(r.id);
    PERFORM public.sync_accounting_mappings(r.id);
    UPDATE public.accounting_accounts a SET is_active = false
     WHERE a.tenant_id = r.id AND a.plan_template IS NULL
       AND a.code IN ('1100','1110','1200','1300','2100','2200','4100','5100')
       AND NOT EXISTS (SELECT 1 FROM public.journal_entry_lines l WHERE l.account_id = a.id)
       AND NOT EXISTS (SELECT 1 FROM public.accounting_mappings m WHERE m.account_id = a.id);
  END LOOP;
END $$;