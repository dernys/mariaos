import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";

export interface TaxRate {
  id: string;
  name: string;
  rate: number;
  is_default: boolean;
  is_active: boolean;
}

export function useTaxRates() {
  const tenantId = useTenant();
  const [taxes, setTaxes] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await supabase
      .from("tax_rates")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name");
    setTaxes((data as any) || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { reload(); }, [reload]);

  const defaultTax = taxes.find((t) => t.is_default) || null;

  return { taxes, defaultTax, loading, reload };
}
