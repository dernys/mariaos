import { AppLayout } from "@/components/AppLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { logActivity } from "@/hooks/useActivityLog";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Store, MapPin, Plus, Edit2, Trash2, Phone, Mail, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface StoreItem {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  manager_id: string | null;
  is_active: boolean;
  latitude: number | null;
  longitude: number | null;
  delivery_radius_km: number | null;
  accepts_delivery: boolean | null;
  accepts_pickup: boolean | null;
}

interface Employee {
  id: string;
  name: string;
}

const Tiendas = () => {
  const { user } = useAuth();
  const tenantId = useTenant();
  const { toast } = useToast();
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailStore, setDetailStore] = useState<StoreItem | null>(null);
  const [editing, setEditing] = useState<StoreItem | null>(null);
  const [form, setForm] = useState({ name: "", address: "", phone: "", email: "", manager_id: "", latitude: "", longitude: "", delivery_radius_km: "5", accepts_delivery: true, accepts_pickup: true });
  const [locating, setLocating] = useState(false);

  const useMyLocation = () => {
    if (!navigator.geolocation) { toast({ title: "Geolocalización no disponible", variant: "destructive" }); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
        setLocating(false);
        toast({ title: "Ubicación capturada" });
      },
      (err) => { setLocating(false); toast({ title: "Error", description: err.message, variant: "destructive" }); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const fetchData = async () => {
    const [stRes, empRes] = await Promise.all([
      supabase.from("stores").select("*").order("name"),
      supabase.from("employees").select("id, name").eq("is_active", true).order("name"),
    ]);
    if (stRes.data) setStores(stRes.data as StoreItem[]);
    if (empRes.data) setEmployees(empRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", address: "", phone: "", email: "", manager_id: "", latitude: "", longitude: "", delivery_radius_km: "5", accepts_delivery: true, accepts_pickup: true });
    setDialogOpen(true);
  };

  const openEdit = (s: StoreItem) => {
    setEditing(s);
    setForm({
      name: s.name, address: s.address || "", phone: s.phone || "", email: s.email || "", manager_id: s.manager_id || "",
      latitude: s.latitude?.toString() || "", longitude: s.longitude?.toString() || "",
      delivery_radius_km: (s.delivery_radius_km ?? 5).toString(),
      accepts_delivery: s.accepts_delivery ?? true, accepts_pickup: s.accepts_pickup ?? true,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Error", description: "El nombre es obligatorio", variant: "destructive" }); return; }
    const payload: any = {
      name: form.name.trim(), address: form.address || null, phone: form.phone || null,
      email: form.email || null, manager_id: form.manager_id || null, tenant_id: tenantId,
      latitude: form.latitude ? parseFloat(form.latitude) : null,
      longitude: form.longitude ? parseFloat(form.longitude) : null,
      delivery_radius_km: form.delivery_radius_km ? parseFloat(form.delivery_radius_km) : 5,
      accepts_delivery: form.accepts_delivery,
      accepts_pickup: form.accepts_pickup,
    };
    if (editing) {
      const { error } = await supabase.from("stores").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      await logActivity({ entity_type: "store", entity_id: editing.id, action: "Tienda actualizada", description: `Se actualizó ${payload.name}`, tenant_id: tenantId, performed_by: user?.id });
      toast({ title: "Tienda actualizada" });
    } else {
      const { data, error } = await supabase.from("stores").insert(payload).select("id").single();
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      if (data) await logActivity({ entity_type: "store", entity_id: data.id, action: "Tienda creada", description: `Se creó ${payload.name}`, tenant_id: tenantId, performed_by: user?.id });
      toast({ title: "Tienda creada" });
    }
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async (s: StoreItem) => {
    const { error } = await supabase.from("stores").delete().eq("id", s.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await logActivity({ entity_type: "store", entity_id: s.id, action: "Tienda eliminada", description: `Se eliminó ${s.name}`, tenant_id: tenantId, performed_by: user?.id });
    toast({ title: "Tienda eliminada" });
    fetchData();
  };

  const toggleActive = async (s: StoreItem) => {
    await supabase.from("stores").update({ is_active: !s.is_active }).eq("id", s.id);
    await logActivity({ entity_type: "store", entity_id: s.id, action: s.is_active ? "Tienda desactivada" : "Tienda activada", tenant_id: tenantId, performed_by: user?.id });
    fetchData();
  };

  const getManagerName = (id: string | null) => employees.find((e) => e.id === id)?.name || "Sin asignar";

  return (
    <AppLayout title="Tiendas">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{stores.length} tiendas registradas</p>
          <Button size="sm" onClick={openNew} className="gap-1 text-xs gradient-brand text-primary-foreground">
            <Plus className="h-3.5 w-3.5" /> Nueva Tienda
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {stores.map((store, i) => (
            <motion.div
              key={store.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card rounded-xl p-5 shadow-card border hover:shadow-elevated transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Store className="h-5 w-5 text-primary" />
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={store.is_active ? "default" : "secondary"} className="text-[10px] cursor-pointer" onClick={() => toggleActive(store)}>
                    {store.is_active ? "Activa" : "Inactiva"}
                  </Badge>
                  <button onClick={() => openEdit(store)} className="p-1 rounded hover:bg-muted transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleDelete(store)} className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              <h3 className="font-heading font-semibold text-sm cursor-pointer hover:text-primary transition-colors" onClick={() => setDetailStore(store)}>{store.name}</h3>
              {store.address && (
                <div className="flex items-center gap-1 mt-1 text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  <span className="text-[11px]">{store.address}</span>
                </div>
              )}

              <div className="flex items-center gap-4 mt-4 pt-4 border-t flex-wrap">
                {store.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs">{store.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <UserCheck className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs">{getManagerName(store.manager_id)}</span>
                </div>
              </div>
            </motion.div>
          ))}
          {stores.length === 0 && !loading && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <Store className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay tiendas registradas</p>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Tienda" : "Nueva Tienda"}</DialogTitle>
            <DialogDescription>Datos de la tienda y ubicación para el marketplace</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Dirección</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <div>
              <Label>Encargado</Label>
              <Select value={form.manager_id} onValueChange={(v) => setForm({ ...form, manager_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar empleado" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ubicación (Marketplace)</Label>
                <Button type="button" size="sm" variant="outline" onClick={useMyLocation} disabled={locating} className="h-7 text-xs gap-1">
                  <MapPin className="h-3 w-3" /> {locating ? "Capturando..." : "Usar mi ubicación"}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Latitud</Label><Input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="23.135" /></div>
                <div><Label className="text-xs">Longitud</Label><Input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="-82.359" /></div>
              </div>
              <div><Label className="text-xs">Radio de entrega (km)</Label><Input type="number" step="0.5" value={form.delivery_radius_km} onChange={(e) => setForm({ ...form, delivery_radius_km: e.target.value })} /></div>
              <div className="flex gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={form.accepts_delivery} onChange={(e) => setForm({ ...form, accepts_delivery: e.target.checked })} />
                  Acepta delivery
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={form.accepts_pickup} onChange={(e) => setForm({ ...form, accepts_pickup: e.target.checked })} />
                  Acepta recogida
                </label>
              </div>
              {form.latitude && form.longitude && (
                <a
                  href={`https://www.google.com/maps?q=${form.latitude},${form.longitude}`}
                  target="_blank" rel="noreferrer"
                  className="text-xs text-primary underline inline-flex items-center gap-1"
                >
                  <MapPin className="h-3 w-3" /> Ver en mapa
                </a>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="gradient-brand text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog with Activity */}
      <Dialog open={!!detailStore} onOpenChange={() => setDetailStore(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{detailStore?.name}</DialogTitle>
            <DialogDescription>Historial de actividad</DialogDescription>
          </DialogHeader>
          {detailStore && <ActivityTimeline entityType="store" entityId={detailStore.id} />}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Tiendas;
