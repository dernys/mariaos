
ALTER VIEW public.v_trial_balance SET (security_invoker = on);
ALTER VIEW public.v_income_statement SET (security_invoker = on);
ALTER VIEW public.v_balance_sheet SET (security_invoker = on);
ALTER VIEW public.v_cash_flow SET (security_invoker = on);
ALTER VIEW public.v_ar_aging SET (security_invoker = on);
ALTER VIEW public.v_ap_aging SET (security_invoker = on);
