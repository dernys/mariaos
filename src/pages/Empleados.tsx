import { AppLayout } from "@/components/AppLayout";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { logActivity } from "@/hooks/useActivityLog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Edit2, Trash2, Users, History, UserCheck, Wallet, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { useTableState } from "@/hooks/useTableState";
import { TableToolbar } from "@/components/data/TableToolbar";
import { ExportButton } from "@/components/data/ExportButton";
import { TablePagination } from "@/components/data/TablePagination";
import { MiniStatCard, StatRow } from "@/components/data/MiniStatCard";

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

interface Shift {
  id: string;
  store_name: string;
  opened_at: string;
  closed_at: string | null;
  total_sales: number | null;
  status: string;
}

const Empleados = () => {
  const { user } = useAuth();
  const tenantId = useTenant();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState({ name: "", position: "", salary: "0", credit_limit: "0", phone: "", email: "", hire_date: "", notes: "" });
  const { toast } = useToast();

  const fetchEmployees = async () => {
    const { data, error } = await supabase.from("employees").select("*").order("name");
    if (!error && data) setEmployees(data as Employee[]);
    setLoading(false);
  };

  useEffect(() => { fetchEmployees(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", position: "", salary: "0", credit_limit: "0", phone: "", email: "", hire_date: new Date().toISOString().slice(0, 10), notes: "" });
    setDialogOpen(true);
  };

  const openEdit = (e: Employee) => {
    setEditing(e);
    setForm({ name: e.name, position: e.position || "", salary: String(e.salary), credit_limit: String((e as any).credit_limit ?? 0), phone: e.phone || "", email: e.email || "", hire_date: e.hire_date || "", notes: e.notes || "" });
    setDialogOpen(true);
  };

  const openDetail = (e: Employee) => navigate(`/empleados/${e.id}`);

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Error", description: "El nombre es obligatorio", variant: "destructive" }); return; }
    const payload = {
      name: form.name.trim(), position: form.position || null, salary: parseFloat(form.salary) || 0,
      phone: form.phone || null, email: form.email || null, hire_date: form.hire_date || null,
      notes: form.notes || null, tenant_id: tenantId,
    };
    if (editing) {
      const { error } = await supabase.from("employees").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      await logActivity({ entity_type: "employee", entity_id: editing.id, action: "Empleado actualizado", description: `Se actualizó ${payload.name}`, tenant_id: tenantId, performed_by: user?.id });
      toast({ title: "Empleado actualizado" });
    } else {
      const { data, error } = await supabase.from("employees").insert(payload).select("id").single();
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      if (data) await logActivity({ entity_type: "employee", entity_id: data.id, action: "Empleado creado", description: `Se creó ${payload.name}`, tenant_id: tenantId, performed_by: user?.id });
      toast({ title: "Empleado creado" });
    }
    setDialogOpen(false);
    fetchEmployees();
  };

  const handleDelete = async (id: string, name: string) => {
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await logActivity({ entity_type: "employee", entity_id: id, action: "Empleado eliminado", description: `Se eliminó ${name}`, tenant_id: tenantId, performed_by: user?.id });
    toast({ title: "Empleado eliminado" });
    fetchEmployees();
  };

  const active = employees.filter((e) => e.is_active).length;
  const totalSalary = employees.filter((e) => e.is_active).reduce((a, e) => a + (Number(e.salary) || 0), 0);
  const totalAdvances = employees.reduce((a, e) => a + Math.max(0, Number((e as any).balance) || 0), 0);

  const table = useTableState({
    data: employees,
    searchKeys: ["name", "position", "email", "phone"],
    filterFns: {
      status: (e, v) => v === "active" ? e.is_active : v === "inactive" ? !e.is_active : true,
    },
  });

  return (
    <AppLayout title="Empleados">
      <div className="space-y-4">
        <StatRow>
          <MiniStatCard label="Total" value={employees.length} icon={Users} tone="primary" />
          <MiniStatCard label="Activos" value={active} icon={UserCheck} tone="success" />
          <MiniStatCard label="Nómina mensual" value={`$${totalSalary.toLocaleString()}`} icon={Briefcase} />
          <MiniStatCard label="Adelantos pendientes" value={`$${totalAdvances.toLocaleString()}`} icon={Wallet} tone={totalAdvances > 0 ? "warning" : "default"} />
        </StatRow>

        <TableToolbar
          search={table.search}
          onSearchChange={table.setSearch}
          searchPlaceholder="Buscar empleado, puesto..."
          filters={[{
            key: "status", label: "Estado", value: table.filters.status || "__all__",
            onChange: (v) => table.setFilter("status", v),
            options: [{ value: "active", label: "Activos" }, { value: "inactive", label: "Inactivos" }],
          }]}
          rightSlot={
            <>
              <ExportButton
                rows={table.filtered}
                filename="empleados"
                title="Empleados"
                columns={[
                  { key: "name", label: "Nombre" },
                  { key: "position", label: "Puesto" },
                  { key: "phone", label: "Teléfono" },
                  { key: "email", label: "Email" },
                  { key: "salary", label: "Salario" },
                  { key: "balance", label: "Adelantos" },
                  { key: "is_active", label: "Activo" },
                ]}
              />
              <Button onClick={openNew} size="sm" className="gradient-brand text-primary-foreground gap-2 h-9">
                <Plus className="h-4 w-4" /> Nuevo
              </Button>
            </>
          }
        />

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
                <TableHead className="w-28">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.paged.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium cursor-pointer hover:text-primary transition-colors" onClick={() => openDetail(e)}>{e.name}</TableCell>
                  <TableCell>{e.position || "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell">{e.phone || "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{e.email || "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">${e.salary.toLocaleString()}</TableCell>
                  <TableCell><Badge variant={e.is_active ? "default" : "secondary"}>{e.is_active ? "Activo" : "Inactivo"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <button onClick={() => openDetail(e)} className="p-1.5 rounded hover:bg-primary/10 text-primary transition-colors" title="Historial"><History className="h-3.5 w-3.5" /></button>
                      <button onClick={() => openEdit(e)} className="p-1.5 rounded hover:bg-muted transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                      <button onClick={() => handleDelete(e.id, e.name)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {table.total === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    {loading ? "Cargando..." : "No hay empleados"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination page={table.page} pageSize={table.pageSize} total={table.total}
            onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Empleado" : "Nuevo Empleado"}</DialogTitle>
            <DialogDescription>Ingresa los datos del empleado</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
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
