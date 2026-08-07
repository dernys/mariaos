// Sprint D — Motor fiscal declarativo: las reglas viven en la base de datos
// (catálogo global por país + overrides del tenant), nunca en el código.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

export type FiscalRuleType =
  | "vat"
  | "sales_tax"
  | "withholding"
  | "turnover"
  | "income_tax"
  | "social_security";

export interface FiscalRule {
  code: string;
  name: string;
  rule_type: FiscalRuleType | string;
  rate: number;
  base: string;
  applies_to: string;
  is_default: boolean;
  source: "tenant" | "catalog" | string;
  config: Record<string, unknown> | null;
}

export const RULE_TYPE_LABELS: Record<string, string> = {
  vat: "IVA / Valor añadido",
  sales_tax: "Impuesto sobre ventas",
  withholding: "Retención",
  turnover: "Impuesto sobre ingresos",
  income_tax: "Impuesto sobre utilidades",
  social_security: "Seguridad social",
};

export const APPLIES_TO_LABELS: Record<string, string> = {
  sale: "Ventas",
  purchase: "Compras",
  service: "Servicios",
  payroll: "Nómina",
  any: "Todas",
};

/** Reglas fiscales vigentes del tenant (overrides + catálogo del país). */
export function useFiscalRules(appliesTo?: string) {
  const tenantId = useTenant();
  return useQuery({
    queryKey: ["fiscal-rules", tenantId, appliesTo ?? null],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<FiscalRule[]> => {
      const { data, error } = await supabase.rpc("resolve_fiscal_rules", {
        p_tenant: tenantId!,
        p_applies_to: appliesTo ?? undefined,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as FiscalRule[];
    },
  });
}

/** Desglose de impuestos y retenciones sobre una base imponible. */
export function useTaxBreakdown(base: number, appliesTo = "sale", codes?: string[]) {
  const tenantId = useTenant();
  return useQuery({
    queryKey: ["tax-breakdown", tenantId, base, appliesTo, codes ?? null],
    enabled: !!tenantId && Number.isFinite(base),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("compute_tax_breakdown", {
        p_tenant: tenantId!,
        p_base: base,
        p_applies_to: appliesTo,
        p_codes: codes ?? undefined,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as { code: string; name: string; rule_type: string; rate: number; amount: number }[];
    },
  });
}

/**
 * Moneda base del tenant. Sustituye los `"CUP"` codificados a mano:
 * si el tenant no tiene moneda base configurada cae a la primera activa.
 */
export function useBaseCurrency() {
  const tenantId = useTenant();
  const query = useQuery({
    queryKey: ["base-currency", tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("currencies")
        .select("code, symbol, is_base, is_active")
        .eq("tenant_id", tenantId!)
        .eq("is_active", true)
        .order("is_base", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const base = query.data?.find((c) => c.is_base) ?? query.data?.[0] ?? null;
  return {
    code: base?.code ?? "",
    symbol: base?.symbol ?? "$",
    currencies: query.data ?? [],
    loading: query.isLoading,
  };
}
