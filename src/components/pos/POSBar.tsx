import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ShoppingCart, X, Beer, Wine, GlassWater, Coffee, Martini, Flame, Bookmark, ScanLine, ClipboardList, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CartContent } from "./CartContent";
import { PaymentDialog } from "./PaymentDialog";
import { ParkedSalesDialog } from "./ParkedSalesDialog";
import { usePOSSettings } from "@/hooks/usePOSSettings";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { supabase } from "@/integrations/supabase/client";
import { offlineDB, snapshotProducts } from "@/lib/offline/db";
import { useTenantContext } from "@/hooks/useTenantContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useActiveShift } from "@/hooks/useActiveShift";
import { OpenOrdersPanel, type OpenOrder } from "./OpenOrdersPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";


interface Product {
  id: string;
  name: string;
  price: number;
  sku: string;
  stock: number;
  category: string | null;
  image_url?: string | null;
}

interface CartItem {
  id: number;
  name: string;
  price: number;
  qty: number;
  sku?: string;
  productId: string;
}

const categoryIcons: Record<string, typeof Beer> = {
  Cocteles: Martini,
  Cervezas: Beer,
  Licores: Flame,
  Bebidas: GlassWater,
  Snacks: Coffee,
};

const categoryColors: Record<string, string> = {
  Cocteles: "from-amber-500/20 to-orange-500/10 border-amber-400/30",
  Cervezas: "from-yellow-500/20 to-amber-500/10 border-yellow-400/30",
  Licores: "from-red-500/20 to-orange-500/10 border-red-400/30",
  Bebidas: "from-cyan-500/20 to-blue-500/10 border-cyan-400/30",
  Snacks: "from-green-500/20 to-emerald-500/10 border-green-400/30",
};

export function POSBar() {
  const { t } = useTranslation();
  const { tenantId } = useTenantContext();
  const cartKey = tenantId ? `pos_bar_cart_${tenantId}` : "";
  const [products, setProducts] = useState<Product[]>([]);
  // Lazy init so reload/remount restores the in-progress sale.
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("pos_bar_cart_last") : null;
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch { return []; }
  });
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [parkingOpen, setParkingOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [tabName, setTabName] = useState("");
  const { shift } = useActiveShift();


  // Tenant-scoped cart persistence: re-hydrate when tenant becomes known.
  useEffect(() => {
    if (!cartKey) return;
    try {
      const raw = localStorage.getItem(cartKey);
      if (raw) setCart(JSON.parse(raw) as CartItem[]);
    } catch { /* ignore */ }
  }, [cartKey]);

  // Persist cart on every change so a refresh, SW update or accidental
  // navigation does not lose the in-progress sale.
  useEffect(() => {
    try {
      if (cartKey) localStorage.setItem(cartKey, JSON.stringify(cart));
      localStorage.setItem("pos_bar_cart_last", JSON.stringify(cart));
    } catch { /* quota / private mode */ }
  }, [cart, cartKey]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      // 1. Try network first
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from("products")
          .select("id, name, price, sku, stock, category, image_url")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .order("category");
        if (!cancelled && data && !error) {
          setProducts(data);
          // Snapshot to IndexedDB so the POS keeps working offline.
          void snapshotProducts(
            tenantId,
            data.map((p) => ({
              id: p.id, tenant_id: tenantId, name: p.name, sku: p.sku,
              price: Number(p.price), stock: Number(p.stock ?? 0),
              category: p.category ?? null, image_url: p.image_url ?? null,
              updated_at: Date.now(),
            }))
          );
          return;
        }
      }
      // 2. Fallback: offline snapshot
      const snap = await offlineDB.products.where({ tenant_id: tenantId }).toArray();
      if (!cancelled && snap.length) {
        setProducts(snap.map((p) => ({
          id: p.id, name: p.name, price: p.price, sku: p.sku,
          stock: p.stock, category: p.category, image_url: p.image_url,
        })));
        toast.info(t("pos.bar.offlineToast"));
      }
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  const categories = useMemo(() => ["Todos", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[]], [products]);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) return prev.map((i) => (i.productId === product.id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { id: Date.now(), name: product.name, price: product.price, qty: 1, sku: product.sku, productId: product.id }];
    });
  };

  // Escáner HID / lector de códigos: busca por SKU exacto y añade al carro
  const handleScan = useCallback((code: string) => {
    const p = products.find((p) => p.sku?.toLowerCase() === code.toLowerCase());
    if (p) { addToCart(p); toast.success(`+ ${p.name}`); }
    else { toast.error(t("pos.bar.codeNotFound", { code })); }
  }, [products]);
  useBarcodeScanner(handleScan);

  const updateQty = (id: number, delta: number) => {
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, qty: i.qty + delta } : i)).filter((i) => i.qty > 0));
  };

  const removeItem = (id: number) => setCart((prev) => prev.filter((i) => i.id !== id));

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const { settings: posSettings } = usePOSSettings();
  const [taxRatePct, setTaxRatePct] = useState<number>(10);
  useEffect(() => { (async () => { if (!posSettings.default_tax_rate_id) return; const { data } = await supabase.from("tax_rates").select("rate").eq("id", posSettings.default_tax_rate_id).maybeSingle(); if (data) setTaxRatePct(Number((data as any).rate) || 0); })(); }, [posSettings.default_tax_rate_id]);
  const tax = subtotal * (taxRatePct / 100);
  const total = subtotal + tax;
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);

  const filtered = useMemo(() => products.filter((p) => {
    const ms = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    const mc = activeCategory === "Todos" || p.category === activeCategory;
    return ms && mc;
  }), [products, search, activeCategory]);

  const handleSaleComplete = () => {
    setCart([]);
    setCartOpen(false);
    setActiveOrderId(null);
    setTabName("");
    try {
      if (cartKey) localStorage.removeItem(cartKey);
      localStorage.removeItem("pos_bar_cart_last");
    } catch { /* ignore */ }
  };

  // Envía la cuenta a la barra/cocina: queda abierta hasta que se cobra.
  const sendToKitchen = async () => {
    if (cart.length === 0 || !tenantId) return;
    let orderId = activeOrderId;

    if (!orderId) {
      const { data: order, error } = await supabase.from("kitchen_orders").insert({
        tenant_id: tenantId,
        table_name: tabName || t("pos.bar.account"),
        status: "pending",
        priority: "normal",
        order_code: `BAR-${Date.now().toString().slice(-6)}`,
        shift_id: shift?.id ?? null,
        store_id: shift?.store_id ?? null,
      } as any).select("id").single();
      if (error || !order) { toast.error(error?.message ?? "No se pudo enviar la orden"); return; }
      orderId = order.id;
      setActiveOrderId(order.id);
    } else {
      await supabase.from("kitchen_order_items").delete().eq("order_id", orderId);
      await supabase.from("kitchen_orders").update({ status: "pending", updated_at: new Date().toISOString() } as any).eq("id", orderId);
    }

    const { error: itemsErr } = await supabase.from("kitchen_order_items").insert(
      cart.map((i) => ({
        order_id: orderId!,
        product_id: i.productId || null,
        product_name: i.name,
        sku: i.sku || null,
        quantity: i.qty,
        unit_price: i.price,
      })) as any,
    );
    if (itemsErr) { toast.error(itemsErr.message); return; }

    toast.success("Cuenta enviada a la barra");
    setCart([]);
    setCartOpen(false);
    setActiveOrderId(null);
  };

  const loadOrder = (order: OpenOrder) => {
    setActiveOrderId(order.id);
    setTabName(order.table_name || "");
    setCart(order.items.map((i, idx) => ({
      id: Date.now() + idx,
      name: i.product_name,
      price: Number(i.unit_price || 0),
      qty: Number(i.quantity || 0),
      sku: i.sku || undefined,
      productId: i.product_id || "",
    })));
    setOrdersOpen(false);
    setCartOpen(true);
  };


  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-8rem)]">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Bar header */}
        <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/15 rounded-xl p-3 mb-3 border border-amber-500/20">
          <div className="flex items-center gap-2">
            <Beer className="h-5 w-5 text-amber-400" />
            <h2 className="font-heading font-bold text-sm text-amber-100/90">{t("pos.bar.header")}</h2>
            <Badge variant="outline" className="ml-auto text-[10px] border-amber-500/30 text-amber-400">
              {t("pos.bar.productsCount", { n: products.length })}
            </Badge>
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder={t("pos.bar.searchPh")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-amber-500/10 focus-visible:border-amber-500/40" />
            <ScanLine className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-500/60" />
          </div>
          <Button variant="outline" size="icon" onClick={() => setParkingOpen(true)} title={t("pos.bar.parkedTitle")}>
            <Bookmark className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => setOrdersOpen(true)} title="Órdenes abiertas">
            <ClipboardList className="h-4 w-4" /> Órdenes
          </Button>
        </div>
        <Input
          value={tabName}
          onChange={(e) => setTabName(e.target.value)}
          placeholder="Nombre de la cuenta / cliente (opcional)"
          className="mb-3 h-8 text-xs bg-card border-amber-500/10"
        />


        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
          {categories.map((cat) => {
            const Icon = categoryIcons[cat];
            const label = cat === "Todos" ? t("common.all") : cat;
            return (
              <button key={cat} onClick={() => setActiveCategory(cat)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${activeCategory === cat ? "bg-amber-500 text-white shadow-md shadow-amber-500/25" : "bg-muted text-muted-foreground hover:bg-amber-500/10 hover:text-amber-400"}`}>
                {Icon && <Icon className="h-3 w-3" />}
                {label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 overflow-auto flex-1 pb-20 lg:pb-0">
          {filtered.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Beer className="h-10 w-10 mb-2 opacity-20" />
              <p className="text-sm">{t("pos.bar.noProducts")}</p>
            </div>
          )}
          {filtered.map((product) => {
            const Icon = categoryIcons[product.category || ""] || Beer;
            const colors = categoryColors[product.category || ""] || "from-card to-amber-950/5 border-amber-500/10";
            const inCart = cart.find((i) => i.productId === product.id);
            return (
              <motion.button key={product.id} whileTap={{ scale: 0.96 }} onClick={() => addToCart(product)} className={`relative bg-gradient-to-br ${colors} rounded-xl p-3 sm:p-4 shadow-card border text-left hover:shadow-elevated transition-all`}>
                {inCart && (
                  <span className="absolute top-2 right-2 h-5 w-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">{inCart.qty}</span>
                )}
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} loading="lazy" className="h-16 w-full rounded-lg object-cover mb-2 bg-amber-500/10" />
                ) : (
                  <div className="h-9 w-9 rounded-lg bg-amber-500/15 flex items-center justify-center mb-2">
                    <Icon className="h-4.5 w-4.5 text-amber-400" />
                  </div>
                )}
                <p className="text-xs sm:text-sm font-medium truncate">{product.name}</p>
                <p className="text-[10px] text-muted-foreground">{product.category}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-base sm:text-lg font-heading font-bold text-amber-400">${product.price}</p>
                  {product.stock <= 10 && <Badge variant="destructive" className="text-[8px] px-1 h-4">{t("pos.bar.lowStockBadge")}</Badge>}
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Mobile FAB */}
      <div className="lg:hidden fixed bottom-4 right-4 z-50">
        <AnimatePresence>
          {!cartOpen && (
            <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} onClick={() => setCartOpen(true)} className="relative h-14 w-14 rounded-full bg-amber-500 shadow-elevated flex items-center justify-center text-white">
              <ShoppingCart className="h-6 w-6" />
              {totalItems > 0 && <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">{totalItems}</span>}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Cart */}
      <AnimatePresence>
        {cartOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCartOpen(false)} className="lg:hidden fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl shadow-elevated border-t max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <div><h2 className="font-heading font-semibold text-sm">🍸 {t("pos.bar.account")}</h2><p className="text-[10px] text-muted-foreground">{t("pos.bar.itemsCount", { n: totalItems })}</p></div>
                <button onClick={() => setCartOpen(false)} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
              </div>
              <CartContent cart={cart} updateQty={updateQty} removeItem={removeItem} subtotal={subtotal} tax={tax} total={total} onCheckout={() => setPaymentOpen(true)} taxLabel={t("pos.bar.taxLabel", { rate: taxRatePct })} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Cart */}
      <div className="hidden lg:flex w-80 xl:w-96 bg-card rounded-xl shadow-card border flex-col shrink-0">
        <div className="p-4 border-b bg-gradient-to-r from-amber-500/10 to-transparent">
          <h2 className="font-heading font-semibold text-sm">🍸 {t("pos.bar.clientAccount")}</h2>
          <p className="text-[10px] text-muted-foreground">{t("pos.bar.itemsCount", { n: totalItems })} • ${subtotal.toLocaleString()} CUP</p>
        </div>
        <CartContent cart={cart} updateQty={updateQty} removeItem={removeItem} subtotal={subtotal} tax={tax} total={total} onCheckout={() => setPaymentOpen(true)} taxLabel={t("pos.bar.taxLabel", { rate: taxRatePct })} />
      </div>

      <PaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} cart={cart} subtotal={subtotal} tax={tax} total={total} onSaleComplete={handleSaleComplete} />
      <ParkedSalesDialog
        open={parkingOpen}
        onOpenChange={setParkingOpen}
        currentCart={cart}
        onResume={(c) => setCart(c)}
      />
    </div>
  );
}
