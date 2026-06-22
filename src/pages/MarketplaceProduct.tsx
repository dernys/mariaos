import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  ArrowLeft, ShoppingCart, Plus, Minus, MapPin, Truck, Building2,
  Store as StoreIcon, Tag, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MarketplaceProductCard } from "@/components/marketplace/MarketplaceProductCard";
import { MarketplaceCartSheet } from "@/components/marketplace/MarketplaceCartSheet";
import { ProductReviewsSection } from "@/components/marketplace/ProductReviewsSection";
import { RatingStars } from "@/components/marketplace/RatingStars";
import {
  bizIcon, formatPrice, distanceKm,
} from "@/components/marketplace/types";
import type {
  MarketProduct, Tenant, StorePublic, CartItem, Promotion,
} from "@/components/marketplace/types";
import { buildPromoIndex } from "@/hooks/useMarketplaceData";

const MarketplaceProduct = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [product, setProduct] = useState<MarketProduct | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [stores, setStores] = useState<StorePublic[]>([]);
  const [related, setRelated] = useState<MarketProduct[]>([]);
  const [complementary, setComplementary] = useState<MarketProduct[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: p } = await supabase
          .from("products")
          .select("id, name, description, price, category, image_url, online_stock, tenant_id, is_deliverable, sku, warehouse_id, store_id, brand, prep_minutes, created_at")
          .eq("id", id)
          .eq("is_online", true)
          .eq("is_active", true)
          .maybeSingle();
        if (cancelled || !p) { setLoading(false); return; }
        setProduct(p as unknown as MarketProduct);

        const [{ data: tn }, { data: ss }, { data: rel }, { data: pr }] = await Promise.all([
          supabase.from("tenants_public" as any).select("id, name, slug, logo_url, business_type").eq("id", p.tenant_id).maybeSingle(),
          supabase.from("stores_public" as any).select("*").eq("tenant_id", p.tenant_id),
          supabase
            .from("products")
            .select("id, name, description, price, category, image_url, online_stock, tenant_id, is_deliverable, sku, warehouse_id, store_id, brand, prep_minutes, created_at")
            .eq("tenant_id", p.tenant_id)
            .eq("is_online", true)
            .eq("is_active", true)
            .gt("online_stock", 0)
            .neq("id", p.id)
            .limit(12),
          supabase
            .from("promotions")
            .select("id, tenant_id, name, promo_type, discount_value, scope, scope_id, scope_value, valid_from, valid_until, is_active")
            .eq("tenant_id", p.tenant_id)
            .eq("is_active", true),
        ]);
        if (cancelled) return;
        setTenant((tn as any) ?? null);
        setStores(((ss as any) ?? []) as StorePublic[]);
        const all = ((rel as unknown as MarketProduct[]) ?? []);
        setRelated(all.filter((x) => x.category === p.category).slice(0, 6));
        setComplementary(all.filter((x) => x.category !== p.category).slice(0, 6));
        const now = new Date();
        setPromotions(
          ((pr as unknown as Promotion[]) ?? []).filter((x) => {
            const okFrom = !x.valid_from || new Date(x.valid_from) <= now;
            const okTo = !x.valid_until || new Date(x.valid_until) >= now;
            return okFrom && okTo;
          })
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => {},
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
      );
    }
  }, []);

  const tenantsMap = useMemo(() => (tenant ? { [tenant.id]: tenant } : {}), [tenant]);

  const promoIndex = useMemo(() => {
    if (!product) return new Map<string, number>();
    return buildPromoIndex(promotions, [product, ...related, ...complementary], []);
  }, [promotions, product, related, complementary]);

  const discount = product ? promoIndex.get(product.id) ?? 0 : 0;
  const finalPrice = product ? (discount > 0 ? product.price * (1 - discount / 100) : product.price) : 0;

  const distance = useMemo(() => {
    if (!userPos || stores.length === 0) return null;
    return Math.min(...stores.map((s) => distanceKm(userPos, { lat: s.latitude, lng: s.longitude })));
  }, [userPos, stores]);

  const addCurrentToCart = () => {
    if (!product) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      const desired = (existing?.qty ?? 0) + qty;
      if (desired > product.online_stock) {
        toast({ title: t("marketplace.toasts.stockMax"), variant: "destructive" });
        return prev;
      }
      if (existing) {
        return prev.map((i) => (i.id === product.id ? { ...i, qty: desired } : i));
      }
      return [...prev, { ...product, qty, tenantName: tenant?.name || "" }];
    });
    toast({ title: t("marketplace.toasts.addedToCart"), description: product.name });
    setCartOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="aspect-square rounded-2xl" />
          <div className="space-y-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-10 w-1/3" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8 text-center">
        <p className="text-xl font-semibold">{t("marketplace.notFound")}</p>
        <Button className="mt-4 rounded-full" onClick={() => navigate("/marketplace")}>
          {t("marketplace.backToCatalog")}
        </Button>
      </div>
    );
  }

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const stockState = product.online_stock <= 0 ? "out" : product.online_stock <= 5 ? "low" : "ok";

  return (
    <div className="min-h-screen bg-background pb-32 md:pb-12">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> {t("common.back")}
          </button>
          <Link to="/marketplace" className="text-sm font-semibold hover:text-primary">
            {t("marketplace.brand")}
          </Link>
          <Button variant="outline" size="icon" className="relative rounded-full" onClick={() => setCartOpen(true)}>
            <ShoppingCart className="h-4 w-4" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">{cartCount}</span>
            )}
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <nav className="text-xs text-muted-foreground mb-3 flex items-center gap-1 flex-wrap">
          <Link to="/marketplace" className="hover:text-primary">{t("marketplace.brand")}</Link>
          {product.category && <><span>/</span><span>{product.category}</span></>}
          <span>/</span><span className="text-foreground">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10">
          {/* Gallery */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="aspect-square bg-gradient-to-br from-primary/5 to-accent/10 relative">
              {product.image_url ? (
                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-7xl opacity-50">
                  {tenant ? bizIcon(tenant.business_type) : "📦"}
                </div>
              )}
              {discount > 0 && (
                <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-destructive text-destructive-foreground text-sm font-bold shadow">
                  -{Math.round(discount)}%
                </span>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="space-y-4">
            {tenant && (
              <Link to="/marketplace" className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary">
                <StoreIcon className="h-3 w-3" />
                {bizIcon(tenant.business_type)} {tenant.name}
                {distance != null && <span className="text-primary">· <MapPin className="h-3 w-3 inline" /> {distance.toFixed(1)} km</span>}
              </Link>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{product.name}</h1>
            {product.brand && (
              <p className="text-sm text-muted-foreground -mt-1">{product.brand}</p>
            )}

            <div className="flex flex-wrap gap-2 items-center">
              {product.category && (
                <Badge variant="outline" className="gap-1"><Tag className="h-3 w-3" /> {product.category}</Badge>
              )}
              {product.is_deliverable !== false && (
                <Badge variant="outline" className="gap-1"><Truck className="h-3 w-3" /> {t("marketplace.badge.delivery")}</Badge>
              )}
              {product.prep_minutes != null && product.prep_minutes > 0 && (
                <Badge variant="outline" className="gap-1">⏱ {product.prep_minutes} min</Badge>
              )}
              {stockState === "low" && (
                <Badge className="bg-amber-500 hover:bg-amber-500 text-white">{t("marketplace.stock.last", { n: product.online_stock })}</Badge>
              )}
              {stockState === "out" && (
                <Badge variant="destructive">{t("marketplace.stock.out")}</Badge>
              )}
            </div>

            {(product.reviews_count ?? 0) > 0 && (
              <div className="flex items-center gap-2">
                <RatingStars value={product.rating_avg ?? 0} size={16} />
                <span className="text-sm font-semibold">{(product.rating_avg ?? 0).toFixed(1)}</span>
                <span className="text-xs text-muted-foreground">({product.reviews_count})</span>
              </div>
            )}

            <div className="flex items-end gap-3 pt-1">
              <span className="text-3xl font-bold text-primary">{formatPrice(finalPrice)}</span>
              {discount > 0 && (
                <span className="text-base text-muted-foreground line-through">{formatPrice(product.price)}</span>
              )}
            </div>

            {product.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{product.description}</p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-1.5">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-muted"><Minus className="h-4 w-4" /></button>
                <span className="w-6 text-center font-semibold">{qty}</span>
                <button onClick={() => setQty((q) => Math.min(product.online_stock, q + 1))} className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-muted"><Plus className="h-4 w-4" /></button>
              </div>
              <Button onClick={addCurrentToCart} disabled={stockState === "out"} className="flex-1 rounded-full h-11">
                <ShoppingCart className="h-4 w-4 mr-2" /> {t("marketplace.addToCart")} · {formatPrice(finalPrice * qty)}
              </Button>
            </div>

            <Tabs defaultValue="business" className="pt-3">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="business">{t("marketplace.tab.business")}</TabsTrigger>
                <TabsTrigger value="delivery">{t("marketplace.tab.delivery")}</TabsTrigger>
              </TabsList>
              <TabsContent value="business" className="space-y-3 pt-3 text-sm">
                {tenant && (
                  <div className="bg-card border border-border rounded-xl p-3">
                    <p className="font-medium">{bizIcon(tenant.business_type)} {tenant.name}</p>
                    {stores[0]?.address && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> {stores[0].address}</p>
                    )}
                  </div>
                )}
                {stores.length > 1 && (
                  <p className="text-xs text-muted-foreground">+{stores.length - 1} {t("marketplace.moreStores")}</p>
                )}
              </TabsContent>
              <TabsContent value="delivery" className="space-y-2 pt-3 text-sm">
                <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium">{t("marketplace.pickup")}</p>
                    <p className="text-xs text-muted-foreground">{stores.some((s) => s.accepts_pickup) ? t("marketplace.pickupAvailable") : t("marketplace.pickupUnavailable")}</p>
                  </div>
                  {stores.some((s) => s.accepts_pickup) && <Check className="h-4 w-4 text-primary" />}
                </div>
                <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium">{t("marketplace.delivery")}</p>
                    <p className="text-xs text-muted-foreground">
                      {stores.some((s) => s.accepts_delivery) && product.is_deliverable !== false
                        ? t("marketplace.deliveryAvailable", { km: Math.max(...stores.map((s) => s.delivery_radius_km || 0)) })
                        : t("marketplace.deliveryUnavailable")}
                    </p>
                  </div>
                  {stores.some((s) => s.accepts_delivery) && product.is_deliverable !== false && <Check className="h-4 w-4 text-primary" />}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-12">
            <h2 className="text-lg font-bold mb-4">{t("marketplace.related")}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {related.map((p, i) => (
                <MarketplaceProductCard
                  key={p.id}
                  product={p}
                  tenant={tenant ?? undefined}
                  distanceKm={distance ?? undefined}
                  discountPct={promoIndex.get(p.id) ?? 0}
                  qtyInCart={cart.find((c) => c.id === p.id)?.qty ?? 0}
                  index={i}
                  onAdd={() => {
                    setCart((prev) => {
                      const ex = prev.find((i) => i.id === p.id);
                      if (ex) {
                        if (ex.qty >= p.online_stock) return prev;
                        return prev.map((x) => x.id === p.id ? { ...x, qty: x.qty + 1 } : x);
                      }
                      return [...prev, { ...p, qty: 1, tenantName: tenant?.name || "" }];
                    });
                  }}
                  onRemove={() => setCart((prev) => prev.map((x) => x.id === p.id ? { ...x, qty: x.qty - 1 } : x).filter((x) => x.qty > 0))}
                />
              ))}
            </div>
          </section>
        )}

        {complementary.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-bold mb-4">{t("marketplace.complementary")}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {complementary.map((p, i) => (
                <MarketplaceProductCard
                  key={p.id}
                  product={p}
                  tenant={tenant ?? undefined}
                  distanceKm={distance ?? undefined}
                  discountPct={promoIndex.get(p.id) ?? 0}
                  qtyInCart={cart.find((c) => c.id === p.id)?.qty ?? 0}
                  index={i}
                  onAdd={() => {
                    setCart((prev) => {
                      const ex = prev.find((i) => i.id === p.id);
                      if (ex) {
                        if (ex.qty >= p.online_stock) return prev;
                        return prev.map((x) => x.id === p.id ? { ...x, qty: x.qty + 1 } : x);
                      }
                      return [...prev, { ...p, qty: 1, tenantName: tenant?.name || "" }];
                    });
                  }}
                  onRemove={() => setCart((prev) => prev.map((x) => x.id === p.id ? { ...x, qty: x.qty - 1 } : x).filter((x) => x.qty > 0))}
                />
              ))}
            </div>
          </section>
        )}

        <ProductReviewsSection
          productId={product.id}
          tenantId={product.tenant_id}
          ratingAvg={product.rating_avg}
          reviewsCount={product.reviews_count}
        />
      </main>

      {/* Sticky CTA mobile */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-card/95 backdrop-blur border-t border-border p-3 z-30">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">{t("marketplace.total")}</p>
            <p className="text-base font-bold text-primary">{formatPrice(finalPrice * qty)}</p>
          </div>
          <Button onClick={addCurrentToCart} disabled={stockState === "out"} className="rounded-full h-11 px-6">
            <ShoppingCart className="h-4 w-4 mr-2" /> {t("marketplace.addToCart")}
          </Button>
        </div>
      </div>

      <MarketplaceCartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        cart={cart}
        tenantsMap={tenantsMap as Record<string, Tenant>}
        onUpdateQty={(id, delta) => setCart((prev) => prev.map((i) => i.id === id ? { ...i, qty: i.qty + delta } : i).filter((i) => i.qty > 0))}
        onRemove={(id) => setCart((p) => p.filter((i) => i.id !== id))}
        onClear={() => setCart([])}
        onOrderSuccess={() => { setOrderSuccess(true); navigate("/marketplace"); }}
      />

      {orderSuccess && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 bg-background/90 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-3xl p-8 border border-border max-w-sm text-center">
            <Check className="h-10 w-10 text-primary mx-auto mb-3" />
            <h3 className="font-bold text-xl">{t("marketplace.orderPlacedTitle")}</h3>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default MarketplaceProduct;
