import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Percent } from "lucide-react";

interface TaxRate {
  id: string;
  name: string;
  rate: number;
  is_default: boolean;
  is_active: boolean;
}

export function ConfigTaxRates() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const [taxes, setTaxes] = useState<TaxRate[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [form, setForm] = useState({ name: "", rate: "0", is_default: false });

  const fetch = async () => {
    const { data } = await supabase.from("tax_rates").select("*").order("name");
    if (data) setTaxes(data as TaxRate[]);
  };

  useEffect(() => { fetch(); }, []);

  const openNew = () => { setEditing(null); setForm({ name: "", rate: "0", is_default: false }); setDialogOpen(true); };
  const openEdit = (t: TaxRate) => { setEditing(t); setForm({ name: t.name, rate: String(t.rate), is_default: t.is_default }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Error", description: "Nombre requerido", variant: "destructive" }); return; }
    const payload = { name: form.name.trim(), rate: parseFloat(form.rate) || 0, is_default: form.is_default, tenant_id: tenantId };
    if (editing) {
      await supabase.from("tax_rates").update(payload).eq("id", editing.id);
    } else {
      await supabase.from("tax_rates").insert(payload);
    }
    toast({ title: editing ? "Impuesto actualizado" : "Impuesto creado" });
    setDialogOpen(false);
    fetch();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("tax_rates").delete().eq("id", id);
    toast({ title: "Impuesto eliminado" });
    fetch();
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{taxes.length} tasas de impuesto</p>
        <Button size="sm" onClick={openNew} className="gap-1 text-xs gradient-brand text-primary-foreground">
          <Plus className="h-3.5 w-3.5" /> Nueva Tasa
        </Button>
      </div>

      <div className="grid gap-2">
        {taxes.map((t) => (
          <Card key={t.id} className="p-0">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Percent className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.rate}%</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {t.is_default && <Badge className="text-[10px]">Por defecto</Badge>}
                <Badge variant={t.is_active ? "default" : "secondary"} className="text-[10px]">{t.is_active ? "Activo" : "Inactivo"}</Badge>
                <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-muted transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </CardContent>
          </Card>
        ))}
        {taxes.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay tasas de impuesto</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar" : "Nueva"} Tasa de Impuesto</DialogTitle>
            <DialogDescription>Configura las tasas de impuesto del sistema</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="IVA 16%" /></div>
            <div><Label>Tasa (%)</Label><Input type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="default-tax" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} className="h-4 w-4 rounded border-input" />
              <Label htmlFor="default-tax" className="text-xs cursor-pointer">Impuesto por defecto</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="gradient-brand text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
