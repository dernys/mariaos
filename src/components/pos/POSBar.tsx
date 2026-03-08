import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ShoppingCart, X, Beer, Wine, GlassWater, Coffee } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  Cocteles: Wine,
  Cervezas: Beer,
  Licores: Wine,
  Bebidas: GlassWater,
  Snacks: Coffee,
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

  const categories = ["Todos", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[]];

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

  const filtered = products.filter((p) => {
    const ms = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    const mc = activeCategory === "Todos" || p.category === activeCategory;
    return ms && mc;
  });

  const handleSaleComplete = () => { setCart([]); setCartOpen(false); };

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-8rem)]">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Ambiance header */}
        <div className="bg-gradient-to-r from-amber-900/20 to-orange-900/10 rounded-xl p-4 mb-3 border border-amber-500/20">
          <div className="flex items-center gap-2 mb-1">
            <Beer className="h-5 w-5 text-amber-500" />
            <h2 className="font-heading font-bold text-sm text-amber-100/90">Barra de Servicio</h2>
          </div>
          <p className="text-[10px] text-muted-foreground">Selecciona bebidas y snacks para agregar a la cuenta</p>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar bebida o código..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
          {categories.map((cat) => (
            <button key={cat} onClick={() => setActiveCategory(cat)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeCategory === cat ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 overflow-auto flex-1 pb-20 lg:pb-0">
          {filtered.map((product) => {
            const Icon = categoryIcons[product.category || ""] || Beer;
            return (
              <motion.button key={product.id} whileTap={{ scale: 0.96 }} onClick={() => addToCart(product)} className="bg-gradient-to-br from-card to-amber-950/5 rounded-xl p-3 sm:p-4 shadow-card border border-amber-500/10 text-left hover:shadow-elevated hover:border-amber-500/30 transition-all">
                <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center mb-2">
                  <Icon className="h-5 w-5 text-amber-500" />
                </div>
                <p className="text-xs sm:text-sm font-medium truncate">{product.name}</p>
                <p className="text-[10px] text-muted-foreground">{product.category}</p>
                <p className="text-base sm:text-lg font-heading font-bold mt-1 text-amber-500">${product.price}</p>
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
                <div><h2 className="font-heading font-semibold text-sm">Cuenta</h2><p className="text-[10px] text-muted-foreground">{totalItems} artículos</p></div>
                <button onClick={() => setCartOpen(false)} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
              </div>
              <CartContent cart={cart} updateQty={updateQty} removeItem={removeItem} subtotal={subtotal} tax={tax} total={total} onCheckout={() => setPaymentOpen(true)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Cart */}
      <div className="hidden lg:flex w-80 xl:w-96 bg-card rounded-xl shadow-card border flex-col shrink-0">
        <div className="p-4 border-b bg-gradient-to-r from-amber-500/5 to-transparent">
          <h2 className="font-heading font-semibold text-sm">🍸 Cuenta del Cliente</h2>
          <p className="text-[10px] text-muted-foreground">{totalItems} artículos</p>
        </div>
        <CartContent cart={cart} updateQty={updateQty} removeItem={removeItem} subtotal={subtotal} tax={tax} total={total} onCheckout={() => setPaymentOpen(true)} />
      </div>

      <PaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} cart={cart} subtotal={subtotal} tax={tax} total={total} onSaleComplete={handleSaleComplete} />
    </div>
  );
}
