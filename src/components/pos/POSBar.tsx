import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ShoppingCart, X, Beer, Wine, GlassWater, Coffee, Martini, Flame } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CartContent } from "./CartContent";
import { PaymentDialog } from "./PaymentDialog";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";

interface Product {
  id: string;
  name: string;
  price: number;
  sku: string;
  stock: number;
  category: string | null;
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
  const { tenantId } = useTenantContext();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from("products").select("id, name, price, sku, stock, category").eq("tenant_id", tenantId).eq("is_active", true).order("category").then(({ data }) => {
      if (data) setProducts(data);
    });
  }, [tenantId]);

  const categories = useMemo(() => ["Todos", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[]], [products]);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) return prev.map((i) => (i.productId === product.id ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { id: Date.now(), name: product.name, price: product.price, qty: 1, sku: product.sku, productId: product.id }];
    });
  };

  const updateQty = (id: number, delta: number) => {
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, qty: i.qty + delta } : i)).filter((i) => i.qty > 0));
  };

  const removeItem = (id: number) => setCart((prev) => prev.filter((i) => i.id !== id));

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const tax = subtotal * 0.1;
  const total = subtotal + tax;
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);

  const filtered = useMemo(() => products.filter((p) => {
    const ms = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    const mc = activeCategory === "Todos" || p.category === activeCategory;
    return ms && mc;
  }), [products, search, activeCategory]);

  const handleSaleComplete = () => { setCart([]); setCartOpen(false); };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-8rem)]">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Bar header */}
        <div className="bg-gradient-to-r from-amber-900/30 to-orange-900/15 rounded-xl p-3 mb-3 border border-amber-500/20">
          <div className="flex items-center gap-2">
            <Beer className="h-5 w-5 text-amber-400" />
            <h2 className="font-heading font-bold text-sm text-amber-100/90">Barra de Servicio</h2>
            <Badge variant="outline" className="ml-auto text-[10px] border-amber-500/30 text-amber-400">
              {products.length} productos
            </Badge>
          </div>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar bebida o código..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-amber-500/10 focus-visible:border-amber-500/40" />
        </div>

        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
          {categories.map((cat) => {
            const Icon = categoryIcons[cat];
            return (
              <button key={cat} onClick={() => setActiveCategory(cat)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${activeCategory === cat ? "bg-amber-500 text-white shadow-md shadow-amber-500/25" : "bg-muted text-muted-foreground hover:bg-amber-500/10 hover:text-amber-400"}`}>
                {Icon && <Icon className="h-3 w-3" />}
                {cat}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 overflow-auto flex-1 pb-20 lg:pb-0">
          {filtered.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Beer className="h-10 w-10 mb-2 opacity-20" />
              <p className="text-sm">No hay productos</p>
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
                <div className="h-9 w-9 rounded-lg bg-amber-500/15 flex items-center justify-center mb-2">
                  <Icon className="h-4.5 w-4.5 text-amber-400" />
                </div>
                <p className="text-xs sm:text-sm font-medium truncate">{product.name}</p>
                <p className="text-[10px] text-muted-foreground">{product.category}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-base sm:text-lg font-heading font-bold text-amber-400">${product.price}</p>
                  {product.stock <= 10 && <Badge variant="destructive" className="text-[8px] px-1 h-4">Bajo</Badge>}
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
                <div><h2 className="font-heading font-semibold text-sm">🍸 Cuenta</h2><p className="text-[10px] text-muted-foreground">{totalItems} artículos</p></div>
                <button onClick={() => setCartOpen(false)} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
              </div>
              <CartContent cart={cart} updateQty={updateQty} removeItem={removeItem} subtotal={subtotal} tax={tax} total={total} onCheckout={() => setPaymentOpen(true)} taxLabel="Impuesto (10%)" />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Cart */}
      <div className="hidden lg:flex w-80 xl:w-96 bg-card rounded-xl shadow-card border flex-col shrink-0">
        <div className="p-4 border-b bg-gradient-to-r from-amber-500/10 to-transparent">
          <h2 className="font-heading font-semibold text-sm">🍸 Cuenta del Cliente</h2>
          <p className="text-[10px] text-muted-foreground">{totalItems} artículos • ${subtotal.toLocaleString()} CUP</p>
        </div>
        <CartContent cart={cart} updateQty={updateQty} removeItem={removeItem} subtotal={subtotal} tax={tax} total={total} onCheckout={() => setPaymentOpen(true)} taxLabel="Impuesto (10%)" />
      </div>

      <PaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} cart={cart} subtotal={subtotal} tax={tax} total={total} onSaleComplete={handleSaleComplete} />
    </div>
  );
}
