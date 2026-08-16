import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { useUnits, type UnitOfMeasure } from "@/hooks/useUnits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Ruler, Star } from "lucide-react";

const empty = { code: "", name: "", decimals: "0", factor: "1" };

export function ConfigUnits() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const { units, reload } = useUnits(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UnitOfMeasure | null>(null);
  const [form, setForm] = useState(empty);

  const openNew = () => { setEditing(null); setForm(empty); setDialogOpen(true); };
  const openEdit = (u: UnitOfMeasure) => {
    setEditing(u);
    setForm({ code: u.code, name: u.name, decimals: String(u.decimals), factor: String(u.factor) });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: "Código y nombre requeridos", variant: "destructive" });
      return;
    }
    const payload = {
      tenant_id: tenantId,
      code: form.code.trim(),
      name: form.name.trim(),
      decimals: Math.max(0, Number(form.decimals) || 0),
      factor: Number(form.factor) || 1,
    };
    const q = editing
      ? (supabase as any).from("units_of_measure").update(payload).eq("id", editing.id)
      : (supabase as any).from("units_of_measure").insert(payload);
    const { error } = await q;
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Unidad actualizada" : "Unidad creada" });
    setDialogOpen(false);
    reload();
  };

  const toggleActive = async (u: UnitOfMeasure) => {
    await (supabase as any).from("units_of_measure").update({ is_active: !u.is_active }).eq("id", u.id);
    reload();
  };

  const makeDefault = async (u: UnitOfMeasure) => {
    await (supabase as any).from("units_of_measure").update({ is_default: false }).eq("tenant_id", tenantId);
    await (supabase as any).from("units_of_measure").update({ is_default: true, is_active: true }).eq("id", u.id);
    toast({ title: `${u.name} es la unidad por defecto` });
    reload();
  };

  const remove = async (u: UnitOfMeasure) => {
    const { error } = await (supabase as any).from("units_of_measure").delete().eq("id", u.id);
    if (error) { toast({ title: "No se pudo eliminar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Unidad eliminada" });
    reload();
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {units.length} unidades — se usan en compras, transferencias y conteos
        </p>
        <Button size="sm" onClick={openNew} className="gap-1 text-xs gradient-brand text-primary-foreground">
          <Plus className="h-3.5 w-3.5" /> Nueva Unidad
        </Button>
      </div>

      <div className="grid gap-2">
        {units.map((u) => (
          <Card key={u.id} className="p-0">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Ruler className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {u.name} <span className="text-muted-foreground">({u.code})</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {u.decimals} decimales · factor {u.factor}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {u.is_default ? (
                  <Badge className="text-[10px] gap-1"><Star className="h-3 w-3" /> Por defecto</Badge>
                ) : (
                  <button onClick={() => makeDefault(u)} className="text-[10px] text-muted-foreground hover:text-primary">
                    Hacer default
                  </button>
                )}
                <Badge variant={u.is_active ? "default" : "secondary"} className="text-[10px] cursor-pointer" onClick={() => toggleActive(u)}>
                  {u.is_active ? "Activa" : "Inactiva"}
                </Badge>
                <button onClick={() => openEdit(u)} className="p-1.5 rounded hover:bg-muted transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                <button onClick={() => remove(u)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </CardContent>
          </Card>
        ))}
        {units.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay unidades configuradas</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar" : "Nueva"} Unidad de Medida</DialogTitle>
            <DialogDescription>Ej: u, kg, L, caja. El factor convierte a la unidad base.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Código *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="kg" /></div>
              <div><Label className="text-xs">Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kilogramo" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Decimales</Label><Input type="number" min="0" max="4" value={form.decimals} onChange={(e) => setForm({ ...form, decimals: e.target.value })} /></div>
              <div><Label className="text-xs">Factor</Label><Input type="number" step="0.0001" value={form.factor} onChange={(e) => setForm({ ...form, factor: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save} className="gradient-brand text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
