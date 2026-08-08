CREATE OR REPLACE FUNCTION public.ensure_default_accounts(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO accounting_accounts (tenant_id, code, name, type) VALUES
    (p_tenant_id, '1100', 'Caja', 'asset'),
    (p_tenant_id, '1110', 'Bancos', 'asset'),
    (p_tenant_id, '1200', 'Cuentas por Cobrar', 'asset'),
    (p_tenant_id, '1300', 'Inventario', 'asset'),
    (p_tenant_id, '2100', 'Cuentas por Pagar', 'liability'),
    (p_tenant_id, '2200', 'Impuestos por Pagar', 'liability'),
    (p_tenant_id, '4100', 'Ventas', 'income'),
    (p_tenant_id, '5100', 'Costo de Ventas', 'expense')
  ON CONFLICT DO NOTHING;
END; $function$;

UPDATE public.accounting_accounts SET type = 'income' WHERE type = 'revenue';