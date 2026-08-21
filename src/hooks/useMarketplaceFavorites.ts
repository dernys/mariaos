import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Favoritos del comprador persistidos en la base de datos
 * (RLS: cada comprador sólo ve y gestiona los suyos).
 */
export const useMarketplaceFavorites = () => {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setFavorites(new Set());
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("marketplace_favorites" as any)
      .select("product_id");
    setFavorites(new Set(((data as any) || []).map((r: any) => r.product_id as string)));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = useCallback(
    async (productId: string, tenantId: string) => {
      if (!user) return false;
      const isFav = favorites.has(productId);
      // Optimista
      setFavorites((prev) => {
        const next = new Set(prev);
        isFav ? next.delete(productId) : next.add(productId);
        return next;
      });
      const { error } = isFav
        ? await supabase.from("marketplace_favorites" as any).delete().eq("product_id", productId)
        : await supabase
            .from("marketplace_favorites" as any)
            .insert({ user_id: user.id, product_id: productId, tenant_id: tenantId } as any);
      if (error) {
        await load();
        return false;
      }
      return !isFav;
    },
    [user, favorites, load]
  );

  return { favorites, loading, toggle, reload: load, isAuthenticated: !!user };
};
