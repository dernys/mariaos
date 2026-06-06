import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Building2 } from "lucide-react";

interface CostCenter {
  id: string;
  code: string;
  name: string;
  department: string | null;
  parent_id: string | null;
  is_active: boolean;
  notes: string | null;
}

export function CostCentersTab() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const [items, setItems] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CostCenter | null>(null);
  const [form, setForm] = useState({ code: "", name: "", department: "", parent_id: "", is_active: true, notes: "" });

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await (supabase as any).from("cost_centers").select("*").eq("tenant_id", tenantId).order("code");
    setItems((data as CostCenter[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);

  const openNew = () => {
    setEditing(null);
    setForm({ code: "", name: "", department: "", parent_id: "", is_active: true, notes: "" });
    setOpen(true);
  };
  const openEdit = (cc: CostCenter) => {
    setEditing(cc);
    setForm({
      code: cc.code, name: cc.name,
      department: cc.department || "",
      parent_id: cc.parent_id || "",
      is_active: cc.is_active,
      notes: cc.notes || "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!tenantId || !form.code.trim() || !form.name.trim()) {
      toast({ title: "Código y nombre obligatorios", variant: "destructive" });
      return;
    }
    const payload: any = {
      tenant_id: tenantId,
      code: form.code.trim(),
      name: form.name.trim(),
      department: form.department.trim() || null,
      parent_id: form.parent_id || null,
      is_active: form.is_active,
      notes: form.notes.trim() || null,
    };
    const res = editing
      ? await (supabase as any).from("cost_centers").update(payload).eq("id", editing.id)
      : await (supabase as any).from("cost_centers").insert(payload);
    if (res.error) { toast({ title: "Error", description: res.error.message, variant: "destructive" }); return; }
    toast({ title: editing ? "Centro actualizado" : "Centro creado" });
    setOpen(false);
    load();
  };

  const remove = async (cc: CostCenter) => {
    if (!confirm(`¿Eliminar centro de costo "${cc.name}"?`)) return;
    const { error } = await (supabase as any).from("cost_centers").delete().eq("id", cc.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Eliminado" });
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Building2 className="h-4 w-4" /> {items.length} centros de costo
        </p>
        <Button size="sm" onClick={openNew} className="gap-1"><Plus className="h-4 w-4" />Nuevo</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Departamento</TableHead>
                <TableHead>Padre</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Cargando…</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin centros de costo</TableCell></TableRow>
              ) : items.map((cc) => (
                <TableRow key={cc.id}>
                  <TableCell className="font-mono text-xs">{cc.code}</TableCell>
                  <TableCell className="font-medium">{cc.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{cc.department || "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {cc.parent_id ? items.find((x) => x.id === cc.parent_id)?.code || "—" : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={cc.is_active ? "default" : "secondary"}>{cc.is_active ? "Activo" : "Inactivo"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(cc)}><Edit2 className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(cc)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar centro" : "Nuevo centro de costo"}</DialogTitle>
            <DialogDescription>Dimensión analítica para asientos, ventas y compras.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Código *</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CC001" />
              </div>
              <div>
                <Label>Departamento</Label>
                <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Cocina, Sala, Admin…" />
              </div>
            </div>
            <div>
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Centro padre (opcional)</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={form.parent_id}
                onChange={(e) => setForm({ ...form, parent_id: e.target.value })}
              >
                <option value="">— Ninguno —</option>
                {items.filter((x) => x.id !== editing?.id).map((x) => (
                  <option key={x.id} value={x.id}>{x.code} - {x.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Notas</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Activo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>{editing ? "Guardar" : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
