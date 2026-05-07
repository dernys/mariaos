import { AppLayout } from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MapPin, Bike, Truck, Plus } from "lucide-react";

interface Zone { id: string; name: string; fee: number; estimated_minutes: number; is_active: boolean; }
interface Rider { id: string; name: string; phone: string | null; vehicle: string | null; is_available: boolean; is_active: boolean; }
interface Assignment { id: string; status: string; assigned_at: string; online_order_id: string; rider_id: string | null; delivery_riders?: { name: string }; online_orders?: { customer_name: string; total: number; delivery_address: string | null }; }
interface Order { id: string; customer_name: string; total: number; status: string; delivery_address: string | null; delivery_type: string; }

const STATUS_LABELS: Record<string, string> = {
  assigned: "Asignado", picked_up: "Recogido", on_the_way: "En camino", delivered: "Entregado", failed: "Fallido",
};

export default function Delivery() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const [zones, setZones] = useState<Zone[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);

  const [zoneDialog, setZoneDialog] = useState(false);
  const [zoneForm, setZoneForm] = useState({ name: "", fee: "0", estimated_minutes: "30" });
  const [riderDialog, setRiderDialog] = useState(false);
  const [riderForm, setRiderForm] = useState({ name: "", phone: "", vehicle: "moto" });
  const [assignDialog, setAssignDialog] = useState<Order | null>(null);
  const [assignForm, setAssignForm] = useState({ rider_id: "", zone_id: "" });

  const load = async () => {
    if (!tenantId) return;
    const [z, r, a, o] = await Promise.all([
      supabase.from("delivery_zones").select("*").eq("tenant_id", tenantId).order("name"),
      supabase.from("delivery_riders").select("*").eq("tenant_id", tenantId).order("name"),
      supabase.from("delivery_assignments").select("*, delivery_riders(name), online_orders(customer_name,total,delivery_address)").eq("tenant_id", tenantId).order("assigned_at", { ascending: false }).limit(50),
      supabase.from("online_orders").select("id,customer_name,total,status,delivery_address,delivery_type").eq("tenant_id", tenantId).eq("delivery_type", "delivery").in("status", ["pending", "confirmed", "preparing", "ready"]),
    ]);
    setZones((z.data as any) || []);
    setRiders((r.data as any) || []);
    setAssignments((a.data as any) || []);
    const assignedIds = new Set(((a.data as any) || []).filter((x: any) => x.status !== "delivered" && x.status !== "failed").map((x: any) => x.online_order_id));
    setPendingOrders(((o.data as any) || []).filter((x: Order) => !assignedIds.has(x.id)));
  };

  useEffect(() => { load(); }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const ch = supabase.channel("delivery").on("postgres_changes", { event: "*", schema: "public", table: "delivery_assignments" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId]);

  const saveZone = async () => {
    const { error } = await supabase.from("delivery_zones").insert({
      tenant_id: tenantId, name: zoneForm.name, fee: parseFloat(zoneForm.fee), estimated_minutes: parseInt(zoneForm.estimated_minutes),
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    setZoneDialog(false); setZoneForm({ name: "", fee: "0", estimated_minutes: "30" }); load();
  };

  const saveRider = async () => {
    const { error } = await supabase.from("delivery_riders").insert({
      tenant_id: tenantId, name: riderForm.name, phone: riderForm.phone || null, vehicle: riderForm.vehicle,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    setRiderDialog(false); setRiderForm({ name: "", phone: "", vehicle: "moto" }); load();
  };

  const toggleRider = async (id: string, available: boolean) => {
    await supabase.from("delivery_riders").update({ is_available: available }).eq("id", id); load();
  };

  const assignOrder = async () => {
    if (!assignDialog) return;
    const { error } = await supabase.from("delivery_assignments").insert({
      tenant_id: tenantId, online_order_id: assignDialog.id,
      rider_id: assignForm.rider_id || null, zone_id: assignForm.zone_id || null,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Pedido asignado" });
    setAssignDialog(null); setAssignForm({ rider_id: "", zone_id: "" }); load();
  };

  const updateStatus = async (id: string, status: string) => {
    const updates: any = { status };
    if (status === "picked_up") updates.picked_up_at = new Date().toISOString();
    if (status === "delivered") updates.delivered_at = new Date().toISOString();
    await supabase.from("delivery_assignments").update(updates).eq("id", id); load();
  };

  return (
    <AppLayout title="Delivery">
      <div className="p-6 space-y-6">
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active"><Truck className="h-4 w-4 mr-2" />Activos</TabsTrigger>
            <TabsTrigger value="riders"><Bike className="h-4 w-4 mr-2" />Repartidores</TabsTrigger>
            <TabsTrigger value="zones"><MapPin className="h-4 w-4 mr-2" />Zonas</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Pedidos sin asignar</CardTitle></CardHeader>
              <CardContent>
                {pendingOrders.length === 0 ? <p className="text-sm text-muted-foreground">No hay pedidos pendientes.</p> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Dirección</TableHead><TableHead>Total</TableHead><TableHead></TableHead></TableRow></TableHeader>
                    <TableBody>
                      {pendingOrders.map(o => (
                        <TableRow key={o.id}>
                          <TableCell>{o.customer_name}</TableCell>
                          <TableCell className="text-sm">{o.delivery_address}</TableCell>
                          <TableCell>{Number(o.total).toFixed(2)}</TableCell>
                          <TableCell><Button size="sm" onClick={() => setAssignDialog(o)}>Asignar</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Asignaciones</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Cliente</TableHead><TableHead>Repartidor</TableHead><TableHead>Estado</TableHead><TableHead>Acción</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {assignments.map(a => (
                      <TableRow key={a.id}>
                        <TableCell>{a.online_orders?.customer_name}</TableCell>
                        <TableCell>{a.delivery_riders?.name || "—"}</TableCell>
                        <TableCell><Badge>{STATUS_LABELS[a.status]}</Badge></TableCell>
                        <TableCell>
                          <Select value={a.status} onValueChange={v => updateStatus(a.id, v)}>
                            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                            <SelectContent>{Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="riders" className="space-y-4">
            <div className="flex justify-end"><Button onClick={() => setRiderDialog(true)}><Plus className="h-4 w-4 mr-2" />Nuevo</Button></div>
            <Card><CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Teléfono</TableHead><TableHead>Vehículo</TableHead><TableHead>Disponible</TableHead></TableRow></TableHeader>
                <TableBody>
                  {riders.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{r.name}</TableCell><TableCell>{r.phone}</TableCell><TableCell>{r.vehicle}</TableCell>
                      <TableCell><Switch checked={r.is_available} onCheckedChange={v => toggleRider(r.id, v)} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="zones" className="space-y-4">
            <div className="flex justify-end"><Button onClick={() => setZoneDialog(true)}><Plus className="h-4 w-4 mr-2" />Nueva zona</Button></div>
            <Card><CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead>Zona</TableHead><TableHead>Tarifa</TableHead><TableHead>Tiempo est.</TableHead></TableRow></TableHeader>
                <TableBody>
                  {zones.map(z => (
                    <TableRow key={z.id}>
                      <TableCell>{z.name}</TableCell><TableCell>{Number(z.fee).toFixed(2)}</TableCell><TableCell>{z.estimated_minutes} min</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>

        <Dialog open={zoneDialog} onOpenChange={setZoneDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nueva zona</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nombre</Label><Input value={zoneForm.name} onChange={e => setZoneForm({ ...zoneForm, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Tarifa</Label><Input type="number" value={zoneForm.fee} onChange={e => setZoneForm({ ...zoneForm, fee: e.target.value })} /></div>
                <div><Label>Minutos est.</Label><Input type="number" value={zoneForm.estimated_minutes} onChange={e => setZoneForm({ ...zoneForm, estimated_minutes: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter><Button onClick={saveZone}>Guardar</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={riderDialog} onOpenChange={setRiderDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo repartidor</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Nombre</Label><Input value={riderForm.name} onChange={e => setRiderForm({ ...riderForm, name: e.target.value })} /></div>
              <div><Label>Teléfono</Label><Input value={riderForm.phone} onChange={e => setRiderForm({ ...riderForm, phone: e.target.value })} /></div>
              <div><Label>Vehículo</Label>
                <Select value={riderForm.vehicle} onValueChange={v => setRiderForm({ ...riderForm, vehicle: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="moto">Moto</SelectItem><SelectItem value="bici">Bicicleta</SelectItem>
                    <SelectItem value="auto">Auto</SelectItem><SelectItem value="caminando">A pie</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button onClick={saveRider}>Guardar</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!assignDialog} onOpenChange={v => !v && setAssignDialog(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Asignar pedido</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{assignDialog?.customer_name} — {assignDialog?.delivery_address}</p>
              <div><Label>Repartidor</Label>
                <Select value={assignForm.rider_id} onValueChange={v => setAssignForm({ ...assignForm, rider_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>{riders.filter(r => r.is_available).map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Zona</Label>
                <Select value={assignForm.zone_id} onValueChange={v => setAssignForm({ ...assignForm, zone_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>{zones.map(z => <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button onClick={assignOrder}>Asignar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
