import { AppLayout } from "@/components/AppLayout";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Minus, Trash2, CreditCard, Banknote, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CartItem {
  id: number;
  name: string;
  price: number;
  qty: number;
}

const products = [
  { id: 1, name: "Laptop HP 15.6\"", price: 1200, sku: "LAP-001", stock: 15 },
  { id: 2, name: "Mouse Logitech G502", price: 70, sku: "MOU-002", stock: 45 },
  { id: 3, name: "Monitor Samsung 27\"", price: 800, sku: "MON-003", stock: 8 },
  { id: 4, name: "Teclado Mecánico RGB", price: 80, sku: "TEC-004", stock: 32 },
  { id: 5, name: "Webcam HD 1080p", price: 70, sku: "WEB-005", stock: 20 },
  { id: 6, name: "Audífonos Bluetooth", price: 55, sku: "AUD-006", stock: 28 },
  { id: 7, name: "Hub USB-C 7 en 1", price: 45, sku: "HUB-007", stock: 50 },
  { id: 8, name: "SSD 1TB NVMe", price: 120, sku: "SSD-008", stock: 22 },
];

const POS = () => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");

  const addToCart = (product: typeof products[0]) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.id === product.id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [...prev, { id: product.id, name: product.name, price: product.price, qty: 1 }];
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

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout title="Punto de Venta">
      <div className="flex gap-4 h-[calc(100vh-8rem)]">
        {/* Products Grid */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar producto o SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 overflow-auto flex-1">
            {filtered.map((product) => (
              <motion.button
                key={product.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => addToCart(product)}
                className="bg-card rounded-xl p-4 shadow-card border text-left hover:shadow-elevated hover:border-primary/30 transition-all"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <span className="text-xs font-heading font-bold text-primary">
                    {product.sku.slice(0, 3)}
                  </span>
                </div>
                <p className="text-sm font-medium truncate">{product.name}</p>
                <p className="text-[10px] text-muted-foreground">{product.sku} · Stock: {product.stock}</p>
                <p className="text-lg font-heading font-bold mt-2 text-primary">${product.price}</p>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Cart */}
        <div className="w-80 xl:w-96 bg-card rounded-xl shadow-card border flex flex-col shrink-0">
          <div className="p-4 border-b">
            <h2 className="font-heading font-semibold text-sm">Carrito de Venta</h2>
            <p className="text-[10px] text-muted-foreground">{cart.length} productos</p>
          </div>

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
                    <p className="text-[10px] text-muted-foreground">${item.price} c/u</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQty(item.id, -1)}
                      className="h-6 w-6 rounded bg-background border flex items-center justify-center hover:bg-muted transition-colors"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="w-6 text-center text-xs font-heading font-bold">
                      {item.qty}
                    </span>
                    <button
                      onClick={() => updateQty(item.id, 1)}
                      className="h-6 w-6 rounded bg-background border flex items-center justify-center hover:bg-muted transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="text-xs font-heading font-bold w-16 text-right">
                    ${(item.price * item.qty).toLocaleString()}
                  </p>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            {cart.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <p className="text-sm">Carrito vacío</p>
                <p className="text-[10px]">Selecciona productos para vender</p>
              </div>
            )}
          </div>

          <div className="p-4 border-t space-y-3">
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-heading font-semibold">${subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA (16%)</span>
                <span className="font-heading font-semibold">${tax.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-base pt-2 border-t">
                <span className="font-heading font-bold">Total</span>
                <span className="font-heading font-bold text-primary">
                  ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" size="sm" className="text-xs gap-1">
                <Banknote className="h-3.5 w-3.5" /> Efectivo
              </Button>
              <Button variant="outline" size="sm" className="text-xs gap-1">
                <CreditCard className="h-3.5 w-3.5" /> Tarjeta
              </Button>
              <Button variant="outline" size="sm" className="text-xs gap-1">
                <QrCode className="h-3.5 w-3.5" /> QR
              </Button>
            </div>

            <Button className="w-full gradient-brand text-primary-foreground font-heading font-semibold" disabled={cart.length === 0}>
              Cobrar ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default POS;
