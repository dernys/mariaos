import { AppLayout } from "@/components/AppLayout";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  QrCode,
  ShoppingCart,
  X,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CartItem {
  id: number;
  name: string;
  price: number;
  qty: number;
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

  const addToCart = (product: (typeof products)[0]) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [
        ...prev,
        { id: product.id, name: product.name, price: product.price, qty: 1 },
      ];
    });
  };

  const updateQty = (id: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const removeItem = (id: number) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  };

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const tax = subtotal * 0.16;
  const total = subtotal + tax;
  const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);

  const filtered = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCategory =
      activeCategory === "Todos" || p.category === activeCategory;
    return matchSearch && matchCategory;
  });

  return (
    <AppLayout title="Punto de Venta">
      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-8rem)]">
        {/* Products Section */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar producto o SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Categories */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  activeCategory === cat
                    ? "gradient-brand text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Products Grid — mobile 2 cols, scales up */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 overflow-auto flex-1 pb-20 lg:pb-0">
            {filtered.map((product) => (
              <motion.button
                key={product.id}
                whileTap={{ scale: 0.96 }}
                onClick={() => addToCart(product)}
                className="bg-card rounded-xl p-3 sm:p-4 shadow-card border text-left hover:shadow-elevated hover:border-primary/30 transition-all active:bg-muted/30"
              >
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2 sm:mb-3">
                  <span className="text-[10px] sm:text-xs font-heading font-bold text-primary">
                    {product.sku.slice(0, 3)}
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-medium truncate">
                  {product.name}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Stock: {product.stock}
                </p>
                <p className="text-base sm:text-lg font-heading font-bold mt-1 sm:mt-2 text-primary">
                  ${product.price}
                </p>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Mobile Cart FAB */}
        <div className="lg:hidden fixed bottom-4 right-4 z-50">
          <AnimatePresence>
            {!cartOpen && (
              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                onClick={() => setCartOpen(true)}
                className="relative h-14 w-14 rounded-full gradient-brand shadow-elevated flex items-center justify-center text-primary-foreground"
              >
                <ShoppingCart className="h-6 w-6" />
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
                    {totalItems}
                  </span>
                )}
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile Cart Sheet */}
        <AnimatePresence>
          {cartOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setCartOpen(false)}
                className="lg:hidden fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40"
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-2xl shadow-elevated border-t max-h-[85vh] flex flex-col"
              >
                <div className="flex items-center justify-between p-4 border-b">
                  <div>
                    <h2 className="font-heading font-semibold text-sm">
                      Carrito
                    </h2>
                    <p className="text-[10px] text-muted-foreground">
                      {totalItems} artículos
                    </p>
                  </div>
                  <button
                    onClick={() => setCartOpen(false)}
                    className="h-8 w-8 rounded-full bg-muted flex items-center justify-center"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <CartContent
                  cart={cart}
                  updateQty={updateQty}
                  removeItem={removeItem}
                  subtotal={subtotal}
                  tax={tax}
                  total={total}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Desktop Cart */}
        <div className="hidden lg:flex w-80 xl:w-96 bg-card rounded-xl shadow-card border flex-col shrink-0">
          <div className="p-4 border-b">
            <h2 className="font-heading font-semibold text-sm">
              Carrito de Venta
            </h2>
            <p className="text-[10px] text-muted-foreground">
              {totalItems} artículos
            </p>
          </div>
          <CartContent
            cart={cart}
            updateQty={updateQty}
            removeItem={removeItem}
            subtotal={subtotal}
            tax={tax}
            total={total}
          />
        </div>
      </div>
    </AppLayout>
  );
};

function CartContent({
  cart,
  updateQty,
  removeItem,
  subtotal,
  tax,
  total,
}: {
  cart: CartItem[];
  updateQty: (id: number, delta: number) => void;
  removeItem: (id: number) => void;
  subtotal: number;
  tax: number;
  total: number;
}) {
  return (
    <>
      <div className="flex-1 overflow-auto p-4 space-y-2">
        <AnimatePresence>
          {cart.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex items-center gap-3 bg-muted/40 rounded-lg p-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{item.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  ${item.price} c/u
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => updateQty(item.id, -1)}
                  className="h-7 w-7 rounded bg-background border flex items-center justify-center hover:bg-muted transition-colors active:scale-95"
                >
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-7 text-center text-xs font-heading font-bold">
                  {item.qty}
                </span>
                <button
                  onClick={() => updateQty(item.id, 1)}
                  className="h-7 w-7 rounded bg-background border flex items-center justify-center hover:bg-muted transition-colors active:scale-95"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <p className="text-xs font-heading font-bold w-16 text-right">
                ${(item.price * item.qty).toLocaleString()}
              </p>
              <button
                onClick={() => removeItem(item.id)}
                className="text-muted-foreground hover:text-destructive transition-colors p-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
        {cart.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <ShoppingCart className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">Carrito vacío</p>
            <p className="text-[10px]">Selecciona productos para vender</p>
          </div>
        )}
      </div>

      <div className="p-4 border-t space-y-3">
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-heading font-semibold">
              ${subtotal.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">IVA (16%)</span>
            <span className="font-heading font-semibold">
              $
              {tax.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="flex justify-between text-base pt-2 border-t">
            <span className="font-heading font-bold">Total</span>
            <span className="font-heading font-bold text-primary">
              $
              {total.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1 h-9"
          >
            <Banknote className="h-3.5 w-3.5" /> Efectivo
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1 h-9"
          >
            <CreditCard className="h-3.5 w-3.5" /> Tarjeta
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1 h-9"
          >
            <QrCode className="h-3.5 w-3.5" /> QR
          </Button>
        </div>

        <Button
          className="w-full gradient-brand text-primary-foreground font-heading font-semibold h-11"
          disabled={cart.length === 0}
        >
          Cobrar $
          {total.toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })}
        </Button>
      </div>
    </>
  );
}

export default POS;
