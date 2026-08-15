import { useCallback, useEffect, useState } from "react";
import type { CartItem } from "@/components/marketplace/types";

const KEY = "maria.marketplace.cart.v1";

/**
 * Carrito del marketplace persistido en localStorage.
 * Sobrevive al login/registro para no perder la compra en curso.
 */
export const useMarketplaceCart = () => {
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(cart));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [cart]);

  const add = useCallback((item: Omit<CartItem, "qty">, qty = 1) => {
    setCart((prev) => {
      const found = prev.find((i) => i.id === item.id);
      if (found) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, qty: Math.min(i.qty + qty, i.online_stock ?? i.qty + qty) } : i
        );
      }
      return [...prev, { ...item, qty } as CartItem];
    });
  }, []);

  const updateQty = useCallback((id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.id !== id) return i;
          const max = i.online_stock ?? Infinity;
          return { ...i, qty: Math.min(Math.max(i.qty + delta, 0), max) };
        })
        .filter((i) => i.qty > 0)
    );
  }, []);

  const remove = useCallback((id: string) => setCart((prev) => prev.filter((i) => i.id !== id)), []);
  const clear = useCallback(() => setCart([]), []);

  return { cart, setCart, add, updateQty, remove, clear };
};
