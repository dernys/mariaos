import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";

export interface POSSettings {
  id?: string;
  tenant_id?: string;
  default_tax_rate_id: string | null;
  tax_included: boolean;
  tip_enabled: boolean;
  tip_percentages: number[];
  tip_required: boolean;
  rounding_mode: "none" | "nearest" | "up";
  allow_discounts: boolean;
  max_discount_pct: number;
  allow_negative_stock: boolean;
  auto_print_receipt: boolean;
  default_currency: string;
  secondary_currency: string | null;
  default_credit_days: number;
}

const DEFAULTS: POSSettings = {
  default_tax_rate_id: null,
  tax_included: false,
  tip_enabled: false,
  tip_percentages: [10, 15, 20],
  tip_required: false,
  rounding_mode: "none",
  allow_discounts: true,
  max_discount_pct: 100,
  allow_negative_stock: false,
  auto_print_receipt: false,
  default_currency: "CUP",
  secondary_currency: null,
  default_credit_days: 30,
};

export function usePOSSettings() {
  const tenantId = useTenant();
  const [settings, setSettings] = useState<POSSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await (supabase as any).from("pos_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
    if (data) setSettings({ ...DEFAULTS, ...data });
    else {
      // Auto-create defaults
      const { data: created } = await (supabase as any).from("pos_settings").insert({ tenant_id: tenantId }).select().maybeSingle();
      if (created) setSettings({ ...DEFAULTS, ...created });
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { reload(); }, [reload]);

  const save = async (patch: Partial<POSSettings>) => {
    if (!tenantId) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await (supabase as any).from("pos_settings").upsert({ tenant_id: tenantId, ...next }, { onConflict: "tenant_id" });
  };

  return { settings, loading, save, reload };
}
