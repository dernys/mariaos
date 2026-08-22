// Motor de sincronización offline → servidor y servidor → dispositivo.
//
// Garantías:
//  - Idempotencia: cada operación viaja con su identidad local (client_uuid) y el
//    backend devuelve la operación existente si ya fue sincronizada. Un doble
//    envío, un corte a mitad de sincronización o un reintento nunca duplican.
//  - Nunca se pierde una operación: un fallo la deja pendiente/errónea con motivo.
//  - Dependencias: las operaciones se envían en orden (cliente → venta → pago…)
//    y las referencias locales se traducen a identificadores reales.
import { supabase } from "@/integrations/supabase/client";
import { offlineDB, type PendingOp } from "./db";
import { dueOps, markOp, pruneSynced } from "./queue";

const MAX_ATTEMPTS = 10;
const BASE_DELAY_MS = 1500;

export interface SyncProgress {
  done: number;
  total: number;
  current?: string;
}

export interface SyncResult {
  synced: number;
  failed: number;
  conflicts: number;
  skipped: number;
}

function isNetworkError(msg: string) {
  return /Failed to fetch|NetworkError|network|timeout|ECONN|fetch/i.test(msg);
}

function isConflictError(msg: string) {
  return /stock|existencia|inventario|conflic|ya fue|no autorizado|cerrad|período|periodo|devolver|excede/i.test(msg);
}

function nextDelay(attempts: number) {
  if (attempts <= 0) return 0;
  return Math.min(BASE_DELAY_MS * Math.pow(2, attempts - 1), 30_000);
}

/** Traduce referencias locales (client_uuid) a ids reales ya sincronizados. */
function resolveRefs(payload: any, map: Map<string, string>): any {
  if (payload == null) return payload;
  if (typeof payload === "string") return map.get(payload) ?? payload;
  if (Array.isArray(payload)) return payload.map((v) => resolveRefs(v, map));
  if (typeof payload === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(payload)) out[k] = resolveRefs(v, map);
    return out;
  }
  return payload;
}

let running = false;

/** ¿Hay servidor accesible de verdad (no sólo navigator.onLine)? */
export async function probeServer(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  try {
    const { error } = await supabase.from("app_modules").select("slug").limit(1);
    return !error || !isNetworkError(error.message);
  } catch (e: any) {
    return !isNetworkError(String(e?.message || e));
  }
}

/** Envía la cola pendiente. Seguro ante llamadas concurrentes. */
export async function pushPending(
  tenantId?: string,
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, failed: 0, conflicts: 0, skipped: 0 };
  if (running) return result;
  running = true;
  try {
    const ops = await dueOps(tenantId);
    const map = new Map<string, string>();
    // ids ya conocidos de operaciones sincronizadas previamente
    const known = await offlineDB.pending_ops.where("status").equals("synced").toArray();
    for (const k of known) if (k.result_id) map.set(k.client_uuid, k.result_id);

    let done = 0;
    for (const op of ops) {
      onProgress?.({ done, total: ops.length, current: op.title });
      if (op.attempts >= MAX_ATTEMPTS) { result.skipped += 1; done += 1; continue; }
      const wait = nextDelay(op.attempts);
      if (wait) await new Promise((r) => setTimeout(r, wait));
      await markOp(op.client_uuid, { status: "syncing" });
      try {
        const payload = resolveRefs(op.payload, map);
        const { data, error } = await supabase.rpc("sync_offline_operation" as any, {
          p_type: op.type,
          p_client_uuid: op.client_uuid,
          p_tenant_id: op.tenant_id,
          p_payload: payload,
        });
        if (error) throw new Error(error.message);
        const id = (data as any)?.id ?? null;
        if (id) map.set(op.client_uuid, id);
        await markOp(op.client_uuid, {
          status: "synced",
          result_id: id,
          last_error: null,
          synced_at: Date.now(),
        });
        if (op.type === "customer" && id) {
          await offlineDB.customers.update(op.client_uuid, { pending: false }).catch(() => {});
        }
        result.synced += 1;
      } catch (e: any) {
        const msg = String(e?.message || e);
        if (isNetworkError(msg)) {
          // sigue pendiente: no consume intentos por falta de red
          await markOp(op.client_uuid, { status: "pending", last_error: "Sin conexión" });
          break;
        }
        const conflict = isConflictError(msg);
        await markOp(op.client_uuid, {
          status: conflict ? "conflict" : "failed",
          attempts: op.attempts + 1,
          last_error: msg,
        });
        if (conflict) result.conflicts += 1; else result.failed += 1;
      }
      done += 1;
      onProgress?.({ done, total: ops.length, current: op.title });
    }
    await pruneSynced();
    return result;
  } finally {
    running = false;
  }
}

export async function setMeta(key: string, value: any) {
  await offlineDB.meta.put({ key, value });
}

export async function getMeta<T = any>(key: string): Promise<T | undefined> {
  const row = await offlineDB.meta.get(key);
  return row?.value as T | undefined;
}

export type { PendingOp };
