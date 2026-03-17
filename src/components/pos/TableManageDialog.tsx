import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save } from "lucide-react";

interface TableData {
  id?: string;
  name: string;
  capacity: number;
  shape: string;
  position_x: number;
  position_y: number;
}

interface TableManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table?: TableData | null;
  onSaved: () => void;
}

export function TableManageDialog({ open, onOpenChange, table, onSaved }: TableManageDialogProps) {
  const { tenantId } = useTenantContext();
  const { toast } = useToast();
  const [form, setForm] = useState<TableData>({
    name: "",
    capacity: 4,
    shape: "square",
    position_x: 0,
    position_y: 0,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && table) {
      setForm({
        id: table.id,
        name: table.name,
        capacity: table.capacity,
        shape: table.shape,
        position_x: table.position_x,
        position_y: table.position_y,
      });
    } else if (open) {
      setForm({ name: "", capacity: 4, shape: "square", position_x: 0, position_y: 0 });
    }
  }, [open, table]);

  const handleSave = async () => {
    if (!form.name.trim() || !tenantId) return;
    setSaving(true);
    try {
      if (form.id) {
        await supabase.from("restaurant_tables").update({
          name: form.name,
          capacity: form.capacity,
          shape: form.shape,
          position_x: form.position_x,
          position_y: form.position_y,
        }).eq("id", form.id);
        toast({ title: "Mesa actualizada" });
      } else {
        await supabase.from("restaurant_tables").insert({
          tenant_id: tenantId,
          name: form.name,
          capacity: form.capacity,
          shape: form.shape,
          position_x: form.position_x,
          position_y: form.position_y,
        });
        toast({ title: "Mesa creada" });
      }
      onSaved();
      onOpenChange(false);
    } catch {
      toast({ title: "Error", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!form.id) return;
    setSaving(true);
    await supabase.from("restaurant_tables").delete().eq("id", form.id);
    toast({ title: "Mesa eliminada" });
    onSaved();
    onOpenChange(false);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{form.id ? "Editar Mesa" : "Nueva Mesa"}</DialogTitle>
          <DialogDescription>Configura los datos de la mesa del restaurante.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Nombre</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mesa 1" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Capacidad</Label>
              <Input type="number" min={1} max={20} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 1 })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Forma</Label>
              <Select value={form.shape} onValueChange={(v) => setForm({ ...form, shape: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="square">Cuadrada</SelectItem>
                  <SelectItem value="round">Redonda</SelectItem>
                  <SelectItem value="rectangle">Rectangular</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Fila (Y)</Label>
              <Input type="number" min={0} value={form.position_y} onChange={(e) => setForm({ ...form, position_y: parseInt(e.target.value) || 0 })} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Columna (X)</Label>
              <Input type="number" min={0} value={form.position_x} onChange={(e) => setForm({ ...form, position_x: parseInt(e.target.value) || 0 })} className="mt-1" />
            </div>
          </div>
          <div className="flex gap-2">
            {form.id && (
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={saving} className="gap-1 text-xs">
                <Trash2 className="h-3 w-3" /> Eliminar
              </Button>
            )}
            <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="flex-1 gap-1 text-xs">
              <Save className="h-3 w-3" /> {form.id ? "Guardar Cambios" : "Crear Mesa"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
