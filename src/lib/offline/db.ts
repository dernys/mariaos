// Almacén local (IndexedDB vía Dexie) del núcleo offline de MarIA OS.
//
// Contiene:
//  - pending_ops: cola persistente de TODAS las operaciones creadas sin conexión
//    (ventas, clientes, caja, inventario, devoluciones…). Sobrevive a cierres de
//    la app, reinicios del dispositivo y actualizaciones.
//  - snapshots del conjunto de trabajo del negocio (productos, clientes, etc.)
//    para poder operar sin red.
//  - meta: última sincronización, estado de preparación offline.
//
// pending_sales se conserva por compatibilidad con versiones anteriores y se
// migra automáticamente a pending_ops al arrancar.
import Dexie, { type Table } from "dexie";
import { getDeviceId } from "./device";

export type OpStatus = "pending" | "syncing" | "synced" | "failed" | "conflict";

/** Tipos de operación que el backend sabe sincronizar (sync_offline_operation). */
export type OpType =
  | "sale"
  | "customer"
  | "inventory_adjust"
  | "shift_open"
  | "shift_close"
  | "cash_movement"
  | "sale_return";

export const OP_LABELS: Record<OpType, string> = {
  sale: "Venta",
  customer: "Cliente",
  inventory_adjust: "Movimiento de inventario",
  shift_open: "Apertura de caja",
  shift_close: "Cierre de caja",
  cash_movement: "Movimiento de caja",
  sale_return: "Devolución",
};

/**
 * Orden de sincronización: respeta dependencias naturales del negocio
 * (primero el cliente y la apertura de caja, luego ventas, pagos y cierres).
 */
export const OP_ORDER: OpType[] = [
  "customer",
  "shift_open",
  "sale",
  "cash_movement",
  "sale_return",
  "inventory_adjust",
  "shift_close",
];

export interface PendingOp {
  client_uuid: string;            // identidad única de la operación (idempotencia)
  tenant_id: string;
  type: OpType;
  payload: any;
  title: string;                 // descripción legible para el usuario
  amount?: number | null;
  created_at: number;
  device_id: string;
  user_id?: string | null;
  attempts: number;
  last_error?: string | null;
  status: OpStatus;
  /** client_uuid de operaciones que deben sincronizarse antes que esta. */
  depends_on?: string[];
  /** id real en el servidor una vez sincronizada. */
  result_id?: string | null;
  synced_at?: number | null;
}

/** @deprecated se migra a pending_ops */
export interface PendingSale {
  client_uuid: string;
  tenant_id: string;
  payload: any;
  created_at: number;
  attempts: number;
  last_error?: string;
  status: "pending" | "syncing" | "synced" | "failed";
}

export interface ProductSnapshot {
  id: string;
  tenant_id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  category: string | null;
  image_url: string | null;
  updated_at: number;
}

export interface CustomerSnapshot {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  balance?: number;
  credit_limit?: number;
  pending?: boolean;      // creado offline, aún sin sincronizar
  updated_at: number;
}

export interface SnapshotBlob {
  key: string;            // `${tenant_id}:${kind}`
  tenant_id: string;
  kind: string;           // categories | tax_rates | payment_methods | stores | tables | settings | sales
  data: any;
  updated_at: number;
}

export interface MetaRow {
  key: string;            // `${tenant_id}:last_sync` | `${tenant_id}:ready`
  value: any;
}

class OfflineDB extends Dexie {
  pending_ops!: Table<PendingOp, string>;
  pending_sales!: Table<PendingSale, string>;
  products!: Table<ProductSnapshot, string>;
  customers!: Table<CustomerSnapshot, string>;
  snapshots!: Table<SnapshotBlob, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("maria_offline_v1");
    this.version(1).stores({
      pending_sales: "client_uuid, tenant_id, status, created_at",
      products: "id, tenant_id, sku",
      customers: "id, tenant_id",
    });
    this.version(2).stores({
      pending_sales: "client_uuid, tenant_id, status, created_at",
      pending_ops: "client_uuid, tenant_id, type, status, created_at, [tenant_id+status]",
      products: "id, tenant_id, sku",
      customers: "id, tenant_id",
      snapshots: "key, tenant_id, kind",
      meta: "key",
    });
  }
}

export const offlineDB = new OfflineDB();

/** Migra la cola antigua de ventas a la cola genérica (una sola vez). */
export async function migrateLegacyQueue() {
  try {
    const legacy = await offlineDB.pending_sales
      .where("status").anyOf(["pending", "failed", "syncing"]).toArray();
    for (const s of legacy) {
      const exists = await offlineDB.pending_ops.get(s.client_uuid);
      if (exists) continue;
      await offlineDB.pending_ops.put({
        client_uuid: s.client_uuid,
        tenant_id: s.tenant_id,
        type: "sale",
        payload: s.payload,
        title: `Venta ${Number(s.payload?.total ?? 0).toFixed(2)}`,
        amount: Number(s.payload?.total ?? 0),
        created_at: s.created_at,
        device_id: getDeviceId(),
        attempts: s.attempts ?? 0,
        last_error: s.last_error ?? null,
        status: s.status === "syncing" ? "pending" : (s.status as OpStatus),
      });
    }
  } catch { /* ignore */ }
}

export async function snapshotProducts(tenantId: string, products: ProductSnapshot[]) {
  await offlineDB.products.where({ tenant_id: tenantId }).delete();
  if (products.length) await offlineDB.products.bulkPut(products);
}

/** Compatibilidad: encolar una venta offline. */
export async function enqueueSale(sale: { client_uuid: string; tenant_id: string; payload: any }) {
  const { enqueueOperation } = await import("./queue");
  await enqueueOperation({
    client_uuid: sale.client_uuid,
    tenant_id: sale.tenant_id,
    type: "sale",
    payload: sale.payload,
    title: `Venta · ${Number(sale.payload?.total ?? 0).toFixed(2)}`,
    amount: Number(sale.payload?.total ?? 0),
  });
}

export async function countPending(tenantId?: string) {
  const { queueStats } = await import("./queue");
  const s = await queueStats(tenantId);
  return s.pending + s.failed;
}
