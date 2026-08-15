// Cola persistente de operaciones offline.
// Toda operación de negocio creada sin conexión (o que falle por red) pasa por
// aquí: se guarda con identidad propia, estado y motivo de error, y nunca se
// elimina por un fallo de sincronización.
import { offlineDB, OP_LABELS, OP_ORDER, type OpStatus, type OpType, type PendingOp } from "./db";
import { getDeviceId } from "./device";

export interface EnqueueInput {
  client_uuid?: string;
  tenant_id: string;
  type: OpType;
  payload: any;
  title?: string;
  amount?: number | null;
  user_id?: string | null;
  depends_on?: string[];
}

export function newClientUuid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function enqueueOperation(input: EnqueueInput): Promise<PendingOp> {
  const op: PendingOp = {
    client_uuid: input.client_uuid ?? newClientUuid(),
    tenant_id: input.tenant_id,
    type: input.type,
    payload: input.payload,
    title: input.title ?? OP_LABELS[input.type],
    amount: input.amount ?? null,
    created_at: Date.now(),
    device_id: getDeviceId(),
    user_id: input.user_id ?? null,
    attempts: 0,
    last_error: null,
    status: "pending",
    depends_on: input.depends_on ?? [],
    result_id: null,
  };
  await offlineDB.pending_ops.put(op);
  return op;
}

export async function listOps(tenantId?: string, statuses?: OpStatus[]): Promise<PendingOp[]> {
  let rows = tenantId
    ? await offlineDB.pending_ops.where({ tenant_id: tenantId }).toArray()
    : await offlineDB.pending_ops.toArray();
  if (statuses?.length) rows = rows.filter((r) => statuses.includes(r.status));
  return rows.sort((a, b) => b.created_at - a.created_at);
}

export interface QueueStats {
  pending: number;
  syncing: number;
  synced: number;
  failed: number;
  conflict: number;
  total: number;
}

export async function queueStats(tenantId?: string): Promise<QueueStats> {
  const rows = tenantId
    ? await offlineDB.pending_ops.where({ tenant_id: tenantId }).toArray()
    : await offlineDB.pending_ops.toArray();
  const stat: QueueStats = { pending: 0, syncing: 0, synced: 0, failed: 0, conflict: 0, total: rows.length };
  for (const r of rows) stat[r.status] += 1;
  return stat;
}

/** Devuelve las operaciones listas para sincronizar, en orden de dependencia. */
export async function dueOps(tenantId?: string): Promise<PendingOp[]> {
  const rows = await listOps(tenantId, ["pending", "failed", "syncing"]);
  const byId = new Map(rows.map((r) => [r.client_uuid, r]));
  const ready = rows.filter((r) => {
    const deps = r.depends_on ?? [];
    // sólo se puede enviar si sus dependencias ya no están en la cola pendiente
    return deps.every((d) => {
      const dep = byId.get(d);
      return !dep || dep.status === "synced";
    });
  });
  return ready.sort((a, b) => {
    const oa = OP_ORDER.indexOf(a.type);
    const ob = OP_ORDER.indexOf(b.type);
    if (oa !== ob) return oa - ob;
    return a.created_at - b.created_at;
  });
}

export async function markOp(clientUuid: string, patch: Partial<PendingOp>) {
  await offlineDB.pending_ops.update(clientUuid, patch);
}

export async function retryOp(clientUuid: string) {
  await offlineDB.pending_ops.update(clientUuid, { status: "pending", attempts: 0, last_error: null });
}

export async function retryAllFailed(tenantId?: string) {
  const rows = await listOps(tenantId, ["failed", "conflict"]);
  await Promise.all(rows.map((r) => retryOp(r.client_uuid)));
}

/** Limpia operaciones ya confirmadas más antiguas que `maxAgeMs`. */
export async function pruneSynced(maxAgeMs = 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  const rows = await offlineDB.pending_ops.where("status").equals("synced").toArray();
  const old = rows.filter((r) => (r.synced_at ?? r.created_at) < cutoff);
  if (old.length) await offlineDB.pending_ops.bulkDelete(old.map((r) => r.client_uuid));
}

export { OP_LABELS };
export type { PendingOp, OpType, OpStatus };
