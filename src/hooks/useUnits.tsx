import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "./useTenant";

export interface UnitOfMeasure {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  decimals: number;
  factor: number;
  is_default: boolean;
  is_active: boolean;
}

/**
 * Catálogo configurable de unidades de medida del tenant.
 * Se usa en compras, transferencias, conteos y ficha de producto.
 */
export function useUnits(includeInactive = false) {
  const tenantId = useTenant();
  const [units, setUnits] = useState<UnitOfMeasure[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    let q = (supabase as any).from("units_of_measure").select("*").eq("tenant_id", tenantId);
    if (!includeInactive) q = q.eq("is_active", true);
    const { data } = await q.order("is_default", { ascending: false }).order("code");
    setUnits((data as UnitOfMeasure[]) || []);
    setLoading(false);
  }, [tenantId, includeInactive]);

  useEffect(() => { reload(); }, [reload]);

  const defaultUnit = units.find((u) => u.is_default) || units[0] || null;
  const unitByCode = (code?: string | null) => units.find((u) => u.code === code) || null;

  return { units, defaultUnit, unitByCode, loading, reload };
}
