import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ShoppingCart, X, UtensilsCrossed, Soup, Fish, Salad, Cake, Wine, ChefHat, MapPin, SplitSquareVertical, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CartContent } from "./CartContent";
import { PaymentDialog } from "./PaymentDialog";
import { FloorMap } from "./FloorMap";
import { SplitBillDialog } from "./SplitBillDialog";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useToast } from "@/hooks/use-toast";

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
  notes?: string;
}

const categoryIcons: Record<string, typeof UtensilsCrossed> = {
  "Platos Principales": ChefHat,
  Mariscos: Fish,
  Entradas: Salad,
  Guarniciones: Soup,
  Postres: Cake,
  Bebidas: Wine,
};

const categoryColors: Record<string, string> = {
  "Platos Principales": "from-rose-500/20 to-red-500/10 border-rose-400/30",
  Mariscos: "from-blue-500/20 to-cyan-500/10 border-blue-400/30",
  Entradas: "from-green-500/20 to-emerald-500/10 border-green-400/30",
  Guarniciones: "from-purple-500/20 to-violet-500/10 border-purple-400/30",
  Postres: "from-pink-500/20 to-rose-500/10 border-pink-400/30",
  Bebidas: "from-orange-500/20 to-amber-500/10 border-orange-400/30",
};

export function POSRestaurant() {
  const { tenantId } = useTenantContext();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [splitBillOpen, setSplitBillOpen] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedTableName, setSelectedTableName] = useState("");
  const [posView, setPosView] = useState<"menu" | "tables">("menu");
  const [waiterName, setWaiterName] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from("employees").select("id, name").eq("tenant_id", tenantId).eq("is_active", true).order("name").then(({ data }) => {
      if (data) setEmployees(data);
    });
  }, [tenantId]);

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

  const handleSaleComplete = () => { setCart([]); setCartOpen(false); setSelectedTableId(null); setSelectedTableName(""); };

  const sendToKitchen = async () => {
    if (cart.length === 0) return;
    if (!tenantId) return;

    const { data: order, error } = await supabase.from("kitchen_orders").insert({
      tenant_id: tenantId,
      table_id: selectedTableId,
      table_name: selectedTableName || "Sin mesa",
      status: "pending",
      priority: "normal",
      waiter_name: waiterName || null,
      notes: orderNotes || null,
    }).select("id").single();

    if (error || !order) {
      toast({ title: "Error", description: "No se pudo crear la orden", variant: "destructive" });
      return;
    }

    const items = cart.map((item) => ({
      order_id: order.id,
      product_name: item.name,
      quantity: item.qty,
    }));

    await supabase.from("kitchen_order_items").insert(items);

    // Update table status if selected
    if (selectedTableId) {
      await supabase.from("restaurant_tables").update({
        status: "occupied",
        current_order_id: order.id,
        occupied_at: new Date().toISOString(),
      }).eq("id", selectedTableId);
    }

    toast({ title: "Comanda enviada", description: `${cart.length} platos enviados a cocina` });
  };

  const handleTableSelect = (table: any) => {
    setSelectedTableId(table.id);
    setSelectedTableName(table.name);
    setPosView("menu");
  };

  // Group by category
  const groupedByCategory = useMemo(() => {
    if (activeCategory !== "Todos") return null;
    const groups: Record<string, Product[]> = {};
    filtered.forEach((p) => {
      const cat = p.category || "Otros";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });
    return groups;
  }, [filtered, activeCategory]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-8rem)]">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Restaurant header */}
        <div className="bg-gradient-to-r from-rose-900/25 to-red-900/10 rounded-xl p-3 mb-3 border border-rose-500/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UtensilsCrossed className="h-5 w-5 text-rose-400" />
              <h2 className="font-heading font-bold text-sm">Comanda</h2>
              <Badge variant="outline" className="text-[10px] border-rose-500/30 text-rose-400">
                {products.length} platos
              </Badge>
            </div>
            {selectedTableName && (
              <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 text-xs">
                <MapPin className="h-3 w-3 mr-1" /> {selectedTableName}
              </Badge>
            )}
          </div>
        </div>

        {/* View tabs */}
        <Tabs value={posView} onValueChange={(v) => setPosView(v as "menu" | "tables")} className="mb-3">
          <TabsList className="w-full">
            <TabsTrigger value="menu" className="flex-1 text-xs gap-1.5">
              <UtensilsCrossed className="h-3.5 w-3.5" /> Menú
            </TabsTrigger>
            <TabsTrigger value="tables" className="flex-1 text-xs gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Mesas
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {posView === "tables" ? (
          <div className="overflow-auto flex-1 pb-20 lg:pb-0">
            <FloorMap onTableSelect={handleTableSelect} selectedTableId={selectedTableId} />
          </div>
        ) : (
          <>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar plato del menú..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-rose-500/10 focus-visible:border-rose-500/40" />
            </div>

            <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
              {categories.map((cat) => {
                const Icon = categoryIcons[cat];
                return (
                  <button key={cat} onClick={() => setActiveCategory(cat)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${activeCategory === cat ? "bg-rose-500 text-white shadow-md shadow-rose-500/25" : "bg-muted text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400"}`}>
                    {Icon && <Icon className="h-3 w-3" />}
                    {cat}
                  </button>
                );
              })}
            </div>

            <div className="overflow-auto flex-1 pb-20 lg:pb-0">
              {filtered.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <UtensilsCrossed className="h-10 w-10 mb-2 opacity-20" />
                  <p className="text-sm">No hay platos disponibles</p>
                </div>
              )}

              {groupedByCategory ? (
                <div className="space-y-4">
                  {Object.entries(groupedByCategory).map(([cat, items]) => {
                    const Icon = categoryIcons[cat] || UtensilsCrossed;
                    return (
                      <div key={cat}>
                        <div className="flex items-center gap-2 mb-2 px-1">
                          <Icon className="h-4 w-4 text-rose-400" />
                          <h3 className="text-xs font-heading font-bold text-rose-300/80 uppercase tracking-wider">{cat}</h3>
                          <div className="flex-1 h-px bg-rose-500/10" />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
                          {items.map((product) => {
                            const colors = categoryColors[product.category || ""] || "from-card to-rose-950/5 border-rose-500/10";
                            const inCart = cart.find((i) => i.productId === product.id);
                            return (
                              <motion.button key={product.id} whileTap={{ scale: 0.96 }} onClick={() => addToCart(product)} className={`relative bg-gradient-to-br ${colors} rounded-xl p-3 shadow-card border text-left hover:shadow-elevated transition-all`}>
                                {inCart && <span className="absolute top-2 right-2 h-5 w-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">{inCart.qty}</span>}
                                <p className="text-xs sm:text-sm font-medium truncate">{product.name}</p>
                                <p className="text-base font-heading font-bold mt-1 text-rose-400">${product.price}</p>
                              </motion.button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
                  {filtered.map((product) => {
                    const Icon = categoryIcons[product.category || ""] || UtensilsCrossed;
                    const colors = categoryColors[product.category || ""] || "from-card to-rose-950/5 border-rose-500/10";
                    const inCart = cart.find((i) => i.productId === product.id);
                    return (
                      <motion.button key={product.id} whileTap={{ scale: 0.96 }} onClick={() => addToCart(product)} className={`relative bg-gradient-to-br ${colors} rounded-xl p-3 sm:p-4 shadow-card border text-left hover:shadow-elevated transition-all`}>
                        {inCart && <span className="absolute top-2 right-2 h-5 w-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">{inCart.qty}</span>}
                        <div className="h-9 w-9 rounded-lg bg-rose-500/15 flex items-center justify-center mb-2">
                          <Icon className="h-4.5 w-4.5 text-rose-400" />
                        </div>
                        <p className="text-xs sm:text-sm font-medium truncate">{product.name}</p>
                        <p className="text-[10px] text-muted-foreground">{product.category}</p>
                        <p className="text-base sm:text-lg font-heading font-bold mt-1 text-rose-400">${product.price}</p>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Mobile FAB */}
      <div className="lg:hidden fixed bottom-4 right-4 z-50">
        <AnimatePresence>
          {!cartOpen && (
            <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} onClick={() => setCartOpen(true)} className="relative h-14 w-14 rounded-full bg-rose-500 shadow-elevated flex items-center justify-center text-white">
              <ShoppingCart className="h-6 w-6" />
              {totalItems > 0 && <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">{totalItems}</span>}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {cartOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCartOpen(false)} className="lg:hidden fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40" />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl shadow-elevated border-t max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h2 className="font-heading font-semibold text-sm">🍽️ Comanda {selectedTableName && `— ${selectedTableName}`}</h2>
                  <p className="text-[10px] text-muted-foreground">{totalItems} platos</p>
                </div>
                <button onClick={() => setCartOpen(false)} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
              </div>
              <CartContent cart={cart} updateQty={updateQty} removeItem={removeItem} subtotal={subtotal} tax={tax} total={total} onCheckout={() => setPaymentOpen(true)} taxLabel="Servicio (10%)" checkoutLabel="Enviar a Caja" extraActions={
                <div className="flex gap-2 mb-2">
                  <Button size="sm" variant="outline" className="flex-1 text-xs gap-1" onClick={sendToKitchen} disabled={cart.length === 0}>
                    <Send className="h-3 w-3" /> Enviar a Cocina
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 text-xs gap-1" onClick={() => setSplitBillOpen(true)} disabled={cart.length === 0}>
                    <SplitSquareVertical className="h-3 w-3" /> Dividir
                  </Button>
                </div>
              } />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Cart */}
      <div className="hidden lg:flex w-80 xl:w-96 bg-card rounded-xl shadow-card border flex-col shrink-0">
        <div className="p-4 border-b bg-gradient-to-r from-rose-500/10 to-transparent">
          <h2 className="font-heading font-semibold text-sm">🍽️ Comanda {selectedTableName && `— ${selectedTableName}`}</h2>
          <p className="text-[10px] text-muted-foreground">{totalItems} platos • ${subtotal.toLocaleString()} CUP</p>
        </div>
        <CartContent cart={cart} updateQty={updateQty} removeItem={removeItem} subtotal={subtotal} tax={tax} total={total} onCheckout={() => setPaymentOpen(true)} taxLabel="Servicio (10%)" checkoutLabel="Enviar a Caja" extraActions={
          <div className="flex gap-2 mb-2">
            <Button size="sm" variant="outline" className="flex-1 text-xs gap-1" onClick={sendToKitchen} disabled={cart.length === 0}>
              <Send className="h-3 w-3" /> Cocina
            </Button>
            <Button size="sm" variant="outline" className="flex-1 text-xs gap-1" onClick={() => setSplitBillOpen(true)} disabled={cart.length === 0}>
              <SplitSquareVertical className="h-3 w-3" /> Dividir
            </Button>
          </div>
        } />
      </div>

      <PaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} cart={cart} subtotal={subtotal} tax={tax} total={total} onSaleComplete={handleSaleComplete} />
      <SplitBillDialog open={splitBillOpen} onOpenChange={setSplitBillOpen} cart={cart} subtotal={subtotal} tax={tax} total={total} onSplitConfirm={(splits) => { toast({ title: "Cuenta dividida", description: `${splits.length} cuentas generadas` }); }} />
    </div>
  );
}
