import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

type JournalEntry = {
  id: string;
  tenant_id: string;
  entry_number: string | null;
  date: string;
  description: string | null;
  status: string | null;
  created_at: string;
};

type FinancialEvent = {
  id: string;
  tenant_id: string;
  event_type: string;
  status: string;
  amount: number;
  currency: string;
  created_at: string;
};

/**
 * Bloque M — Suscripción Realtime al motor financiero por tenant.
 * Devuelve los últimos asientos contables y eventos en vivo.
 */
export function useRealtimeJournal(limit = 25) {
  const tenantId = useTenant();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [events, setEvents] = useState<FinancialEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      const [je, fe] = await Promise.all([
        supabase
          .from("journal_entries")
          .select("id, tenant_id, entry_number, date, description, status, created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(limit),
        supabase
          .from("financial_events")
          .select("id, tenant_id, event_type, status, amount, currency, created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(limit),
      ]);
      if (!active) return;
      setEntries((je.data as JournalEntry[]) ?? []);
      setEvents((fe.data as FinancialEvent[]) ?? []);
      setLoading(false);
    };

    load();

    const channel = supabase
      .channel(`fin-core-${tenantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "journal_entries", filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          setEntries((prev) => {
            const row = (payload.new ?? payload.old) as JournalEntry;
            if (payload.eventType === "DELETE") return prev.filter((e) => e.id !== row.id);
            const next = [row, ...prev.filter((e) => e.id !== row.id)];
            return next.slice(0, limit);
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "financial_events", filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          setEvents((prev) => {
            const row = (payload.new ?? payload.old) as FinancialEvent;
            if (payload.eventType === "DELETE") return prev.filter((e) => e.id !== row.id);
            const next = [row, ...prev.filter((e) => e.id !== row.id)];
            return next.slice(0, limit);
          });
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [tenantId, limit]);

  return { entries, events, loading };
}
