import { AppLayout } from "@/components/AppLayout";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Package, Truck, Building2, Eye, Bike, CheckCircle2, ShoppingBag, Ban, Receipt, Pencil, Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { RiderRecommendationDialog } from "@/components/delivery/RiderRecommendationDialog";
import { OrderTimeline } from "@/components/delivery/OrderTimeline";
import { OrderEditDialog, type EditableOrder } from "@/components/delivery/OrderEditDialog";
import { useModuleSettings } from "@/hooks/useModuleSettings";
import { DELIVERY_DEFAULTS, type DeliverySettings } from "@/components/config/ConfigDelivery";


interface OnlineOrder {
  id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
  delivery_type: string;
  delivery_address: string | null;
  delivery_instructions: string | null;
  payment_method: string;
  delivery_fee: number;
  status: string;
  subtotal: number;
  total: number;
  notes: string | null;
  created_at: string;
  sale_id: string | null;
  customer_id: string | null;
}

interface OrderItem {
  id: string;
  product_name: string;
  qty: number;
  price: number;
  total: number;
}

interface AssignmentRow {
  id: string;
  online_order_id: string;
  status: string;
  rider_profile_id: string | null;
  estimated_minutes: number | null;
  actual_minutes: number | null;
}

export const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "bg-amber-500/15 text-amber-600" },
  confirmed: { label: "Confirmado", color: "bg-primary/15 text-primary" },
  preparing: { label: "En preparación", color: "bg-blue-500/15 text-blue-500" },
  ready: { label: "Listo", color: "bg-emerald-500/15 text-emerald-500" },
  rider_assigned: { label: "Repartidor asignado", color: "bg-indigo-500/15 text-indigo-400" },
  in_transit: { label: "En camino", color: "bg-cyan-500/15 text-cyan-500" },
  delivered: { label: "Entregado", color: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelado", color: "bg-destructive/15 text-destructive" },
};

const DELIVERY_STATUS: Record<string, string> = {
  pending: "Sin repartidor",
  assigned: "Asignado",
  accepted: "Aceptado",
  rejected: "Rechazado",
  picked_up: "Recogido",
  in_transit: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const PAYMENT_LABEL: Record<string, string> = {
  cash_on_delivery: "Efectivo al recibir",
  cash_on_pickup: "Efectivo al recoger",
  transfer: "Transferencia",
  card: "Tarjeta",
};

const PedidosOnline = () => {
  const { t } = useTranslation();
  const tenantId = useTenant();
  const { toast } = useToast();
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<OnlineOrder | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [search, setSearch] = useState("");
  const [recOrderId, setRecOrderId] = useState<string | null>(null);
  const [reassignOrderId, setReassignOrderId] = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState<EditableOrder | null>(null);
  const [timelineKey, setTimelineKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const { settings: dsettings } = useModuleSettings<DeliverySettings>("delivery", DELIVERY_DEFAULTS);


  const fetchOrders = useCallback(async () => {
    if (!tenantId) return;
    const [o, a] = await Promise.all([
      supabase
        .from("online_orders")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("delivery_assignments")
        .select("id,online_order_id,status,rider_profile_id,estimated_minutes,actual_minutes")
        .eq("tenant_id", tenantId)
        .limit(300),
    ]);
    setOrders(((o.data as any) || []) as OnlineOrder[]);
    setAssignments(((a.data as any) || []) as AssignmentRow[]);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`online-orders-rt-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "online_orders" }, () => fetchOrders())
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_assignments" }, () => fetchOrders())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, fetchOrders]);

  const assignmentByOrder = useMemo(() => {
    const m: Record<string, AssignmentRow> = {};
    assignments.forEach((a) => {
      if (!["cancelled", "rejected"].includes(a.status)) m[a.online_order_id] = a;
    });
    return m;
  }, [assignments]);

  const kpis = useMemo(() => {
    const active = orders.filter((o) => !["delivered", "cancelled"].includes(o.status));
    return {
      nuevos: orders.filter((o) => o.status === "pending").length,
      preparando: orders.filter((o) => o.status === "preparing").length,
      listos: orders.filter((o) => o.status === "ready").length,
      enDelivery: orders.filter((o) => ["rider_assigned", "in_transit"].includes(o.status)).length,
      entregados: orders.filter((o) => o.status === "delivered").length,
      cancelados: orders.filter((o) => o.status === "cancelled").length,
      importeActivo: active.reduce((s, o) => s + Number(o.total || 0), 0),
      sinRepartidor: orders.filter(
        (o) => o.delivery_type === "delivery" && !["delivered", "cancelled"].includes(o.status) && !assignmentByOrder[o.id]?.rider_profile_id
      ).length,
    };
  }, [orders, assignmentByOrder]);

  const viewDetails = async (order: OnlineOrder) => {
    setSelectedOrder(order);
    const { data } = await supabase.from("online_order_items").select("*").eq("order_id", order.id);
    setOrderItems(((data as any) || []) as OrderItem[]);
  };

  const confirmOrder = async (order: OnlineOrder) => {
    setBusy(order.id);
    const payments =
      order.payment_method === "transfer" || order.payment_method === "card"
        ? [{ method: order.payment_method, currency: "CUP", amount: Number(order.total), exchange_rate: 1 }]
        : [];
    const { error } = await supabase.rpc("confirm_online_order" as any, {
      p_order_id: order.id,
      p_payments: payments,
    });
    setBusy(null);
    if (error) {
      toast({ title: "No se pudo confirmar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Pedido confirmado", description: "Se generó la venta ONLINE asociada." });
    fetchOrders();
  };

  const setStatus = async (order: OnlineOrder, status: string, reason?: string) => {
    setBusy(order.id);
    const { error } = await supabase.rpc("set_online_order_status" as any, {
      p_order_id: order.id,
      p_status: status,
      p_reason: reason ?? null,
    });
    setBusy(null);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Pedido: ${ORDER_STATUS[status]?.label ?? status}` });
    fetchOrders();
    setTimelineKey((k) => k + 1);
    if (selectedOrder?.id === order.id) setSelectedOrder({ ...selectedOrder, status });
  };

  const autoAssign = async (order: OnlineOrder) => {
    setBusy(order.id);
    const { data, error } = await (supabase.rpc as any)("auto_assign_best_rider", { p_order_id: order.id });
    setBusy(null);
    if (error) return toast({ title: "No se pudo asignar", description: error.message, variant: "destructive" });
    const res = data as any;
    if (!res?.assigned) {
      return toast({ title: "Sin repartidores disponibles", description: res?.reason ?? "Intenta más tarde o asigna manualmente.", variant: "destructive" });
    }
    toast({ title: `Asignado a ${res.rider_name}`, description: `Compatibilidad ${Number(res.score).toFixed(0)} · debe aceptar la entrega.` });
    fetchOrders();
    setTimelineKey((k) => k + 1);
  };

  const cancelDelivery = async (order: OnlineOrder) => {
    const reason = window.prompt("Motivo de cancelación de la entrega:") ?? undefined;
    setBusy(order.id);
    const { error } = await (supabase.rpc as any)("cancel_delivery_assignment", { p_order_id: order.id, p_reason: reason || null });
    setBusy(null);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Entrega cancelada", description: "El pedido volvió al estado Listo." });
    fetchOrders();
    setTimelineKey((k) => k + 1);
  };


  const filtered = orders.filter((o) => {
    if (filterStatus !== "all" && o.status !== filterStatus) return false;
    if (filterType !== "all" && o.delivery_type !== filterType) return false;
    const q = search.trim().toLowerCase();
    if (q && !o.customer_name.toLowerCase().includes(q) && !(o.customer_phone || "").includes(q)) return false;
    return true;
  });

  return (
    <AppLayout title={t("nav.items.onlineOrders")}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          {[
            { label: "Nuevos", value: kpis.nuevos },
            { label: "En preparación", value: kpis.preparando },
            { label: "Listos", value: kpis.listos },
            { label: "En delivery", value: kpis.enDelivery },
            { label: "Sin repartidor", value: kpis.sinRepartidor },
            { label: "Entregados", value: kpis.entregados },
            { label: "Cancelados", value: kpis.cancelados },
          ].map((k) => (
            <Card key={k.label}>
              <CardContent className="p-3">
                <p className="text-[11px] text-muted-foreground">{k.label}</p>
                <p className="text-xl font-bold">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Input
            placeholder="Buscar cliente o teléfono"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[190px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {Object.entries(ORDER_STATUS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="Modalidad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="pickup">Recogida</SelectItem>
              <SelectItem value="delivery">Delivery</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-xs">
            {filtered.length} pedido{filtered.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        <div className="bg-card rounded-xl shadow-card border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Fecha</TableHead>
                <TableHead className="text-xs">Cliente</TableHead>
                <TableHead className="text-xs">Modalidad</TableHead>
                <TableHead className="text-xs">Pago</TableHead>
                <TableHead className="text-xs">Total</TableHead>
                <TableHead className="text-xs">Estado</TableHead>
                <TableHead className="text-xs">Entrega</TableHead>
                <TableHead className="text-xs">Venta</TableHead>
                <TableHead className="text-xs w-56">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((order) => {
                const st = ORDER_STATUS[order.status] || ORDER_STATUS.pending;
                const asg = assignmentByOrder[order.id];
                return (
                  <TableRow key={order.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(order.created_at), "dd/MM/yy HH:mm")}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {order.customer_name}
                      <span className="block text-[10px] text-muted-foreground">{order.customer_phone}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] gap-1">
                        {order.delivery_type === "delivery" ? <Truck className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                        {order.delivery_type === "delivery" ? "Delivery" : "Recogida"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {PAYMENT_LABEL[order.payment_method] ?? order.payment_method}
                    </TableCell>
                    <TableCell className="text-xs font-bold">${Number(order.total).toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${st.color}`}>{st.label}</Badge>
                    </TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {order.delivery_type === "delivery" ? DELIVERY_STATUS[asg?.status ?? "pending"] : "—"}
                    </TableCell>
                    <TableCell className="text-[11px]">
                      {order.sale_id ? (
                        <Link to={`/ventas/${order.sale_id}`} className="text-primary hover:underline flex items-center gap-1">
                          <Receipt className="h-3 w-3" /> ONLINE
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Ver detalle" onClick={() => viewDetails(order)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {!["delivered", "cancelled"].includes(order.status) && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Editar pedido" onClick={() => setEditOrder(order as EditableOrder)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {!order.sale_id && order.status !== "cancelled" && (
                          <Button
                            size="sm"
                            className="h-7 text-[10px]"
                            disabled={busy === order.id}
                            onClick={() => confirmOrder(order)}
                          >
                            <ShoppingBag className="h-3 w-3 mr-1" /> Confirmar venta
                          </Button>
                        )}
                        {order.sale_id && ["confirmed"].includes(order.status) && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setStatus(order, "preparing")}>
                            Preparar
                          </Button>
                        )}
                        {order.status === "preparing" && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setStatus(order, "ready")}>
                            Listo
                          </Button>
                        )}
                        {order.status === "ready" && order.delivery_type === "delivery" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setRecOrderId(order.id)}>
                              <Bike className="h-3 w-3 mr-1" /> Repartidor
                            </Button>
                            <Button
                              size="sm"
                              variant={dsettings.auto_assign ? "default" : "ghost"}
                              className="h-7 text-[10px]"
                              disabled={busy === order.id}
                              title="Asignar automáticamente el mejor repartidor"
                              onClick={() => autoAssign(order)}
                            >
                              {busy === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                            </Button>
                          </>
                        )}
                        {["rider_assigned", "in_transit"].includes(order.status) && (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 text-[10px]" title="Reasignar repartidor" onClick={() => setReassignOrderId(order.id)}>
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[10px]" title="Cancelar entrega" disabled={busy === order.id} onClick={() => cancelDelivery(order)}>
                              <Ban className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setStatus(order, "delivered")}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Entregado
                            </Button>
                          </>
                        )}
                        {order.status === "ready" && order.delivery_type === "pickup" && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setStatus(order, "delivered")}>
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Entregado
                          </Button>
                        )}

                        {!["delivered", "cancelled"].includes(order.status) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[10px] text-destructive"
                            onClick={() => setStatus(order, "cancelled", "Cancelado por el negocio")}
                          >
                            <Ban className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    {loading ? t("common.loading") : "No hay pedidos online"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <RiderRecommendationDialog
        orderId={recOrderId}
        onOpenChange={(v) => !v && setRecOrderId(null)}
        onAssigned={() => { fetchOrders(); setTimelineKey((k) => k + 1); }}
      />

      <RiderRecommendationDialog
        orderId={reassignOrderId}
        reassign
        onOpenChange={(v) => !v && setReassignOrderId(null)}
        onAssigned={() => { fetchOrders(); setTimelineKey((k) => k + 1); }}
      />

      <OrderEditDialog
        order={editOrder}
        onOpenChange={(v) => !v && setEditOrder(null)}
        onSaved={() => { fetchOrders(); setTimelineKey((k) => k + 1); }}
      />

      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-lg max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle del pedido</DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs">Cliente</p>
                  <p className="font-medium">{selectedOrder.customer_name}</p>
                  <p className="text-xs text-muted-foreground">{selectedOrder.customer_phone}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Estado</p>
                  <Badge className={`text-[10px] ${(ORDER_STATUS[selectedOrder.status] || ORDER_STATUS.pending).color}`}>
                    {(ORDER_STATUS[selectedOrder.status] || ORDER_STATUS.pending).label}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Modalidad</p>
                  <p>{selectedOrder.delivery_type === "delivery" ? "Delivery" : "Recogida en el negocio"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Pago</p>
                  <p>{PAYMENT_LABEL[selectedOrder.payment_method] ?? selectedOrder.payment_method}</p>
                </div>
              </div>
              {selectedOrder.delivery_address && (
                <div>
                  <p className="text-muted-foreground text-xs">Dirección de entrega</p>
                  <p>{selectedOrder.delivery_address}</p>
                  {selectedOrder.delivery_instructions && (
                    <p className="text-xs text-muted-foreground">{selectedOrder.delivery_instructions}</p>
                  )}
                </div>
              )}
              <div className="rounded-xl border divide-y">
                {orderItems.map((it) => (
                  <div key={it.id} className="flex justify-between p-2 text-xs">
                    <span>
                      {it.qty} × {it.product_name}
                    </span>
                    <span className="font-semibold">${Number(it.total).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>${Number(selectedOrder.subtotal).toFixed(2)}</span>
                </div>
                {Number(selectedOrder.delivery_fee) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Envío</span>
                    <span>${Number(selectedOrder.delivery_fee).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span className="text-primary">${Number(selectedOrder.total).toFixed(2)}</span>
                </div>
              </div>
              {selectedOrder.notes && <p className="text-xs text-muted-foreground">Nota: {selectedOrder.notes}</p>}

              <div className="flex flex-wrap gap-2">
                {!["delivered", "cancelled"].includes(selectedOrder.status) && (
                  <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setEditOrder(selectedOrder as EditableOrder)}>
                    <Pencil className="h-3 w-3" /> Editar pedido
                  </Button>
                )}
                {selectedOrder.delivery_type === "delivery" && !["delivered", "cancelled"].includes(selectedOrder.status) && (
                  <>
                    <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setRecOrderId(selectedOrder.id)}>
                      <Bike className="h-3 w-3" /> Sugerir repartidor
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => autoAssign(selectedOrder)}>
                      <Sparkles className="h-3 w-3" /> Asignación automática
                    </Button>
                  </>
                )}
              </div>

              <div className="border-t pt-3">
                <OrderTimeline orderId={selectedOrder.id} refreshKey={timelineKey} />
              </div>
            </div>

          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default PedidosOnline;
