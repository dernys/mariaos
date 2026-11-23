import { supabase } from "@/integrations/supabase/client";
import { offlineDB, snapshotProducts } from "@/lib/offline/db";

export interface POSProductRow { id: string; name: string; price: number; sku: string | null; stock: number | null; category: string | null; image_url: string | null }

/** Productos activos del tenant: red primero (y guarda copia), copia local si no hay red o falla. */
export async function loadPOSProducts(tenantId: string, orderBy: "name" | "category"): Promise<{ data: POSProductRow[]; offline: boolean }> {
  if (navigator.onLine) {
    const { data, error } = await supabase.from("products").select("id, name, price, sku, stock, category, image_url")
      .eq("tenant_id", tenantId).eq("is_active", true).order(orderBy);
    if (data && !error) {
      void snapshotProducts(tenantId, data.map((p) => ({
        id: p.id, tenant_id: tenantId, name: p.name, sku: p.sku, price: Number(p.price), stock: Number(p.stock ?? 0),
        category: p.category ?? null, image_url: p.image_url ?? null, updated_at: Date.now(),
      })));
      return { data: data as POSProductRow[], offline: false };
    }
  }
  const snap = await offlineDB.products.where({ tenant_id: tenantId }).toArray().catch(() => []);
  snap.sort((a, b) => String(a[orderBy] ?? "").localeCompare(String(b[orderBy] ?? "")));
  return { data: snap.map((p) => ({ id: p.id, name: p.name, price: p.price, sku: p.sku, stock: p.stock, category: p.category, image_url: p.image_url })), offline: true };
}
