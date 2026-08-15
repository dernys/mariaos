import { useEffect, useState, useCallback, useRef, useId } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface ActiveShift {
  id: string;
  store_id: string | null;
  store_name: string | null;
  opened_at: string;
  opening_cash: number;
}

export function useActiveShift() {
  const { user } = useAuth();
  const [shift, setShift] = useState<ActiveShift | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setShift(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("sales_shifts")
      .select("id, store_id, store_name, opened_at, opening_cash")
      .eq("user_id", user.id)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setShift((data as ActiveShift) || null);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const instanceId = useId();

  // Realtime: refresh when this user's shifts change
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`shifts-active-${user.id}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sales_shifts", filter: `user_id=eq.${user.id}` },
        () => refreshRef.current()
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, instanceId]);

  return { shift, loading, refresh };
}
