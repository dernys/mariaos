import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, ChefHat, Check, Eye } from "lucide-react";

interface TableOrdersPanelProps {
  tableId: string;
  tableName: string;
}

interface OrderSummary {
  id: string;
  status: string;
  created_at: string;
  waiter_name: string | null;
  items: { product_name: string; quantity: number }[];
}

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  preparing: { label: "Preparando", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  ready: { label: "Listo", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  delivered: { label: "Entregado", color: "bg-muted text-muted-foreground" },
};

export function TableOrdersPanel({ tableId, tableName }: TableOrdersPanelProps) {
  const [orders, setOrders] = useState<OrderSummary[]>([]);

  useEffect(() => {
    const fetchOrders = async () => {
      const { data } = await supabase
        .from("kitchen_orders")
        .select("id, status, created_at, waiter_name")
        .eq("table_id", tableId)
        .in("status", ["pending", "preparing", "ready"])
        .order("created_at", { ascending: false });

      if (!data || data.length === 0) { setOrders([]); return; }

      const orderIds = data.map((o) => o.id);
      const { data: items } = await supabase
        .from("kitchen_order_items")
        .select("order_id, product_name, quantity")
        .in("order_id", orderIds);

      setOrders(data.map((o) => ({
        ...o,
        items: (items || []).filter((i) => i.order_id === o.id),
      })));
    };
    fetchOrders();

    const ch = supabase
      .channel(`table_orders_${tableId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_orders" }, fetchOrders)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tableId]);

  if (orders.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground italic">Sin órdenes activas</p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-heading font-bold text-muted-foreground uppercase tracking-wider">
        Órdenes activas ({orders.length})
      </p>
      {orders.map((order) => {
        const cfg = statusLabels[order.status] || statusLabels.pending;
        const elapsed = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
        return (
          <div key={order.id} className="bg-muted/30 rounded-lg p-2 space-y-1">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className={`text-[8px] px-1.5 h-4 ${cfg.color}`}>
                {cfg.label}
              </Badge>
              <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" /> {elapsed}min
              </span>
            </div>
            <div className="space-y-0.5">
              {order.items.map((item, i) => (
                <p key={i} className="text-[10px]">
                  <span className="font-bold text-primary">{item.quantity}×</span> {item.product_name}
                </p>
              ))}
            </div>
            {order.waiter_name && (
              <p className="text-[9px] text-muted-foreground">Mesero: {order.waiter_name}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
