import { AnimatePresence, motion } from "framer-motion";
import { Plus, Minus, Trash2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CartItem {
  id: number;
  name: string;
  price: number;
  qty: number;
}

interface CartContentProps {
  cart: CartItem[];
  updateQty: (id: number, delta: number) => void;
  removeItem: (id: number) => void;
  subtotal: number;
  tax: number;
  total: number;
  onCheckout: () => void;
}

export function CartContent({ cart, updateQty, removeItem, subtotal, tax, total, onCheckout }: CartContentProps) {
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
                <p className="text-[10px] text-muted-foreground">${item.price} c/u</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => updateQty(item.id, -1)} className="h-7 w-7 rounded bg-background border flex items-center justify-center hover:bg-muted transition-colors active:scale-95">
                  <Minus className="h-3 w-3" />
                </button>
                <span className="w-7 text-center text-xs font-heading font-bold">{item.qty}</span>
                <button onClick={() => updateQty(item.id, 1)} className="h-7 w-7 rounded bg-background border flex items-center justify-center hover:bg-muted transition-colors active:scale-95">
                  <Plus className="h-3 w-3" />
                </button>
              </div>
              <p className="text-xs font-heading font-bold w-16 text-right">${(item.price * item.qty).toLocaleString()}</p>
              <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
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
            <span className="font-heading font-semibold">${subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">IVA (16%)</span>
            <span className="font-heading font-semibold">${tax.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
          <div className="flex justify-between text-base pt-2 border-t">
            <span className="font-heading font-bold">Total</span>
            <span className="font-heading font-bold text-primary">${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        <Button
          onClick={onCheckout}
          className="w-full gradient-brand text-primary-foreground font-heading font-semibold h-11"
          disabled={cart.length === 0}
        >
          Cobrar ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </Button>
      </div>
    </>
  );
}
