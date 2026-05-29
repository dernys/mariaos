// IndexedDB store via Dexie for offline POS resilience.
// Stores pending sales (with items + payments) and lightweight snapshots
// of products/customers so the POS keeps working during a blackout or
// total network loss. Sync is handled by useOfflineQueue.
import Dexie, { type Table } from "dexie";

export interface PendingSale {
  client_uuid: string;          // idempotency key
  tenant_id: string;
  payload: any;                 // jsonb sent to sync_offline_sale RPC
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
  updated_at: number;
}

class OfflineDB extends Dexie {
  pending_sales!: Table<PendingSale, string>;
  products!: Table<ProductSnapshot, string>;
  customers!: Table<CustomerSnapshot, string>;

  constructor() {
    super("maria_offline_v1");
    this.version(1).stores({
      pending_sales: "client_uuid, tenant_id, status, created_at",
      products: "id, tenant_id, sku",
      customers: "id, tenant_id",
    });
  }
}

export const offlineDB = new OfflineDB();

export async function enqueueSale(sale: Omit<PendingSale, "attempts" | "status" | "created_at">) {
  await offlineDB.pending_sales.put({
    ...sale,
    attempts: 0,
    status: "pending",
    created_at: Date.now(),
  });
}

export async function countPending(tenantId?: string) {
  const coll = tenantId
    ? offlineDB.pending_sales.where({ tenant_id: tenantId, status: "pending" })
    : offlineDB.pending_sales.where("status").equals("pending");
  return coll.count();
}

export async function snapshotProducts(tenantId: string, products: ProductSnapshot[]) {
  await offlineDB.products.where({ tenant_id: tenantId }).delete();
  if (products.length) await offlineDB.products.bulkPut(products);
}
