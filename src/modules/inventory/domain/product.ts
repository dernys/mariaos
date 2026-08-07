// Fase 3 — Dominio de Inventario (puro, sin dependencias de infraestructura).

export interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  category: string | null;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  warehouse_id: string | null;
  is_active: boolean;
  is_online?: boolean;
  online_stock?: number;
  image_url?: string | null;
  is_deliverable?: boolean;
}

export interface Warehouse { id: string; name: string }
export interface Store { id: string; name: string }

export interface LocationStock {
  id: string;
  product_id: string;
  location_type: string;
  location_id: string;
  stock: number;
}

export type MovementType = "entry" | "exit" | "adjust";

export interface Movement {
  id: string;
  movement_type: string;
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reason: string | null;
  created_at: string;
  product_id: string;
  location_type?: string | null;
  location_id?: string | null;
}

export type StockStatus = "outOfStock" | "lowStock" | "inStock";

export function stockStatus(stock: number, min: number): StockStatus {
  if (stock <= 0) return "outOfStock";
  if (stock <= min) return "lowStock";
  return "inStock";
}

/** Valor de inventario a costo. */
export function inventoryValue(products: Pick<Product, "stock" | "cost">[]): number {
  return products.reduce((acc, p) => acc + (p.stock || 0) * (p.cost || 0), 0);
}

export interface InventoryStats {
  total: number;
  out: number;
  low: number;
  value: number;
}

export function inventoryStats(products: Product[]): InventoryStats {
  return {
    total: products.length,
    out: products.filter((p) => p.stock <= 0).length,
    low: products.filter((p) => p.stock > 0 && p.stock <= p.min_stock).length,
    value: inventoryValue(products),
  };
}

export interface MovementIntent {
  type: MovementType;
  quantity: number;
  currentStock: number;
}

export type MovementError = "qtyGtZero" | "notEnoughStock";

export interface MovementPlan {
  ok: boolean;
  error?: MovementError;
  previousStock: number;
  newStock: number;
  delta: number;
}

/**
 * Invariante de inventario: la cantidad debe ser positiva y el stock resultante
 * nunca puede ser negativo. Decide el nuevo stock sin tocar la base de datos.
 */
export function planMovement(intent: MovementIntent): MovementPlan {
  const qty = Math.trunc(intent.quantity || 0);
  const previousStock = intent.currentStock || 0;
  if (qty <= 0) {
    return { ok: false, error: "qtyGtZero", previousStock, newStock: previousStock, delta: 0 };
  }
  const delta = intent.type === "exit" ? -qty : qty;
  const newStock = previousStock + delta;
  if (newStock < 0) {
    return { ok: false, error: "notEnoughStock", previousStock, newStock: previousStock, delta: 0 };
  }
  return { ok: true, previousStock, newStock, delta };
}

export interface ProductDraft {
  name: string;
  sku: string;
  description?: string | null;
  category?: string | null;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  warehouse_id?: string | null;
  is_online?: boolean;
  online_stock?: number;
  image_url?: string | null;
  is_deliverable?: boolean;
}

export type ProductError = "nameSkuRequired" | "negativeAmounts";

export function validateProductDraft(draft: ProductDraft): ProductError | null {
  if (!draft.name?.trim() || !draft.sku?.trim()) return "nameSkuRequired";
  if (draft.price < 0 || draft.cost < 0 || draft.stock < 0 || draft.min_stock < 0) return "negativeAmounts";
  return null;
}

/** Normaliza un borrador antes de persistirlo (reglas del dominio). */
export function normalizeProductDraft(draft: ProductDraft): ProductDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    sku: draft.sku.trim(),
    description: draft.description?.trim() || null,
    category: draft.category || null,
    warehouse_id: draft.warehouse_id || null,
    image_url: draft.image_url?.trim() || null,
    is_online: !!draft.is_online,
    online_stock: draft.is_online ? draft.online_stock || 0 : 0,
    is_deliverable: draft.is_deliverable ?? true,
  };
}
