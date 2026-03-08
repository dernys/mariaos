import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, Pencil } from "lucide-react";
import { motion } from "framer-motion";

interface Module {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  created_at: string;
}

export function ModulesTab() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchModules = async () => {
    const { data } = await supabase.from("app_modules").select("*").order("created_at");
    setModules(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchModules();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setSlug("");
    setDescription("");
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (mod: Module) => {
    setEditingId(mod.id);
    setName(mod.name);
    setSlug(mod.slug);
    setDescription(mod.description ?? "");
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    if (editingId) {
      const { error } = await supabase
        .from("app_modules")
        .update({ name, slug, description: description || null })
        .eq("id", editingId);
      if (error) toast.error(error.message);
      else toast.success("Módulo actualizado");
    } else {
      const { error } = await supabase
        .from("app_modules")
        .insert({ name, slug, description: description || null });
      if (error) toast.error(error.message);
      else toast.success("Módulo creado");
    }

    setSaving(false);
    setDialogOpen(false);
    resetForm();
    await fetchModules();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar el módulo "${name}"? Los permisos asociados se perderán.`)) return;
    const { error } = await supabase.from("app_modules").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Módulo eliminado");
      await fetchModules();
    }
  };

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);
    if (!editingId) {
      setSlug(
        value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {modules.length} módulo{modules.length !== 1 ? "s" : ""}
        </p>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate} className="gap-2 gradient-brand text-primary-foreground font-heading font-semibold">
              <Plus className="h-4 w-4" />
              Nuevo Módulo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-heading">
                {editingId ? "Editar Módulo" : "Crear Módulo"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nombre</label>
                <Input value={name} onChange={(e) => handleNameChange(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Slug (ruta)</label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Descripción (opcional)</label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <Button type="submit" disabled={saving} className="w-full gradient-brand text-primary-foreground font-heading font-semibold">
                {saving ? "Guardando..." : editingId ? "Actualizar" : "Crear"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl shadow-card border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 font-medium text-muted-foreground text-xs">Nombre</th>
                <th className="text-left p-3 font-medium text-muted-foreground text-xs">Slug</th>
                <th className="text-left p-3 font-medium text-muted-foreground text-xs">Descripción</th>
                <th className="text-center p-3 font-medium text-muted-foreground text-xs w-24">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((mod) => (
                <tr key={mod.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="p-3">
                    <p className="text-xs font-medium">{mod.name}</p>
                  </td>
                  <td className="p-3">
                    <p className="text-xs text-muted-foreground">/{mod.slug}</p>
                  </td>
                  <td className="p-3">
                    <p className="text-xs text-muted-foreground">{mod.description ?? "—"}</p>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(mod)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(mod.id, mod.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {modules.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-xs text-muted-foreground">
                    No hay módulos. Crea uno para empezar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
