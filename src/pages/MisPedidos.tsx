import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Package, Truck, Building2, Star, MapPin, Plus, Trash2, Bike, Store as StoreIcon,
} from "lucide-react";
import { format } from "date-fns";
import { formatPrice } from "@/components/marketplace/types";
import { ORDER_STATUS } from "@/pages/PedidosOnline";

interface Order {
  id: string;
  tenant_id: string;
  status: string;
  delivery_type: string;
  delivery_address: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  payment_method: string;
  created_at: string;
  delivered_at: string | null;
  notes: string | null;
}

interface Address {
  id: string;
  label: string;
  address: string;
  instructions: string | null;
  is_default: boolean;
}

const MisPedidos = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Record<string, { product_name: string; qty: number; total: number }[]>>({});
  const [tenants, setTenants] = useState<Record<string, string>>({});
  const [assignments, setAssignments] = useState<Record<string, any>>({});
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [filter, setFilter] = useState("all");
  const [rating, setRating] = useState<{ order: Order; role: "rider" | "business" } | null>(null);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [addrForm, setAddrForm] = useState({ label: "Casa", address: "", instructions: "" });
  const [addrOpen, setAddrOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: ord } = await supabase
      .from("online_orders")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    const list = ((ord as any) || []) as Order[];
    setOrders(list);

    if (list.length) {
      const ids = list.map((o) => o.id);
      const [it, asg, tn] = await Promise.all([
        supabase.from("online_order_items").select("order_id,product_name,qty,total").in("order_id", ids),
        supabase.from("delivery_assignments").select("*").in("online_order_id", ids),
        supabase.from("tenants").select("id,name").in("id", Array.from(new Set(list.map((o) => o.tenant_id)))),
      ]);
      const grouped: Record<string, any[]> = {};
      ((it.data as any) || []).forEach((r: any) => (grouped[r.order_id] ||= []).push(r));
      setItems(grouped);
      const asgMap: Record<string, any> = {};
      ((asg.data as any) || []).forEach((a: any) => {
        if (!["cancelled", "rejected"].includes(a.status)) asgMap[a.online_order_id] = a;
      });
      setAssignments(asgMap);
      const tmap: Record<string, string> = {};
      ((tn.data as any) || []).forEach((x: any) => (tmap[x.id] = x.name));
      setTenants(tmap);
    }

    const { data: addr } = await supabase
      .from("customer_addresses" as any)
      .select("*")
      .order("is_default", { ascending: false });
    setAddresses(((addr as any) || []) as Address[]);
  }, [user]);

  useEffect(() => {
    if (!user) {
      navigate("/marketplace/acceso");
      return;
    }
    load();
  }, [user, load, navigate]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`my-orders-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "online_orders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_assignments" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, load]);

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    if (filter === "active") return orders.filter((o) => !["delivered", "cancelled"].includes(o.status));
    if (filter === "pickup") return orders.filter((o) => o.delivery_type === "pickup");
    if (filter === "delivery") return orders.filter((o) => o.delivery_type === "delivery");
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  const submitRating = async () => {
    if (!rating) return;
    const { error } = await supabase.rpc("rate_delivery" as any, {
      p_order_id: rating.order.id,
      p_rater_role: "customer",
      p_ratee_role: rating.role,
      p_stars: stars,
      p_criteria: {},
      p_comment: comment || null,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "¡Gracias por tu valoración!" });
    setRating(null);
    setComment("");
    setStars(5);
  };

  const saveAddress = async () => {
    if (!user || !addrForm.address.trim()) return;
    const { error } = await supabase.from("customer_addresses" as any).insert({
      user_id: user.id,
      label: addrForm.label || "Casa",
      address: addrForm.address.trim(),
      instructions: addrForm.instructions || null,
      is_default: addresses.length === 0,
    } as any);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setAddrOpen(false);
    setAddrForm({ label: "Casa", address: "", instructions: "" });
    load();
  };

  const makeDefault = async (id: string) => {
    if (!user) return;
    await supabase.from("customer_addresses" as any).update({ is_default: false } as any).eq("user_id", user.id);
    await supabase.from("customer_addresses" as any).update({ is_default: true } as any).eq("id", id);
    load();
  };

  const removeAddress = async (id: string) => {
    await supabase.from("customer_addresses" as any).delete().eq("id", id);
    load();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/70 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/marketplace" className="flex items-center gap-2 text-sm font-medium">
            <ArrowLeft className="h-4 w-4" /> Marketplace
          </Link>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => navigate("/marketplace/repartidor")}>
              <Bike className="h-4 w-4 mr-1" /> Quiero ser repartidor
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold">Mi cuenta</h1>

        <Tabs defaultValue="orders">
          <TabsList>
            <TabsTrigger value="orders">Mis pedidos</TabsTrigger>
            <TabsTrigger value="addresses">Direcciones</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="space-y-4 pt-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">En curso</SelectItem>
                  <SelectItem value="pickup">Recogidas</SelectItem>
                  <SelectItem value="delivery">Deliveries</SelectItem>
                  {Object.entries(ORDER_STATUS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="outline">{filtered.length} pedido(s)</Badge>
            </div>

            {filtered.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  Aún no tienes pedidos.
                </CardContent>
              </Card>
            )}

            {filtered.map((o) => {
              const st = ORDER_STATUS[o.status] || ORDER_STATUS.pending;
              const asg = assignments[o.id];
              return (
                <Card key={o.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          <StoreIcon className="h-4 w-4 text-primary" />
                          {tenants[o.tenant_id] ?? "Negocio"}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(o.created_at), "dd/MM/yy HH:mm")} ·{" "}
                          {o.delivery_type === "delivery" ? "Delivery" : "Recogida"}
                        </p>
                      </div>
                      <Badge className={`text-[10px] ${st.color}`}>{st.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="rounded-lg border divide-y">
                      {(items[o.id] || []).map((it, i) => (
                        <div key={i} className="flex justify-between p-2 text-xs">
                          <span>
                            {it.qty} × {it.product_name}
                          </span>
                          <span className="font-semibold">{formatPrice(Number(it.total))}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {o.delivery_address && (
                          <p className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {o.delivery_address}
                          </p>
                        )}
                        {o.delivery_type === "delivery" && (
                          <p className="flex items-center gap-1">
                            <Truck className="h-3 w-3" />
                            {asg
                              ? asg.status === "delivered"
                                ? `Entregado en ${asg.actual_minutes ?? "—"} min`
                                : asg.rider_profile_id
                                ? "Repartidor asignado · seguimiento activo"
                                : "Buscando repartidor"
                              : "Pendiente de preparación"}
                          </p>
                        )}
                        {o.delivery_type === "pickup" && (
                          <p className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" /> Recoges en el negocio
                          </p>
                        )}
                      </div>
                      <p className="font-bold text-primary">{formatPrice(Number(o.total))}</p>
                    </div>
                    {o.status === "delivered" && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={() => setRating({ order: o, role: "business" })}>
                          <Star className="h-3 w-3 mr-1" /> Valorar negocio
                        </Button>
                        {asg?.rider_profile_id && (
                          <Button size="sm" variant="outline" className="rounded-full text-xs" onClick={() => setRating({ order: o, role: "rider" })}>
                            <Bike className="h-3 w-3 mr-1" /> Valorar repartidor
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          <TabsContent value="addresses" className="space-y-3 pt-4">
            <Button size="sm" className="rounded-full" onClick={() => setAddrOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nueva dirección
            </Button>
            {addresses.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm flex items-center gap-2">
                      {a.label}
                      {a.is_default && <Badge className="text-[10px]">Principal</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">{a.address}</p>
                    {a.instructions && <p className="text-[11px] text-muted-foreground">{a.instructions}</p>}
                  </div>
                  <div className="flex gap-1">
                    {!a.is_default && (
                      <Button size="sm" variant="ghost" className="text-xs" onClick={() => makeDefault(a.id)}>
                        Hacer principal
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeAddress(a.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {addresses.length === 0 && (
              <p className="text-sm text-muted-foreground">Guarda tus direcciones para comprar más rápido.</p>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={addrOpen} onOpenChange={setAddrOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva dirección</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Etiqueta</Label>
              <Input value={addrForm.label} onChange={(e) => setAddrForm({ ...addrForm, label: e.target.value })} />
            </div>
            <div>
              <Label>Dirección *</Label>
              <Textarea value={addrForm.address} onChange={(e) => setAddrForm({ ...addrForm, address: e.target.value })} />
            </div>
            <div>
              <Label>Instrucciones de entrega</Label>
              <Textarea
                value={addrForm.instructions}
                onChange={(e) => setAddrForm({ ...addrForm, instructions: e.target.value })}
                placeholder="Ej: tocar el timbre 2B"
              />
            </div>
            <Button className="w-full rounded-full" onClick={saveAddress} disabled={!addrForm.address.trim()}>
              Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rating} onOpenChange={() => setRating(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{rating?.role === "rider" ? "Valorar al repartidor" : "Valorar al negocio"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-1 justify-center">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setStars(n)}>
                  <Star className={`h-7 w-7 ${n <= stars ? "text-amber-500 fill-amber-500" : "text-muted-foreground"}`} />
                </button>
              ))}
            </div>
            <Textarea
              placeholder={
                rating?.role === "rider"
                  ? "Puntualidad, trato, cuidado del pedido…"
                  : "Calidad, productos, preparación, atención…"
              }
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <Button className="w-full rounded-full" onClick={submitRating}>
              Enviar valoración
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MisPedidos;
