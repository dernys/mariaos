import { useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { migrateLegacyQueue, OP_LABELS, type PendingOp } from "@/lib/offline/db";
import { enqueueOperation, listOps, queueStats, retryAllFailed, retryOp, type QueueStats } from "@/lib/offline/queue";
import { pushPending, probeServer, getMeta } from "@/lib/offline/sync";
import { prefetchWorkingSet } from "@/lib/offline/snapshot";
import { enqueueSale } from "@/lib/offline/db";

const SYNC_INTERVAL_MS = 20_000;
const PREFETCH_INTERVAL_MS = 5 * 60 * 1000;

const EMPTY: QueueStats = { pending: 0, syncing: 0, synced: 0, failed: 0, conflict: 0, total: 0 };

/**
 * Núcleo offline de la aplicación.
 * - Detecta conexión real (no sólo navigator.onLine).
 * - Sincroniza la cola persistente de operaciones en orden de dependencia.
 * - Precarga el conjunto de trabajo del negocio para operar sin red.
 */
export function useOfflineQueue(tenantId?: string | null) {
  const [online, setOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);
  const [stats, setStats] = useState<QueueStats>(EMPTY);
  const [ops, setOps] = useState<PendingOp[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const busy = useRef(false);
  const lastPrefetch = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([queueStats(tenantId || undefined), listOps(tenantId || undefined)]);
      setStats(s);
      setOps(o);
      if (tenantId) {
        setLastSync((await getMeta<number>(`${tenantId}:last_prefetch`)) ?? null);
        setReady(Boolean(await getMeta<boolean>(`${tenantId}:ready`)));
      }
    } catch { /* ignore */ }
  }, [tenantId]);

  const flush = useCallback(async (opts?: { silent?: boolean }) => {
    if (busy.current) return;
    if (!(await probeServer())) { setOnline(false); return; }
    setOnline(true);
    busy.current = true;
    setSyncing(true);
    try {
      const res = await pushPending(tenantId || undefined);
      if (!opts?.silent && res.synced > 0) toast.success(`${res.synced} operación(es) sincronizada(s)`);
      if (res.conflicts > 0) toast.warning(`${res.conflicts} operación(es) requieren tu revisión`);
    } finally {
      busy.current = false;
      setSyncing(false);
      await refresh();
    }
  }, [tenantId, refresh]);

  const prefetch = useCallback(async (force = false) => {
    if (!tenantId) return;
    if (!force && Date.now() - lastPrefetch.current < PREFETCH_INTERVAL_MS) return;
    lastPrefetch.current = Date.now();
    try { await prefetchWorkingSet(tenantId); await refresh(); } catch { /* ignore */ }
  }, [tenantId, refresh]);

  // migración de la cola antigua + primer arranque
  useEffect(() => {
    void (async () => { await migrateLegacyQueue(); await refresh(); })();
  }, [refresh]);

  useEffect(() => {
    if (!tenantId) return;
    void prefetch(true);
    void flush({ silent: true });
  }, [tenantId, prefetch, flush]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      toast.success("Conexión restablecida — sincronizando…");
      void flush();
      void prefetch(true);
    };
    const goOffline = () => { setOnline(false); toast.warning("Sin conexión — puedes seguir vendiendo"); };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [flush, prefetch]);

  useEffect(() => {
    const id = setInterval(() => {
      void refresh();
      if (navigator.onLine) { void flush({ silent: true }); void prefetch(); }
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh, flush, prefetch]);

  return {
    online,
    stats,
    ops,
    pending: stats.pending + stats.failed + stats.conflict,
    syncing,
    lastSync,
    ready,
    flush,
    prefetch,
    refresh,
    refreshCount: refresh,
    retryOp: async (id: string) => { await retryOp(id); await refresh(); void flush(); },
    retryAll: async () => { await retryAllFailed(tenantId || undefined); await refresh(); void flush(); },
    enqueueOperation,
    enqueueSale,
    labels: OP_LABELS,
  };
}

export type { PendingOp };
