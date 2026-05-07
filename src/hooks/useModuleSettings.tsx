import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";

export function useModuleSettings<T extends Record<string, any>>(module: string, defaults: T) {
  const tenantId = useTenant();
  const [settings, setSettings] = useState<T>(defaults);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("module_settings")
      .select("settings")
      .eq("tenant_id", tenantId)
      .eq("module", module)
      .maybeSingle();
    if (data?.settings) setSettings({ ...defaults, ...(data.settings as T) });
    setLoading(false);
  }, [tenantId, module]);

  useEffect(() => { reload(); }, [reload]);

  const save = async (patch: Partial<T>) => {
    if (!tenantId) return;
    const next = { ...settings, ...patch };
    setSettings(next);
    await (supabase as any)
      .from("module_settings")
      .upsert({ tenant_id: tenantId, module, settings: next }, { onConflict: "tenant_id,module" });
  };

  return { settings, loading, save, reload };
}
