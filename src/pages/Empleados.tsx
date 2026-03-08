import { AppLayout } from "@/components/AppLayout";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Search, Edit2, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Employee {
  id: string;
  name: string;
  position: string | null;
  salary: number;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  hire_date: string | null;
  notes: string | null;
}

const Empleados = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState({ name: "", position: "", salary: "0", phone: "", email: "", hire_date: "", notes: "" });
  const { toast } = useToast();

  const fetchEmployees = async () => {
    const { data, error } = await supabase.from("employees").select("*").order("name");
    if (!error && data) setEmployees(data as Employee[]);
    setLoading(false);
  };

  useEffect(() => { fetchEmployees(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", position: "", salary: "0", phone: "", email: "", hire_date: new Date().toISOString().slice(0, 10), notes: "" });
    setDialogOpen(true);
  };

  const openEdit = (e: Employee) => {
    setEditing(e);
    setForm({
      name: e.name, position: e.position || "", salary: String(e.salary),
      phone: e.phone || "", email: e.email || "",
      hire_date: e.hire_date || "", notes: e.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Error", description: "El nombre es obligatorio", variant: "destructive" });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: tu } = await supabase.from("tenant_users").select("tenant_id").eq("user_id", user.id).limit(1).single();

    const payload = {
      name: form.name.trim(),
      position: form.position || null,
      salary: parseFloat(form.salary) || 0,
      phone: form.phone || null,
      email: form.email || null,
      hire_date: form.hire_date || null,
      notes: form.notes || null,
      tenant_id: tu?.tenant_id,
    };

    if (editing) {
      const { error } = await supabase.from("employees").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Empleado actualizado" });
    } else {
      const { error } = await supabase.from("employees").insert(payload);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Empleado creado" });
    }
    setDialogOpen(false);
    fetchEmployees();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Empleado eliminado" });
    fetchEmployees();
  };

  const filtered = employees.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.position || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout title="Empleados">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar empleado..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Button onClick={openNew} className="gradient-brand text-primary-foreground gap-2">
            <Plus className="h-4 w-4" /> Nuevo Empleado
          </Button>
        </div>

        <div className="bg-card rounded-xl border shadow-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Puesto</TableHead>
                <TableHead className="hidden sm:table-cell">Teléfono</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden lg:table-cell">Salario</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-20">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.name}</TableCell>
                  <TableCell>{e.position || "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell">{e.phone || "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{e.email || "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">${e.salary.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={e.is_active ? "default" : "secondary"}>
                      {e.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(e)} className="p-1.5 rounded hover:bg-muted transition-colors">
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(e.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    {loading ? "Cargando..." : "No hay empleados"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Empleado" : "Nuevo Empleado"}</DialogTitle>
            <DialogDescription>Ingresa los datos del empleado</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Puesto</Label><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
              <div><Label>Salario</Label><Input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <div><Label>Fecha de Contratación</Label><Input type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></div>
            <div><Label>Notas</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="gradient-brand text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Empleados;
