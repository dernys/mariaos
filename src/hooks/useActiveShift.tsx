import { useEffect, useState, useCallback, useRef, useId, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTenantContext } from "./useTenantContext";

export interface ActiveShift {
  id: string;
  user_id: string;
  store_id: string | null;
  store_name: string | null;
  opened_at: string;
  opening_cash: number;
}

const storageKey = (tenantId: string | null) => `pos_active_shift:${tenantId ?? "none"}`;

/**
 * Turnos abiertos del negocio (no solo del usuario).
 * El POS opera sobre el turno abierto seleccionado; si hay varias tiendas
 * con turno abierto, el cajero elige en qué turno/tienda vende.
 */
export function useActiveShift() {
  const { user } = useAuth();
  const { tenantId } = useTenantContext();
  const [openShifts, setOpenShifts] = useState<ActiveShift[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user || !tenantId) {
      setOpenShifts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("sales_shifts")
      .select("id, user_id, store_id, store_name, opened_at, opening_cash")
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .order("opened_at", { ascending: false });
    setOpenShifts(((data as ActiveShift[]) || []));
    setLoading(false);
  }, [user, tenantId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Restaurar selección persistida al cambiar de tenant
  useEffect(() => {
    setSelectedId(localStorage.getItem(storageKey(tenantId)));
  }, [tenantId]);

  const selectShift = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) localStorage.setItem(storageKey(tenantId), id);
    else localStorage.removeItem(storageKey(tenantId));
  }, [tenantId]);

  const shift = useMemo(() => {
    if (openShifts.length === 0) return null;
    const stored = selectedId ? openShifts.find((s) => s.id === selectedId) : undefined;
    if (stored) return stored;
    // Prioriza el turno propio del usuario; si no, el único/más reciente
    return openShifts.find((s) => s.user_id === user?.id) || openShifts[0];
  }, [openShifts, selectedId, user?.id]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const instanceId = useId();

  // Realtime: refresh cuando cambian los turnos del negocio
  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase
      .channel(`shifts-active-${tenantId}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales_shifts", filter: `tenant_id=eq.${tenantId}` },
        () => refreshRef.current()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, instanceId]);

  return { shift, openShifts, selectShift, loading, refresh };
}
