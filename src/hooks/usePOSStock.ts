import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { availableStock } from "@/lib/pos/stockRule";
import { offlineDB } from "@/lib/offline/db";

// Copia verificada por tenant+tienda para operar sin conexión (nunca de otra tienda).
const cacheKey = (tenantId: string, storeId: string | null | undefined) => `${tenantId}:pos_stock:${storeId ?? "tenant"}`;

/**
 * Existencia real por tienda para el POS.
 * Replica la regla del servidor (pos_checkout):
 *  - producto con receta → no se limita por su propio stock (se descuentan ingredientes)
 *  - fila en product_stock de la tienda del turno → esa es la existencia
 *  - tienda sin fila → 0, nunca el agregado global
 */
export function usePOSStock(tenantId: string | null | undefined, storeId: string | null | undefined) {
  const [storeStock, setStoreStock] = useState<Map<string, number>>(new Map());
  const [recipeIds, setRecipeIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const scope = `${tenantId ?? ""}:${storeId ?? ""}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    const version = ++requestVersion.current;
    const loadCached = async () => {
      try {
        const blob = await offlineDB.snapshots.get(cacheKey(tenantId, storeId));
        if (currentScope.current !== scope || requestVersion.current !== version) return;
        if (!blob || blob.tenant_id !== tenantId || blob.data?.scope !== scope) return;
        setStoreStock(new Map(blob.data.stock as [string, number][]));
        setRecipeIds(new Set(blob.data.recipes as string[]));
        setLoadedScope(scope);
        setLoaded(true);
      } catch { /* sin copia: se mantiene en 0 */ }
    };
    if (!navigator.onLine) { await loadCached(); return; }
    const locType = storeId ? "store" : "tenant";
    const locId = storeId ?? tenantId;
    const [stockRes, recipeRes] = await Promise.all([
      supabase.from("product_stock").select("product_id, stock")
        .eq("tenant_id", tenantId).eq("location_type", locType).eq("location_id", locId).limit(5000),
      supabase.from("product_recipes").select("product_id").eq("tenant_id", tenantId).limit(5000),
    ]);
    if (currentScope.current !== scope || requestVersion.current !== version) return;
    if (stockRes.error || recipeRes.error || !stockRes.data || !recipeRes.data) {
      setLoaded(false);
      setLoadedScope(null);
      await loadCached();
      return;
    }
    const stockEntries = stockRes.data.map((r) => [r.product_id, Number(r.stock ?? 0)] as [string, number]);
    const recipes = recipeRes.data.map((r) => r.product_id);
    setStoreStock(new Map(stockEntries));
    setRecipeIds(new Set(recipes));
    void offlineDB.snapshots.put({ key: cacheKey(tenantId, storeId), tenant_id: tenantId, kind: "pos_stock", data: { scope, stock: stockEntries, recipes }, updated_at: Date.now() }).catch(() => {});
    setLoadedScope(scope);
    setLoaded(true);
  }, [tenantId, storeId, scope]);

  useEffect(() => {
    setLoaded(false);
    setLoadedScope(null);
    setStoreStock(new Map());
    setRecipeIds(new Set());
    void refresh();
    const iv = setInterval(() => void refresh(), 20000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("pos:stock-changed", onFocus);
    window.addEventListener("online", onFocus);
    return () => { ++requestVersion.current; clearInterval(iv); window.removeEventListener("focus", onFocus); window.removeEventListener("pos:stock-changed", onFocus); window.removeEventListener("online", onFocus); };
  }, [refresh]);

  /** Devuelve la existencia disponible o null si no aplica límite (receta). */
  const stockOf = useCallback((productId: string, fallback: number): number | null => {
    // Hasta cargar la existencia por tienda, no ofrecer stock global por error.
    if (!tenantId || !loaded || loadedScope !== scope) return 0;
    return availableStock({
      hasRecipe: recipeIds.has(productId),
      storeScoped: !!storeId,
      locationStock: storeStock.get(productId),
      globalStock: fallback,
    });
  }, [storeStock, recipeIds, storeId, loaded, tenantId, loadedScope, scope]);

  return { stockOf, refresh, loaded: loaded && loadedScope === scope };
}

export const notifyStockChanged = () => window.dispatchEvent(new Event("pos:stock-changed"));
