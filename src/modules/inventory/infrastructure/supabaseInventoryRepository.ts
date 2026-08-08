// Fase 3 — Infraestructura: única frontera con Lovable Cloud para Inventario.

import { supabase } from "@/integrations/supabase/client";
import { observability } from "@/lib/observability";
import type {
  InventoryRepository,
  InventorySnapshot,
  MovementRecord,
} from "../application/inventoryRepository";
import type { LocationStock, Movement, Product, ProductDraft } from "../domain/product";

function draftToRow(draft: ProductDraft, tenantId: string | null) {
  return {
    name: draft.name,
    sku: draft.sku,
    description: draft.description ?? null,
    category: draft.category ?? null,
    price: draft.price,
    cost: draft.cost,
    stock: draft.stock,
    min_stock: draft.min_stock,
    warehouse_id: draft.warehouse_id ?? null,
    tenant_id: tenantId,
    is_online: !!draft.is_online,
    online_stock: draft.online_stock ?? 0,
    image_url: draft.image_url ?? null,
    is_deliverable: draft.is_deliverable ?? true,
  };
}

export const supabaseInventoryRepository: InventoryRepository = {
  async loadSnapshot(): Promise<InventorySnapshot> {
    const [prodRes, whRes, stRes, psRes, movRes] = await Promise.all([
      supabase.from("products").select("*").order("name"),
      supabase.from("warehouses").select("id, name").order("name"),
      supabase.from("stores").select("id, name").order("name"),
      supabase.from("product_stock").select("*"),
      supabase.from("inventory_movements").select("*").order("created_at", { ascending: false }).limit(200),
    ]);

    const firstError = prodRes.error || whRes.error || stRes.error || psRes.error || movRes.error;
    if (firstError) {
      observability.warn("inventory snapshot partial", { module: "inventory", operation: "loadSnapshot", db_error: firstError.message });
    }

    return {
      products: (prodRes.data ?? []) as Product[],
      warehouses: whRes.data ?? [],
      stores: stRes.data ?? [],
      locationStocks: (psRes.data ?? []) as LocationStock[],
      movements: (movRes.data ?? []) as Movement[],
    };
  },

  async createProduct(draft, tenantId) {
    const { data, error } = await supabase
      .from("products")
      .insert(draftToRow(draft, tenantId))
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return data!.id as string;
  },

  async updateProduct(id, draft, tenantId) {
    const { error } = await supabase.from("products").update(draftToRow(draft, tenantId)).eq("id", id);
    if (error) throw new Error(error.message);
  },

  async deleteProduct(id) {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async recordMovement(record: MovementRecord, tenantId, userId) {
    const { error } = await supabase.from("inventory_movements").insert({
      ...record,
      tenant_id: tenantId,
      performed_by: userId ?? null,
    });
    if (error) throw new Error(error.message);
  },

  async setProductStock(id, stock) {
    const { error } = await supabase.from("products").update({ stock }).eq("id", id);
    if (error) throw new Error(error.message);
  },

  async uploadProductImage(file: File, tenantId: string) {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${tenantId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("product-images").upload(path, file, { upsert: true });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from("product-images").getPublicUrl(path);
    return data.publicUrl;
  },
};

/** Edición y auditoría de movimientos de inventario (no altera cantidades). */
export const inventoryMovementAudit = {
  async updateMovement(id: string, patch: { reason?: string | null; notes?: string | null; reference_type?: string | null }) {
    const { error } = await supabase.from("inventory_movements").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  },
  async loadHistory(movementId: string) {
    const { data, error } = await supabase
      .from("inventory_movement_history")
      .select("id, field, old_value, new_value, changed_by, created_at")
      .eq("movement_id", movementId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
};
