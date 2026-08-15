import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  ShoppingCart, Store as StoreIcon, MapPin, SlidersHorizontal, Check, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useMarketplaceData, buildPromoIndex } from "@/hooks/useMarketplaceData";
import { MarketplaceSearchBar } from "@/components/marketplace/MarketplaceSearchBar";
import { MarketplaceFilters } from "@/components/marketplace/MarketplaceFilters";
import { MarketplaceSortSelect } from "@/components/marketplace/MarketplaceSortSelect";
import { ActiveFilterChips } from "@/components/marketplace/ActiveFilterChips";
import { MarketplaceProductCard } from "@/components/marketplace/MarketplaceProductCard";
import { ProductCardSkeletonGrid } from "@/components/marketplace/ProductCardSkeleton";
import { EmptyState } from "@/components/marketplace/EmptyState";
import { MarketplaceCartSheet } from "@/components/marketplace/MarketplaceCartSheet";
import {
  defaultFilterState,
  distanceKm,
  formatPrice,
} from "@/components/marketplace/types";
import type {
  CartItem,
  MarketProduct,
  MarketplaceFilterState,
  Tenant,
  StorePublic,
} from "@/components/marketplace/types";

const NEW_DAYS = 14;

const Marketplace = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const data = useMarketplaceData();
  const [filters, setFilters] = useState<MarketplaceFilterState>(defaultFilterState);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => {},
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
      );
    }
  }, []);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: t("marketplace.toasts.geoUnavailable"), variant: "destructive" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => { setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }); toast({ title: t("marketplace.toasts.locationDetected") }); },
      (err) => toast({ title: t("common.error"), description: err.message, variant: "destructive" }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const tenantsMap = useMemo(() => {
    const m: Record<string, Tenant> = {};
    data.tenants.forEach((tn) => (m[tn.id] = tn));
    return m;
  }, [data.tenants]);

  const storesByTenant = useMemo(() => {
    const m: Record<string, StorePublic[]> = {};
    data.stores.forEach((s) => {
      (m[s.tenant_id] ||= []).push(s);
    });
    return m;
  }, [data.stores]);

  const tenantDistances = useMemo(() => {
    const out: Record<string, number | undefined> = {};
    if (!userPos) return out;
    for (const s of data.stores) {
      const d = distanceKm(userPos, { lat: s.latitude, lng: s.longitude });
      const cur = out[s.tenant_id];
      if (cur == null || d < cur) out[s.tenant_id] = d;
    }
    return out;
  }, [data.stores, userPos]);

  const promoIndex = useMemo(
    () => buildPromoIndex(data.promotions, data.products, data.categories),
    [data.promotions, data.products, data.categories]
  );

  // Featured categories (top 8 by count)
  const featuredCategories = useMemo(() => {
    const c = new Map<string, number>();
    data.products.forEach((p) => p.category && c.set(p.category, (c.get(p.category) ?? 0) + 1));
    return Array.from(c.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n]) => n);
  }, [data.products]);

  const setF = (patch: Partial<MarketplaceFilterState>) => setFilters((f) => ({ ...f, ...patch }));

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const list = data.products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !(p.description || "").toLowerCase().includes(q) && !(p.category || "").toLowerCase().includes(q)) return false;
      if (filters.categories.length && !filters.categories.includes(p.category ?? "")) return false;
      if (filters.tenantIds.length && !filters.tenantIds.includes(p.tenant_id)) return false;
      if (filters.brands.length && !(p.brand && filters.brands.includes(p.brand))) return false;
      if (filters.storeIds.length) {
        const okStores = storesByTenant[p.tenant_id] ?? [];
        if (!okStores.some((s) => filters.storeIds.includes(s.id))) return false;
      }
      const discount = promoIndex.get(p.id) ?? 0;
      const finalPrice = discount > 0 ? p.price * (1 - discount / 100) : p.price;
      if (filters.priceMin != null && finalPrice < filters.priceMin) return false;
      if (filters.priceMax != null && finalPrice > filters.priceMax) return false;
      if (filters.availability === "in_stock" && p.online_stock <= 0) return false;
      if (filters.availability === "low_stock" && p.online_stock > 5) return false;
      if (filters.delivery === "delivery" && p.is_deliverable === false) return false;
      if (filters.delivery === "pickup") {
        const okStores = storesByTenant[p.tenant_id] ?? [];
        if (!okStores.some((s) => s.accepts_pickup)) return false;
      }
      if (filters.maxDistanceKm != null && userPos) {
        const d = tenantDistances[p.tenant_id];
        if (d == null || d > filters.maxDistanceKm) return false;
      }
      if (filters.minRating != null) {
        if ((p.rating_avg ?? 0) < filters.minRating) return false;
      }
      if (filters.maxPrepMinutes != null) {
        if (p.prep_minutes == null || p.prep_minutes > filters.maxPrepMinutes) return false;
      }
      if (filters.onlyOffers && discount <= 0) return false;
      return true;
    });

    return list.sort((a, b) => {
      const da = promoIndex.get(a.id) ?? 0;
      const db = promoIndex.get(b.id) ?? 0;
      const pa = da > 0 ? a.price * (1 - da / 100) : a.price;
      const pb = db > 0 ? b.price * (1 - db / 100) : b.price;
      switch (filters.sort) {
        case "price_asc": return pa - pb;
        case "price_desc": return pb - pa;
        case "discount": return db - da;
        case "rating": return (b.rating_avg ?? 0) - (a.rating_avg ?? 0);
        case "newest": return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
        case "nearest": {
          const ad = tenantDistances[a.tenant_id] ?? 9999;
          const bd = tenantDistances[b.tenant_id] ?? 9999;
          return ad - bd;
        }
        default: {
          // relevance: distance if available, then newest
          if (userPos) {
            const ad = tenantDistances[a.tenant_id] ?? 9999;
            const bd = tenantDistances[b.tenant_id] ?? 9999;
            if (ad !== bd) return ad - bd;
          }
          return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
        }
      }
    });
  }, [data.products, filters, userPos, tenantDistances, promoIndex, storesByTenant]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filtered, currentPage, pageSize]
  );

  // Reset to first page whenever the result set changes
  useEffect(() => { setPage(1); }, [filters, pageSize]);

  const goToPage = (n: number) => {
    setPage(Math.min(Math.max(1, n), totalPages));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pageNumbers = useMemo(() => {
    const nums: (number | "gap")[] = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) nums.push(i);
      else if (nums[nums.length - 1] !== "gap") nums.push("gap");
    }
    return nums;
  }, [totalPages, currentPage]);

  const addToCart = (p: MarketProduct) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === p.id);
      if (existing) {
        if (existing.qty >= p.online_stock) {
          toast({ title: t("marketplace.toasts.stockMax"), variant: "destructive" });
          return prev;
        }
        return prev.map((i) => (i.id === p.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { ...p, qty: 1, tenantName: tenantsMap[p.tenant_id]?.name || "" }];
    });
    toast({ title: t("marketplace.toasts.addedToCart"), description: p.name });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.id !== id) return i;
          const next = i.qty + delta;
          if (next > i.online_stock) return i;
          return { ...i, qty: next };
        })
        .filter((i) => i.qty > 0)
    );
  };

  const removeFromCart = (id: string) => setCart((p) => p.filter((i) => i.id !== id));

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  const clearFilters = () => setFilters(defaultFilterState);

  const hasActiveFilters =
    !!filters.search ||
    filters.categories.length > 0 ||
    filters.subcategoryIds.length > 0 ||
    filters.tenantIds.length > 0 ||
    filters.storeIds.length > 0 ||
    filters.brands.length > 0 ||
    filters.priceMin != null ||
    filters.priceMax != null ||
    filters.availability !== "any" ||
    filters.delivery !== "any" ||
    filters.maxDistanceKm != null ||
    filters.minRating != null ||
    filters.maxPrepMinutes != null ||
    filters.onlyOffers;

  if (orderSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-card rounded-3xl shadow-xl border border-border p-8 max-w-md w-full text-center space-y-4"
        >
          <div className="h-16 w-16 rounded-full bg-primary/15 flex items-center justify-center mx-auto">
            <Check className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold">{t("marketplace.orderPlacedTitle")}</h2>
          <p className="text-muted-foreground">{t("marketplace.orderPlacedDetail")}</p>
          <div className="flex gap-3 justify-center pt-2">
            <Button variant="outline" onClick={() => setOrderSuccess(false)} className="rounded-full">
              {t("marketplace.keepShopping")}
            </Button>
            <Button onClick={() => navigate("/")} className="rounded-full">
              {t("marketplace.goHome")}
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-lg border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center">
              <StoreIcon className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-base text-foreground hidden sm:block">{t("marketplace.brand")}</span>
          </Link>

          <MarketplaceSearchBar
            value={filters.search}
            onChange={(v) => setF({ search: v })}
            products={data.products}
            tenants={data.tenants}
            onSelectProduct={(p) => navigate(`/marketplace/p/${p.id}`)}
            onSelectTenant={(tn) => setF({ tenantIds: [tn.id] })}
            onSelectCategory={(c) => setF({ categories: [c] })}
          />

          <div className="flex items-center gap-2 shrink-0">
            {!user && (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate("/marketplace/acceso")} className="rounded-full text-xs hidden sm:inline-flex">
                  {t("marketplace.login")}
                </Button>
                <Button size="sm" onClick={() => navigate("/marketplace/acceso?view=register")} className="rounded-full text-xs hidden sm:inline-flex">
                  {t("marketplace.createAccount")}
                </Button>
              </>
            )}
            <Button
              variant="outline" size="icon"
              className="relative rounded-full"
              onClick={() => setCartOpen(true)}
              aria-label="cart"
            >
              <ShoppingCart className="h-4 w-4" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">{cartCount}</span>
              )}
            </Button>
          </div>
        </div>

        {/* Featured categories chips */}
        {featuredCategories.length > 0 && (
          <div className="max-w-7xl mx-auto px-4 pb-3 overflow-x-auto">
            <div className="flex gap-2 snap-x">
              <button
                onClick={() => setF({ categories: [] })}
                className={`snap-start shrink-0 h-8 px-3 rounded-full text-xs font-medium border transition-all ${filters.categories.length === 0 ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:bg-muted"}`}
              >
                {t("common.all")}
              </button>
              {featuredCategories.map((c) => {
                const active = filters.categories.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => setF({ categories: active ? filters.categories.filter((x) => x !== c) : [...filters.categories, c] })}
                    className={`snap-start shrink-0 h-8 px-3 rounded-full text-xs font-medium border transition-all ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:bg-muted"}`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* HERO (compact) */}
      <section className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              {t("marketplace.heroTitle")} <span className="text-primary">{t("marketplace.heroAccent")}</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">{t("marketplace.heroSubtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {userPos ? (
              <Badge variant="outline" className="gap-1 bg-primary/5 border-primary/30 text-primary">
                <MapPin className="h-3 w-3" /> {t("marketplace.locationOn")}
              </Badge>
            ) : (
              <Button size="sm" variant="outline" onClick={requestLocation} className="h-8 text-xs gap-1 rounded-full">
                <MapPin className="h-3.5 w-3.5" /> {t("marketplace.useLocation")}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* TOOLBAR */}
      <div className="sticky top-[64px] sm:top-[68px] z-30 bg-background/85 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-full lg:hidden">
                <SlidersHorizontal className="h-4 w-4 mr-1" /> {t("marketplace.filters.title")}
                {hasActiveFilters && <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl flex flex-col p-0">
              <SheetHeader className="px-5 pt-5 pb-2">
                <SheetTitle>{t("marketplace.filters.title")}</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-5 pb-5">
                <MarketplaceFilters
                  filters={filters}
                  onChange={setF}
                  onClear={clearFilters}
                  products={data.products}
                  tenants={data.tenants}
                  stores={data.stores}
                  categories={data.categories}
                  hasGeo={!!userPos}
                  resultsCount={filtered.length}
                />
              </div>
              <div className="border-t p-4 bg-card">
                <Button onClick={() => setFiltersOpen(false)} className="w-full rounded-full h-11">
                  {t("marketplace.showResults", { n: filtered.length })}
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          <MarketplaceSortSelect value={filters.sort} onChange={(v) => setF({ sort: v })} hasGeo={!!userPos} />

          <div className="flex-1 min-w-0 overflow-x-auto">
            <ActiveFilterChips
              filters={filters}
              tenants={data.tenants}
              stores={data.stores}
              categories={data.categories}
              onChange={setF}
              onClear={clearFilters}
            />
          </div>

          <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">
            {filtered.length} {t("marketplace.results")}
          </span>
        </div>
      </div>

      {/* MAIN: sidebar + grid */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          {/* Sidebar desktop */}
          <aside className="hidden lg:block">
            <div className="sticky top-[140px] bg-card border border-border rounded-2xl p-5">
              <MarketplaceFilters
                filters={filters}
                onChange={setF}
                onClear={clearFilters}
                products={data.products}
                tenants={data.tenants}
                stores={data.stores}
                categories={data.categories}
                hasGeo={!!userPos}
                resultsCount={filtered.length}
              />
            </div>
          </aside>

          {/* Grid */}
          <section>
            {data.loading ? (
              <ProductCardSkeletonGrid />
            ) : filtered.length === 0 ? (
              <EmptyState hasActiveFilters={hasActiveFilters} onClear={clearFilters} />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {paginated.map((p, i) => {
                  const inCart = cart.find((c) => c.id === p.id);
                  const isNew =
                    p.created_at &&
                    (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24) < NEW_DAYS;
                  return (
                    <MarketplaceProductCard
                      key={p.id}
                      product={p}
                      tenant={tenantsMap[p.tenant_id]}
                      distanceKm={userPos ? tenantDistances[p.tenant_id] : undefined}
                      discountPct={promoIndex.get(p.id) ?? 0}
                      qtyInCart={inCart?.qty ?? 0}
                      isNew={!!isNew}
                      index={i}
                      onAdd={() => addToCart(p)}
                      onRemove={() => updateQty(p.id, -1)}
                    />
                  );
                })}
              </div>
            )}

            {!data.loading && filtered.length > 0 && (
              <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} / {filtered.length} {t("marketplace.results")}
                </p>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {pageNumbers.map((n, idx) =>
                    n === "gap" ? (
                      <span key={`gap-${idx}`} className="px-1 text-xs text-muted-foreground">…</span>
                    ) : (
                      <Button
                        key={n}
                        variant={n === currentPage ? "default" : "outline"}
                        size="sm"
                        className="h-8 min-w-8 rounded-full px-2 text-xs"
                        onClick={() => goToPage(n)}
                        aria-current={n === currentPage ? "page" : undefined}
                      >
                        {n}
                      </Button>
                    )
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    aria-label="Página siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Por página</span>
                  <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                    <SelectTrigger className="h-8 w-[72px] rounded-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[12, 24, 48, 96].map((n) => (
                        <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Floating cart bar mobile */}
      {cartCount > 0 && !cartOpen && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed bottom-3 left-3 right-3 sm:hidden z-40"
        >
          <Button
            onClick={() => setCartOpen(true)}
            className="w-full rounded-full shadow-xl h-12 text-sm"
          >
            <ShoppingCart className="h-5 w-5 mr-2" />
            {t("marketplace.viewCart")} ({cartCount}) · {formatPrice(cartTotal)}
          </Button>
        </motion.div>
      )}

      <MarketplaceCartSheet
        open={cartOpen}
        onOpenChange={setCartOpen}
        cart={cart}
        tenantsMap={tenantsMap}
        onUpdateQty={updateQty}
        onRemove={removeFromCart}
        onClear={() => setCart([])}
        onOrderSuccess={() => setOrderSuccess(true)}
      />
    </div>
  );
};

export default Marketplace;
