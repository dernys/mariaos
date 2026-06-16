import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, ChefHat, Check, AlertTriangle, Play, Timer, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface KitchenOrder {
  id: string;
  table_name: string;
  table_id: string | null;
  status: string;
  priority: string;
  notes: string | null;
  waiter_name: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  items: KitchenOrderItem[];
}

interface KitchenOrderItem {
  id: string;
  product_name: string;
  quantity: number;
  notes: string | null;
  status: string;
}

const statusTabs = [
  { key: "pending", icon: Clock, color: "text-amber-400" },
  { key: "preparing", icon: ChefHat, color: "text-blue-400" },
  { key: "ready", icon: Check, color: "text-emerald-400" },
];

export function KitchenDisplay() {
  const { t } = useTranslation();
  const { tenantId } = useTenantContext();
  const { toast } = useToast();
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [activeTab, setActiveTab] = useState("pending");

  const fetchOrders = async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from("kitchen_orders")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "preparing", "ready"])
      .order("created_at", { ascending: true });

    if (!data) return;

    const orderIds = data.map((o) => o.id);
    const { data: items } = orderIds.length > 0
      ? await supabase.from("kitchen_order_items").select("*").in("order_id", orderIds)
      : { data: [] };

    const enriched: KitchenOrder[] = data.map((o) => ({
      ...o,
      items: (items || []).filter((i) => i.order_id === o.id) as KitchenOrderItem[],
    }));

    setOrders(enriched);
  };

  useEffect(() => {
    fetchOrders();
    const channel = supabase
      .channel("kitchen_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_orders" }, fetchOrders)
      .on("postgres_changes", { event: "*", schema: "public", table: "kitchen_order_items" }, fetchOrders)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId]);

  const updateOrderStatus = async (order: KitchenOrder, newStatus: string) => {
    const updates: Record<string, any> = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === "preparing") updates.started_at = new Date().toISOString();
    if (newStatus === "ready") updates.completed_at = new Date().toISOString();

    await supabase.from("kitchen_orders").update(updates as any).eq("id", order.id);

    // When order is ready, update table status to "served"
    if (newStatus === "ready" && order.table_id) {
      await supabase.from("restaurant_tables").update({ status: "served" }).eq("id", order.table_id);
    }

    // When delivered, update table to waiting_bill
    if (newStatus === "delivered" && order.table_id) {
      await supabase.from("restaurant_tables").update({ status: "waiting_bill" }).eq("id", order.table_id);
    }

    const labels: Record<string, string> = { preparing: t("pos.kitchen.toasts.preparing"), ready: t("pos.kitchen.toasts.ready"), delivered: t("pos.kitchen.toasts.delivered") };
    toast({ title: labels[newStatus] || t("pos.kitchen.toasts.updated"), description: order.table_name || t("pos.kitchen.noTable") });
    fetchOrders();
  };

  const getElapsed = (createdAt: string) => {
    const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    return diff < 60 ? `${diff}min` : `${Math.floor(diff / 60)}h ${diff % 60}m`;
  };

  const isLate = (createdAt: string) => {
    return (Date.now() - new Date(createdAt).getTime()) > 20 * 60000; // >20min
  };

  const filteredOrders = orders.filter((o) => o.status === activeTab);

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2">
        {statusTabs.map((tab) => {
          const count = orders.filter((o) => o.status === tab.key).length;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {t(`pos.kitchen.tabs.${tab.key}`)}
              {count > 0 && (
                <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  activeTab === tab.key ? "bg-primary-foreground/20" : "bg-foreground/10"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Orders grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        <AnimatePresence mode="popLayout">
          {filteredOrders.map((order) => {
            const late = isLate(order.created_at) && order.status !== "ready";
            return (
              <motion.div
                key={order.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`bg-card rounded-xl border shadow-card overflow-hidden ${
                  order.priority === "urgent" || late ? "border-destructive/50 ring-1 ring-destructive/20" : ""
                }`}
              >
                {/* Header */}
                <div className={`p-3 border-b flex items-center justify-between ${
                  order.priority === "urgent" || late ? "bg-destructive/10" : "bg-muted/30"
                }`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-heading font-bold text-sm">{order.table_name || t("pos.kitchen.noTable")}</h3>
                      {order.priority === "urgent" && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
                      {late && order.priority !== "urgent" && <Bell className="h-3.5 w-3.5 text-destructive animate-pulse" />}
                    </div>
                    {order.waiter_name && (
                      <p className="text-[10px] text-muted-foreground">{t("pos.kitchen.waiterLabel", { name: order.waiter_name })}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Timer className={`h-3 w-3 ${late ? "text-destructive" : ""}`} />
                    <span className={late ? "text-destructive font-bold" : ""}>{getElapsed(order.created_at)}</span>
                  </div>
                </div>

                {/* Items */}
                <div className="p-3 space-y-1.5">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-start gap-2">
                      <span className="font-heading font-bold text-sm text-primary w-5 shrink-0">
                        {item.quantity}×
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{item.product_name}</p>
                        {item.notes && (
                          <p className="text-[10px] text-amber-400 italic">⚠ {item.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                  {order.notes && (
                    <p className="text-[10px] text-muted-foreground italic border-t pt-1.5 mt-1.5">
                      📝 {order.notes}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="p-3 border-t">
                  {order.status === "pending" && (
                    <Button
                      size="sm"
                      className="w-full text-xs gap-1.5"
                      onClick={() => updateOrderStatus(order, "preparing")}
                    >
                      <Play className="h-3 w-3" /> {t("pos.kitchen.startPrep")}
                    </Button>
                  )}
                  {order.status === "preparing" && (
                    <Button
                      size="sm"
                      className="w-full text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => updateOrderStatus(order, "ready")}
                    >
                      <Check className="h-3 w-3" /> {t("pos.kitchen.markReady")}
                    </Button>
                  )}
                  {order.status === "ready" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs gap-1.5"
                      onClick={() => updateOrderStatus(order, "delivered")}
                    >
                      <Check className="h-3 w-3" /> {t("pos.kitchen.delivered")}
                    </Button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {filteredOrders.length === 0 && (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
          <ChefHat className="h-12 w-12 mb-3 opacity-20" />
          <p className="text-sm font-medium">{activeTab === "pending" ? t("pos.kitchen.emptyPending") : activeTab === "preparing" ? t("pos.kitchen.emptyPreparing") : t("pos.kitchen.emptyReady")}</p>
        </div>
      )}
    </div>
  );
}
