import { AppLayout } from "@/components/AppLayout";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Package, Truck, Building2, Clock, Eye } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface OnlineOrder {
  id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string;
  delivery_type: string;
  delivery_address: string | null;
  status: string;
  subtotal: number;
  total: number;
  notes: string | null;
  created_at: string;
}

interface OrderItem {
  id: string;
  product_name: string;
  qty: number;
  price: number;
  total: number;
}

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "bg-yellow-100 text-yellow-700" },
  preparing: { label: "Preparando", color: "bg-blue-100 text-blue-700" },
  ready: { label: "Listo", color: "bg-emerald-100 text-emerald-700" },
  delivered: { label: "Entregado", color: "bg-gray-100 text-gray-700" },
  cancelled: { label: "Cancelado", color: "bg-red-100 text-red-700" },
};

const PedidosOnline = () => {
  const { t } = useTranslation();
  const tenantId = useTenant();
  const { toast } = useToast();
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<OnlineOrder | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [filterStatus, setFilterStatus] = useState("all");

  const fetchOrders = async () => {
    const { data } = await supabase
      .from("online_orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setOrders(data as OnlineOrder[]);
    setLoading(false);
  };

  useEffect(() => { fetchOrders(); }, []);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("online-orders-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "online_orders" }, () => fetchOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const viewDetails = async (order: OnlineOrder) => {
    setSelectedOrder(order);
    const { data } = await supabase
      .from("online_order_items")
      .select("*")
      .eq("order_id", order.id);
    if (data) setOrderItems(data as OrderItem[]);
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    const { error } = await supabase.from("online_orders").update({ status: newStatus } as any).eq("id", orderId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: `Pedido actualizado a: ${statusMap[newStatus]?.label}` });
    fetchOrders();
    if (selectedOrder?.id === orderId) {
      setSelectedOrder(prev => prev ? { ...prev, status: newStatus } : null);
    }
  };

  const filtered = filterStatus === "all" ? orders : orders.filter(o => o.status === filterStatus);

  return (
    <AppLayout title={t("nav.items.onlineOrders")}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(statusMap).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-xs">
            {filtered.length} pedido{filtered.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        <div className="bg-card rounded-xl shadow-card border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Fecha</TableHead>
                <TableHead className="text-xs">Cliente</TableHead>
                <TableHead className="text-xs">Teléfono</TableHead>
                <TableHead className="text-xs">Entrega</TableHead>
                <TableHead className="text-xs">Total</TableHead>
                <TableHead className="text-xs">Estado</TableHead>
                <TableHead className="text-xs w-32">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(order => {
                const st = statusMap[order.status] || statusMap.pending;
                return (
                  <TableRow key={order.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(order.created_at), "dd/MM/yy HH:mm")}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{order.customer_name}</TableCell>
                    <TableCell className="text-xs">{order.customer_phone}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] gap-1">
                        {order.delivery_type === "delivery" ? <Truck className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                        {order.delivery_type === "delivery" ? "Delivery" : "Recogida"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-bold">${order.total.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge className={`text-[10px] ${st.color}`}>{st.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => viewDetails(order)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {order.status === "pending" && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => updateStatus(order.id, "preparing")}>
                            Preparar
                          </Button>
                        )}
                        {order.status === "preparing" && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => updateStatus(order.id, "ready")}>
                            Listo
                          </Button>
                        )}
                        {order.status === "ready" && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => updateStatus(order.id, "delivered")}>
                            Entregado
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    {loading ? t("common.loading") : "No hay pedidos online"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle del Pedido</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Cliente</p>
                  <p className="font-medium">{selectedOrder.customer_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Teléfono</p>
                  <p className="font-medium">{selectedOrder.customer_phone}</p>
                </div>
                {selectedOrder.customer_email && (
                  <div>
                    <p className="text-muted-foreground text-xs">Email</p>
                    <p className="font-medium">{selectedOrder.customer_email}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground text-xs">Entrega</p>
                  <p className="font-medium">{selectedOrder.delivery_type === "delivery" ? "Delivery" : "Recogida"}</p>
                </div>
                {selectedOrder.delivery_address && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs">Dirección</p>
                    <p className="font-medium">{selectedOrder.delivery_address}</p>
                  </div>
                )}
                {selectedOrder.notes && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs">Notas</p>
                    <p className="font-medium">{selectedOrder.notes}</p>
                  </div>
                )}
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Producto</TableHead>
                      <TableHead className="text-xs text-center">Cant.</TableHead>
                      <TableHead className="text-xs text-right">Precio</TableHead>
                      <TableHead className="text-xs text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderItems.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="text-xs">{item.product_name}</TableCell>
                        <TableCell className="text-xs text-center">{item.qty}</TableCell>
                        <TableCell className="text-xs text-right">${item.price.toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right font-bold">${item.total.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-between items-center text-lg font-bold border-t pt-3">
                <span>Total</span>
                <span className="text-primary">${selectedOrder.total.toFixed(2)}</span>
              </div>

              <div className="flex gap-2">
                {selectedOrder.status !== "cancelled" && selectedOrder.status !== "delivered" && (
                  <Button variant="destructive" size="sm" onClick={() => { updateStatus(selectedOrder.id, "cancelled"); setSelectedOrder(null); }}>
                    Cancelar Pedido
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default PedidosOnline;
