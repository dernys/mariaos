import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  MarketProduct,
  Tenant,
  StorePublic,
  ProductCategory,
  Promotion,
} from "@/components/marketplace/types";

export interface MarketplaceData {
  products: MarketProduct[];
  tenants: Tenant[];
  stores: StorePublic[];
  categories: ProductCategory[];
  promotions: Promotion[];
  loading: boolean;
  error: string | null;
}

export function useMarketplaceData(): MarketplaceData {
  const [products, setProducts] = useState<MarketProduct[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [stores, setStores] = useState<StorePublic[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pRes, tRes, sRes, cRes, prRes] = await Promise.all([
          supabase
            .from("products")
            .select(
              "id, name, description, price, category, image_url, online_stock, tenant_id, is_deliverable, sku, warehouse_id, created_at"
            )
            .eq("is_online", true)
            .eq("is_active", true)
            .gt("online_stock", 0)
            .order("created_at", { ascending: false })
            .limit(500),
          supabase.from("tenants_public" as any).select("id, name, slug, logo_url, business_type"),
          supabase.from("stores_public" as any).select("*"),
          supabase
            .from("product_categories")
            .select("id, name, parent_id, tenant_id, is_active")
            .eq("is_active", true),
          supabase
            .from("promotions")
            .select(
              "id, tenant_id, name, promo_type, discount_value, scope, scope_id, scope_value, valid_from, valid_until, is_active"
            )
            .eq("is_active", true),
        ]);
        if (cancelled) return;
        if (pRes.error) throw pRes.error;
        setProducts((pRes.data ?? []) as unknown as MarketProduct[]);
        setTenants((tRes.data ?? []) as unknown as Tenant[]);
        setStores((sRes.data ?? []) as unknown as StorePublic[]);
        setCategories((cRes.data ?? []) as unknown as ProductCategory[]);
        const now = new Date();
        const active = ((prRes.data ?? []) as unknown as Promotion[]).filter((p) => {
          const okFrom = !p.valid_from || new Date(p.valid_from) <= now;
          const okTo = !p.valid_until || new Date(p.valid_until) >= now;
          return okFrom && okTo;
        });
        setPromotions(active);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { products, tenants, stores, categories, promotions, loading, error };
}

/**
 * Build a quick lookup: for each product, what is the best active discount %?
 * Considers product-scoped and category-scoped percent promotions.
 */
export function buildPromoIndex(
  promotions: Promotion[],
  products: MarketProduct[],
  categories: ProductCategory[]
) {
  const catByName = new Map<string, ProductCategory>();
  categories.forEach((c) => catByName.set(`${c.tenant_id}:${c.name.toLowerCase()}`, c));
  const map = new Map<string, number>(); // product id -> discount %
  for (const p of promotions) {
    if (p.promo_type !== "percent" && p.promo_type !== "percentage") continue;
    const pct = Number(p.discount_value) || 0;
    if (pct <= 0) continue;
    if (p.scope === "product" && p.scope_id) {
      const prev = map.get(p.scope_id) ?? 0;
      if (pct > prev) map.set(p.scope_id, pct);
    } else if (p.scope === "category" && (p.scope_id || p.scope_value)) {
      for (const prod of products) {
        if (prod.tenant_id !== p.tenant_id) continue;
        const matchById = p.scope_id && catByName.get(`${p.tenant_id}:${(prod.category ?? "").toLowerCase()}`)?.id === p.scope_id;
        const matchByName = p.scope_value && (prod.category ?? "").toLowerCase() === p.scope_value.toLowerCase();
        if (matchById || matchByName) {
          const prev = map.get(prod.id) ?? 0;
          if (pct > prev) map.set(prod.id, pct);
        }
      }
    } else if (p.scope === "all") {
      for (const prod of products) {
        if (prod.tenant_id !== p.tenant_id) continue;
        const prev = map.get(prod.id) ?? 0;
        if (pct > prev) map.set(prod.id, pct);
      }
    }
  }
  return map;
}
