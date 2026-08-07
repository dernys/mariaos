// Fase 3 — Puerto (interfaz) del repositorio de inventario.
// La capa de aplicación depende de esta abstracción, nunca de supabase-js.

import type { LocationStock, Movement, Product, ProductDraft, Store, Warehouse } from "../domain/product";

export interface InventorySnapshot {
  products: Product[];
  warehouses: Warehouse[];
  stores: Store[];
  locationStocks: LocationStock[];
  movements: Movement[];
}

export interface MovementRecord {
  product_id: string;
  warehouse_id: string | null;
  movement_type: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reason: string | null;
}

export interface InventoryRepository {
  loadSnapshot(): Promise<InventorySnapshot>;
  createProduct(draft: ProductDraft, tenantId: string | null): Promise<string>;
  updateProduct(id: string, draft: ProductDraft, tenantId: string | null): Promise<void>;
  deleteProduct(id: string): Promise<void>;
  recordMovement(record: MovementRecord, tenantId: string | null, userId?: string | null): Promise<void>;
  setProductStock(id: string, stock: number): Promise<void>;
  uploadProductImage(file: File, tenantId: string): Promise<string>;
}
