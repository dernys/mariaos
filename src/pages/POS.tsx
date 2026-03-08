import { AppLayout } from "@/components/AppLayout";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ShoppingCart, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CartContent } from "@/components/pos/CartContent";
import { PaymentDialog } from "@/components/pos/PaymentDialog";

interface CartItem {
  id: number;
  name: string;
  price: number;
  qty: number;
  sku?: string;
}

const products = [
  { id: 1, name: 'Laptop HP 15.6"', price: 1200, sku: "LAP-001", stock: 15, category: "Computadoras" },
  { id: 2, name: "Mouse Logitech G502", price: 70, sku: "MOU-002", stock: 45, category: "Periféricos" },
  { id: 3, name: 'Monitor Samsung 27"', price: 800, sku: "MON-003", stock: 8, category: "Monitores" },
  { id: 4, name: "Teclado Mecánico RGB", price: 80, sku: "TEC-004", stock: 32, category: "Periféricos" },
  { id: 5, name: "Webcam HD 1080p", price: 70, sku: "WEB-005", stock: 20, category: "Periféricos" },
  { id: 6, name: "Audífonos Bluetooth", price: 55, sku: "AUD-006", stock: 28, category: "Audio" },
  { id: 7, name: "Hub USB-C 7 en 1", price: 45, sku: "HUB-007", stock: 50, category: "Accesorios" },
  { id: 8, name: "SSD 1TB NVMe", price: 120, sku: "SSD-008", stock: 22, category: "Almacenamiento" },
  { id: 9, name: "Cable HDMI 2.1 2m", price: 25, sku: "CAB-009", stock: 100, category: "Accesorios" },
  { id: 10, name: "Base para Laptop", price: 35, sku: "BAS-010", stock: 18, category: "Accesorios" },
];

const categories = ["Todos", ...Array.from(new Set(products.map((p) => p.category)))];

const POS = () => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [cartOpen, setCartOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const addToCart = (product: (typeof products)[0]) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { id: product.id, name: product.name, price: product.price, qty: 1, sku: product.sku }];
    });
  };

  const updateQty = (id: number, delta: number) => {
    setCart((prev) => prev.map((i) => (i.id === id ? { ...i, qty: i.qty + delta } : i)).filter((i) => i.qty > 0));
  };

  const removeItem = (id: number) => setCart((prev) => prev.filter((i) => i.id !== id));

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const tax = subtotal * 0.16;
  const total = subtotal + tax;
  const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);

  const filtered = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCategory = activeCategory === "Todos" || p.category === activeCategory;
    return matchSearch && matchCategory;
  });

  const handleSaleComplete = () => {
    setCart([]);
    setCartOpen(false);
  };

  return (
    <AppLayout title="Punto de Venta">
      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-8rem)]">
        {/* Products Section */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar producto o SKU..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>

          <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  activeCategory === cat ? "gradient-brand text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 overflow-auto flex-1 pb-20 lg:pb-0">
            {filtered.map((product) => (
              <motion.button
                key={product.id}
                whileTap={{ scale: 0.96 }}
                onClick={() => addToCart(product)}
                className="bg-card rounded-xl p-3 sm:p-4 shadow-card border text-left hover:shadow-elevated hover:border-primary/30 transition-all active:bg-muted/30"
              >
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-heading font-bold text-primary">{product.sku.slice(0, 3)}</span>
                </div>
                <p className="text-xs sm:text-sm font-medium truncate">{product.name}</p>
                <p className="text-[10px] text-muted-foreground">Stock: {product.stock}</p>
                <p className="text-base sm:text-lg font-heading font-bold mt-1 sm:mt-2 text-primary">${product.price}</p>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Mobile Cart FAB */}
        <div className="lg:hidden fixed bottom-4 right-4 z-50">
          <AnimatePresence>
            {!cartOpen && (
              <motion.button
                initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                onClick={() => setCartOpen(true)}
                className="relative h-14 w-14 rounded-full gradient-brand shadow-elevated flex items-center justify-center text-primary-foreground"
              >
                <ShoppingCart className="h-6 w-6" />
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">{totalItems}</span>
                )}
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile Cart Sheet */}
        <AnimatePresence>
          {cartOpen && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setCartOpen(false)} className="lg:hidden fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40" />
              <motion.div
                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl shadow-elevated border-t max-h-[85vh] flex flex-col"
              >
                <div className="flex items-center justify-between p-4 border-b">
                  <div>
                    <h2 className="font-heading font-semibold text-sm">Carrito</h2>
                    <p className="text-[10px] text-muted-foreground">{totalItems} artículos</p>
                  </div>
                  <button onClick={() => setCartOpen(false)} className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <CartContent cart={cart} updateQty={updateQty} removeItem={removeItem} subtotal={subtotal} tax={tax} total={total} onCheckout={() => setPaymentOpen(true)} />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Desktop Cart */}
        <div className="hidden lg:flex w-80 xl:w-96 bg-card rounded-xl shadow-card border flex-col shrink-0">
          <div className="p-4 border-b">
            <h2 className="font-heading font-semibold text-sm">Carrito de Venta</h2>
            <p className="text-[10px] text-muted-foreground">{totalItems} artículos</p>
          </div>
          <CartContent cart={cart} updateQty={updateQty} removeItem={removeItem} subtotal={subtotal} tax={tax} total={total} onCheckout={() => setPaymentOpen(true)} />
        </div>
      </div>

      <PaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        cart={cart}
        subtotal={subtotal}
        tax={tax}
        total={total}
        onSaleComplete={handleSaleComplete}
      />
    </AppLayout>
  );
};

export default POS;
