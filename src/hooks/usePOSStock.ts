import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { availableStock } from "@/lib/pos/stockRule";

/**
 * Existencia real por tienda para el POS.
 * Replica la regla del servidor (pos_checkout):
 *  - producto con receta → no se limita por su propio stock (se descuentan ingredientes)
 *  - fila en product_stock de la tienda del turno → esa es la existencia
 *  - sin fila → se usa products.stock
 */
export function usePOSStock(tenantId: string | null | undefined, storeId: string | null | undefined) {
  const [storeStock, setStoreStock] = useState<Map<string, number>>(new Map());
  const [recipeIds, setRecipeIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!tenantId || !navigator.onLine) return;
    const locType = storeId ? "store" : "tenant";
    const locId = storeId ?? tenantId;
    const [stockRes, recipeRes] = await Promise.all([
      supabase.from("product_stock").select("product_id, stock")
        .eq("tenant_id", tenantId).eq("location_type", locType).eq("location_id", locId).limit(5000),
      supabase.from("product_recipes").select("product_id").eq("tenant_id", tenantId).limit(5000),
    ]);
    if (stockRes.data) setStoreStock(new Map(stockRes.data.map((r: any) => [r.product_id, Number(r.stock ?? 0)])));
    if (recipeRes.data) setRecipeIds(new Set(recipeRes.data.map((r: any) => r.product_id)));
    setLoaded(true);
  }, [tenantId, storeId]);

  useEffect(() => {
    void refresh();
    const iv = setInterval(() => void refresh(), 20000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("pos:stock-changed", onFocus);
    return () => { clearInterval(iv); window.removeEventListener("focus", onFocus); window.removeEventListener("pos:stock-changed", onFocus); };
  }, [refresh]);

  /** Devuelve la existencia disponible o null si no aplica límite (receta). */
  const stockOf = useCallback((productId: string, fallback: number): number | null => {
    // Hasta cargar la existencia por tienda, no ofrecer stock global por error.
    if (storeId && !loaded) return recipeIds.has(productId) ? null : 0;
    return availableStock({
      hasRecipe: recipeIds.has(productId),
      storeScoped: !!storeId,
      locationStock: storeStock.get(productId),
      globalStock: fallback,
    });
  }, [storeStock, recipeIds, storeId, loaded]);

  return { stockOf, refresh, loaded };
}

export const notifyStockChanged = () => window.dispatchEvent(new Event("pos:stock-changed"));
