import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, ChefHat, Check, Receipt, Plus, Ban, Truck, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export interface OpenOrderItem {
  id: string;
  product_id: string | null;
  product_name: string;
  sku: string | null;
  quantity: number;
  unit_price: number;
  notes: string | null;
}

export interface OpenOrder {
  id: string;
  order_code: string | null;
  table_id: string | null;
  table_name: string | null;
  status: string;
  waiter_name: string | null;
  notes: string | null;
  created_at: string;
  items: OpenOrderItem[];
}

const OPEN_STATES = ["pending", "preparing", "ready", "delivered"];

const statusStyles: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  preparing: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  ready: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  delivered: "bg-muted text-muted-foreground",
};

const statusLabels: Record<string, string> = {
  pending: "En cola",
  preparing: "En preparación",
  ready: "Lista",
  delivered: "Entregada",
};

interface Props {
  /** Carga la orden en el carro para cobrarla (o para modificarla). */
  onCharge: (order: OpenOrder) => void;
  onAddItems?: (order: OpenOrder) => void;
  compact?: boolean;
}

export function useOpenOrders() {
  const { tenantId } = useTenantContext();
  const [orders, setOrders] = useState<OpenOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("kitchen_orders")
      .select("id, order_code, table_id, table_name, status, waiter_name, notes, created_at")
      .eq("tenant_id", tenantId)
      .in("status", OPEN_STATES)
      .order("created_at", { ascending: true });

    const ids = (data ?? []).map((o) => o.id);
    const { data: items } = ids.length
      ? await supabase
          .from("kitchen_order_items")
          .select("id, order_id, product_id, product_name, sku, quantity, unit_price, notes")
          .in("order_id", ids)
      : { data: [] as any[] };

    setOrders(
      (data ?? []).map((o) => ({
        ...(o as any),
        items: ((items ?? []) as any[]).filter((i) => i.order_id === o.id),
      })),
    );
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    load();
    if (!tenantId) return;
    const ch = supabase
      .channel(`open_orders_${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_orders" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_order_items" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId, load]);

  return { orders, loading, reload: load };
}

export function OpenOrdersPanel({ onCharge, onAddItems, compact }: Props) {
  const { orders, loading, reload } = useOpenOrders();

  const cancelOrder = async (order: OpenOrder) => {
    if (!confirm(`¿Cancelar la orden ${order.order_code || order.table_name || ""}?`)) return;
    const { error } = await supabase.from("kitchen_orders").update({ status: "cancelled" }).eq("id", order.id);
    if (error) { toast.error(error.message); return; }
    if (order.table_id) {
      await supabase.from("restaurant_tables").update({ status: "available", current_order_id: null, occupied_at: null }).eq("id", order.table_id);
    }
    toast.success("Orden cancelada");
    reload();
  };

  const markDelivered = async (order: OpenOrder) => {
    const { error } = await supabase.from("kitchen_orders").update({ status: "delivered" }).eq("id", order.id);
    if (error) { toast.error(error.message); return; }
    reload();
  };

  if (loading) return <p className="text-xs text-muted-foreground p-2">Cargando órdenes…</p>;

  if (orders.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          <ChefHat className="h-8 w-8 mx-auto mb-2 opacity-30" />
          No hay órdenes abiertas. Las órdenes enviadas a cocina aparecen aquí hasta que se cobran.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{orders.length} orden(es) pendientes de cobro</p>
        <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={reload}>
          <RefreshCw className="h-3 w-3" /> Actualizar
        </Button>
      </div>
      <div className={compact ? "space-y-2" : "grid gap-3 md:grid-cols-2 xl:grid-cols-3"}>
        {orders.map((o) => {
          const total = o.items.reduce((s, i) => s + Number(i.unit_price || 0) * Number(i.quantity || 0), 0);
          const mins = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000);
          return (
            <Card key={o.id} className="border-border/60">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-heading font-bold truncate">
                      {o.table_name || "Sin mesa"} {o.order_code && <span className="text-muted-foreground">· {o.order_code}</span>}
                    </p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" /> {mins} min {o.waiter_name && `· ${o.waiter_name}`}
                    </p>
                  </div>
                  <Badge variant="outline" className={`text-[9px] ${statusStyles[o.status] || ""}`}>
                    {statusLabels[o.status] || o.status}
                  </Badge>
                </div>

                <div className="space-y-0.5 max-h-32 overflow-auto">
                  {o.items.map((i) => (
                    <div key={i.id} className="flex justify-between text-[10px]">
                      <span className="truncate">
                        {i.quantity}× {i.product_name}
                        {i.notes && <span className="text-amber-400 italic"> — {i.notes}</span>}
                      </span>
                      <span className="font-medium">${(Number(i.unit_price) * Number(i.quantity)).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                {o.notes && <p className="text-[10px] italic text-muted-foreground">Nota: {o.notes}</p>}

                <div className="flex items-center justify-between border-t pt-2">
                  <span className="text-xs font-heading font-bold">${total.toFixed(2)}</span>
                  <div className="flex gap-1">
                    {o.status !== "delivered" && (
                      <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1" onClick={() => markDelivered(o)}>
                        <Truck className="h-3 w-3" /> Entregada
                      </Button>
                    )}
                    {onAddItems && (
                      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => onAddItems(o)}>
                        <Plus className="h-3 w-3" /> Añadir
                      </Button>
                    )}
                    <Button size="sm" className="h-7 text-[10px] gap-1" onClick={() => onCharge(o)}>
                      <Receipt className="h-3 w-3" /> Cobrar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => cancelOrder(o)}>
                      <Ban className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
