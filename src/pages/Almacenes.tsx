import { AppLayout } from "@/components/AppLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { logActivity } from "@/hooks/useActivityLog";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Warehouse, Package, Plus, Edit2, Trash2, MapPin, DollarSign, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

interface WarehouseItem {
  id: string;
  name: string;
  location: string | null;
  capacity: number | null;
  is_active: boolean;
}

const Almacenes = () => {
  const { user } = useAuth();
  const tenantId = useTenant();
  const { toast } = useToast();
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [stockTotals, setStockTotals] = useState<Record<string, number>>({});
  const [stockValue, setStockValue] = useState<Record<string, number>>({});
  const [lowStock, setLowStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailWh, setDetailWh] = useState<WarehouseItem | null>(null);
  const [editing, setEditing] = useState<WarehouseItem | null>(null);
  const [form, setForm] = useState({ name: "", location: "", capacity: "0" });

  const fetchData = async () => {
    const [whRes, prodRes, psRes] = await Promise.all([
      supabase.from("warehouses").select("*").order("name"),
      supabase.from("products").select("id, cost, min_stock, warehouse_id"),
      supabase.from("product_stock").select("location_type, location_id, product_id, stock").eq("location_type", "warehouse"),
    ]);
    if (whRes.data) setWarehouses(whRes.data as WarehouseItem[]);
    const productMap: Record<string, { cost: number; min: number }> = {};
    (prodRes.data || []).forEach((p: any) => { productMap[p.id] = { cost: Number(p.cost) || 0, min: Number(p.min_stock) || 0 }; });

    const counts: Record<string, number> = {};
    const totals: Record<string, number> = {};
    const values: Record<string, number> = {};
    const lows: Record<string, number> = {};
    (psRes.data || []).forEach((s: any) => {
      counts[s.location_id] = (counts[s.location_id] || 0) + 1;
      totals[s.location_id] = (totals[s.location_id] || 0) + Number(s.stock || 0);
      const pm = productMap[s.product_id];
      if (pm) {
        values[s.location_id] = (values[s.location_id] || 0) + Number(s.stock || 0) * pm.cost;
        if (pm.min > 0 && Number(s.stock) <= pm.min) {
          lows[s.location_id] = (lows[s.location_id] || 0) + 1;
        }
      }
    });
    setProductCounts(counts);
    setStockTotals(totals);
    setStockValue(values);
    setLowStock(lows);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const openNew = () => { setEditing(null); setForm({ name: "", location: "", capacity: "0" }); setDialogOpen(true); };
  const openEdit = (w: WarehouseItem) => { setEditing(w); setForm({ name: w.name, location: w.location || "", capacity: String(w.capacity || 0) }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Error", description: "El nombre es obligatorio", variant: "destructive" }); return; }
    const payload = { name: form.name.trim(), location: form.location || null, capacity: parseInt(form.capacity) || 0, tenant_id: tenantId };
    if (editing) {
      const { error } = await supabase.from("warehouses").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      await logActivity({ entity_type: "warehouse", entity_id: editing.id, action: "Almacén actualizado", description: `Se actualizó ${payload.name}`, tenant_id: tenantId, performed_by: user?.id });
      toast({ title: "Almacén actualizado" });
    } else {
      const { data, error } = await supabase.from("warehouses").insert(payload).select("id").single();
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      if (data) await logActivity({ entity_type: "warehouse", entity_id: data.id, action: "Almacén creado", description: `Se creó ${payload.name}`, tenant_id: tenantId, performed_by: user?.id });
      toast({ title: "Almacén creado" });
    }
    setDialogOpen(false);
    fetchData();
  };

  const handleDelete = async (w: WarehouseItem) => {
    const { error } = await supabase.from("warehouses").delete().eq("id", w.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await logActivity({ entity_type: "warehouse", entity_id: w.id, action: "Almacén eliminado", description: `Se eliminó ${w.name}`, tenant_id: tenantId, performed_by: user?.id });
    toast({ title: "Almacén eliminado" });
    fetchData();
  };

  return (
    <AppLayout title="Almacenes">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-muted-foreground">{warehouses.length} almacenes registrados</p>
          <Button size="sm" onClick={openNew} className="gap-1 text-xs gradient-brand text-primary-foreground">
            <Plus className="h-3.5 w-3.5" /> Nuevo Almacén
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {warehouses.map((wh, i) => {
            const count = productCounts[wh.id] || 0;
            const totalUnits = stockTotals[wh.id] || 0;
            const value = stockValue[wh.id] || 0;
            const low = lowStock[wh.id] || 0;
            return (
              <motion.div
                key={wh.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-card rounded-xl p-5 shadow-card border hover:shadow-elevated transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Warehouse className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={wh.is_active ? "default" : "secondary"} className="text-[10px]">
                      {wh.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                    <button onClick={() => openEdit(wh)} className="p-1 rounded hover:bg-muted transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                    <button onClick={() => handleDelete(wh)} className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>

                <h3 className="font-heading font-semibold text-sm cursor-pointer hover:text-primary transition-colors" onClick={() => setDetailWh(wh)}>{wh.name}</h3>
                {wh.location && (
                  <div className="flex items-center gap-1 mt-1 text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span className="text-[11px]">{wh.location}</span>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t space-y-2.5">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted/40 rounded-lg p-2">
                      <div className="flex items-center gap-1 text-muted-foreground"><Package className="h-3 w-3" /> SKUs</div>
                      <p className="font-heading font-bold text-sm mt-0.5">{count}</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-2">
                      <div className="flex items-center gap-1 text-muted-foreground">Unidades</div>
                      <p className="font-heading font-bold text-sm mt-0.5">{totalUnits.toLocaleString()}</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-2">
                      <div className="flex items-center gap-1 text-muted-foreground"><DollarSign className="h-3 w-3" /> Valor</div>
                      <p className="font-heading font-bold text-sm mt-0.5 text-success">${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    </div>
                    <div className="bg-muted/40 rounded-lg p-2">
                      <div className="flex items-center gap-1 text-muted-foreground"><AlertTriangle className="h-3 w-3" /> Bajo</div>
                      <p className={`font-heading font-bold text-sm mt-0.5 ${low > 0 ? "text-warning" : ""}`}>{low}</p>
                    </div>
                  </div>
                  {wh.capacity && wh.capacity > 0 && (
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground">Capacidad</span>
                        <span className="font-heading font-semibold">{Math.min(Math.round((count / wh.capacity) * 100), 100)}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min((count / wh.capacity) * 100, 100)}%` }}
                          transition={{ duration: 0.8, delay: i * 0.1 }}
                          className={`h-full rounded-full ${(count / wh.capacity) > 0.8 ? "bg-warning" : "bg-primary"}`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
          {warehouses.length === 0 && !loading && (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              <Warehouse className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay almacenes registrados</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Almacén" : "Nuevo Almacén"}</DialogTitle>
            <DialogDescription>Datos del almacén</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Ubicación</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
            <div><Label>Capacidad (productos)</Label><Input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="gradient-brand text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailWh} onOpenChange={() => setDetailWh(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{detailWh?.name}</DialogTitle>
            <DialogDescription>Historial de actividad</DialogDescription>
          </DialogHeader>
          {detailWh && <ActivityTimeline entityType="warehouse" entityId={detailWh.id} />}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Almacenes;
