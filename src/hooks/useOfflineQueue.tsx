import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { offlineDB, countPending, enqueueSale, type PendingSale } from "@/lib/offline/db";
import { toast } from "sonner";

const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 1500;

/**
 * Global offline queue hook.
 * - Detects online/offline state.
 * - Periodically flushes pending sales to Supabase via sync_offline_sale RPC.
 * - Exposes count of pending operations for UI banner.
 */
export function useOfflineQueue(tenantId?: string | null) {
  const [online, setOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const flushingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    try { setPending(await countPending(tenantId || undefined)); } catch { /* ignore */ }
  }, [tenantId]);

  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    if (!navigator.onLine) return;
    flushingRef.current = true;
    setSyncing(true);
    try {
      const items = await offlineDB.pending_sales
        .where("status").anyOf(["pending", "failed"])
        .toArray();
      for (const item of items) {
        if (item.attempts >= MAX_ATTEMPTS) continue;
        const wait = item.attempts === 0 ? 0 : BASE_DELAY_MS * Math.pow(2, item.attempts - 1);
        if (wait) await new Promise((r) => setTimeout(r, Math.min(wait, 30000)));
        await offlineDB.pending_sales.update(item.client_uuid, { status: "syncing" });
        const { data, error } = await supabase.rpc("sync_offline_sale" as any, { p_payload: item.payload });
        if (error) {
          await offlineDB.pending_sales.update(item.client_uuid, {
            status: "failed",
            attempts: item.attempts + 1,
            last_error: error.message,
          });
        } else {
          await offlineDB.pending_sales.update(item.client_uuid, { status: "synced" });
          // limpia los ya sincronizados después de 1 minuto
          setTimeout(() => offlineDB.pending_sales.delete(item.client_uuid), 60_000);
        }
      }
    } finally {
      flushingRef.current = false;
      setSyncing(false);
      await refreshCount();
    }
  }, [refreshCount]);

  useEffect(() => {
    const goOnline = () => { setOnline(true); toast.success("Conexión restablecida — sincronizando…"); void flush(); };
    const goOffline = () => { setOnline(false); toast.warning("Sin conexión — operando en modo offline"); };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [flush]);

  useEffect(() => {
    void refreshCount();
    const id = setInterval(() => { void refreshCount(); if (navigator.onLine) void flush(); }, 30_000);
    return () => clearInterval(id);
  }, [refreshCount, flush]);

  return { online, pending, syncing, flush, refreshCount, enqueueSale };
}

export type { PendingSale };
