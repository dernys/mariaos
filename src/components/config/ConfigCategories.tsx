import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, Tag } from "lucide-react";

interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  is_active: boolean;
}

export function ConfigCategories() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: "", description: "", color: "#10b981" });

  const fetch = async () => {
    const { data } = await supabase.from("product_categories").select("*").order("name");
    if (data) setCategories(data as Category[]);
  };

  useEffect(() => { fetch(); }, []);

  const openNew = () => { setEditing(null); setForm({ name: "", description: "", color: "#10b981" }); setDialogOpen(true); };
  const openEdit = (c: Category) => { setEditing(c); setForm({ name: c.name, description: c.description || "", color: c.color || "#10b981" }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Error", description: "Nombre requerido", variant: "destructive" }); return; }
    const payload = { name: form.name.trim(), description: form.description || null, color: form.color, tenant_id: tenantId };
    if (editing) {
      await supabase.from("product_categories").update(payload).eq("id", editing.id);
      toast({ title: "Categoría actualizada" });
    } else {
      await supabase.from("product_categories").insert(payload);
      toast({ title: "Categoría creada" });
    }
    setDialogOpen(false);
    fetch();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("product_categories").delete().eq("id", id);
    toast({ title: "Categoría eliminada" });
    fetch();
  };

  const toggleActive = async (c: Category) => {
    await supabase.from("product_categories").update({ is_active: !c.is_active }).eq("id", c.id);
    fetch();
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{categories.length} categorías</p>
        <Button size="sm" onClick={openNew} className="gap-1 text-xs gradient-brand text-primary-foreground">
          <Plus className="h-3.5 w-3.5" /> Nueva Categoría
        </Button>
      </div>

      <div className="grid gap-2">
        {categories.map((c) => (
          <Card key={c.id} className="p-0">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${c.color}20` }}>
                  <Tag className="h-4 w-4" style={{ color: c.color || undefined }} />
                </div>
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  {c.description && <p className="text-[10px] text-muted-foreground">{c.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={c.is_active ? "default" : "secondary"} className="text-[10px] cursor-pointer" onClick={() => toggleActive(c)}>
                  {c.is_active ? "Activa" : "Inactiva"}
                </Badge>
                <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-muted transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </CardContent>
          </Card>
        ))}
        {categories.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay categorías configuradas</p>}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar" : "Nueva"} Categoría</DialogTitle>
            <DialogDescription>Categorías de productos</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Descripción</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Color</Label><Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 p-1" /></div>
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
