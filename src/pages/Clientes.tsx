import { AppLayout } from "@/components/AppLayout";
import { useState, useEffect } from "react";
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
import { Plus, Edit2, Trash2, User, History, Wallet, AlertTriangle, Users as UsersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { useTableState } from "@/hooks/useTableState";
import { TableToolbar } from "@/components/data/TableToolbar";
import { ExportButton } from "@/components/data/ExportButton";
import { TablePagination } from "@/components/data/TablePagination";
import { MiniStatCard, StatRow } from "@/components/data/MiniStatCard";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  rfc: string | null;
  credit_limit: number;
  balance: number;
  notes: string | null;
}

interface Sale {
  id: string;
  total: number;
  amount_paid: number;
  status: string;
  created_at: string;
}

import { useNavigate } from "react-router-dom";

const Clientes = () => {
  const { user } = useAuth();
  const tenantId = useTenant();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", rfc: "", credit_limit: "0", notes: "" });
  const { toast } = useToast();

  const fetchCustomers = async () => {
    const { data, error } = await supabase.from("customers").select("*").order("name");
    if (!error && data) setCustomers(data as Customer[]);
    setLoading(false);
  };

  useEffect(() => { fetchCustomers(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", phone: "", email: "", address: "", rfc: "", credit_limit: "0", notes: "" });
    setDialogOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone || "", email: c.email || "", address: c.address || "", rfc: c.rfc || "", credit_limit: String(c.credit_limit), notes: c.notes || "" });
    setDialogOpen(true);
  };

  const openDetail = (c: Customer) => navigate(`/clientes/${c.id}`);

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: "Error", description: "El nombre es obligatorio", variant: "destructive" }); return; }
    const payload = {
      name: form.name.trim(), phone: form.phone || null, email: form.email || null,
      address: form.address || null, rfc: form.rfc || null,
      credit_limit: parseFloat(form.credit_limit) || 0, notes: form.notes || null, tenant_id: tenantId,
    };
    if (editing) {
      const { error } = await supabase.from("customers").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      await logActivity({ entity_type: "customer", entity_id: editing.id, action: "Cliente actualizado", description: `Se actualizó ${payload.name}`, tenant_id: tenantId, performed_by: user?.id });
      toast({ title: "Cliente actualizado" });
    } else {
      const { data, error } = await supabase.from("customers").insert(payload).select("id").single();
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      if (data) await logActivity({ entity_type: "customer", entity_id: data.id, action: "Cliente creado", description: `Se creó ${payload.name}`, tenant_id: tenantId, performed_by: user?.id });
      toast({ title: "Cliente creado" });
    }
    setDialogOpen(false);
    fetchCustomers();
  };

  const handleDelete = async (id: string, name: string) => {
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await logActivity({ entity_type: "customer", entity_id: id, action: "Cliente eliminado", description: `Se eliminó ${name}`, tenant_id: tenantId, performed_by: user?.id });
    toast({ title: "Cliente eliminado" });
    fetchCustomers();
  };

  const totalDebt = customers.reduce((a, c) => a + Math.max(0, Number(c.balance) || 0), 0);
  const totalCredit = customers.reduce((a, c) => a + (Number(c.credit_limit) || 0), 0);
  const withDebt = customers.filter((c) => (c.balance || 0) > 0).length;

  const table = useTableState({
    data: customers,
    searchKeys: ["name", "email", "phone", "rfc"],
    filterFns: {
      status: (c, v) => v === "debt" ? (c.balance || 0) > 0 : v === "ok" ? (c.balance || 0) <= 0 : true,
    },
  });

  return (
    <AppLayout title="Clientes">
      <div className="space-y-4">
        <StatRow>
          <MiniStatCard label="Clientes" value={customers.length} icon={UsersIcon} tone="primary" />
          <MiniStatCard label="Con deuda" value={withDebt} icon={AlertTriangle} tone={withDebt > 0 ? "warning" : "default"} />
          <MiniStatCard label="Saldo por cobrar" value={`$${totalDebt.toLocaleString()}`} icon={Wallet} tone={totalDebt > 0 ? "destructive" : "success"} />
          <MiniStatCard label="Crédito otorgado" value={`$${totalCredit.toLocaleString()}`} tone="default" />
        </StatRow>

        <TableToolbar
          search={table.search}
          onSearchChange={table.setSearch}
          searchPlaceholder="Buscar cliente, email, teléfono..."
          filters={[{
            key: "status", label: "Estado", value: table.filters.status || "__all__",
            onChange: (v) => table.setFilter("status", v),
            options: [{ value: "debt", label: "Con deuda" }, { value: "ok", label: "Sin deuda" }],
          }]}
          rightSlot={
            <>
              <ExportButton
                rows={table.filtered}
                filename="clientes"
                title="Clientes"
                columns={[
                  { key: "name", label: "Nombre" },
                  { key: "phone", label: "Teléfono" },
                  { key: "email", label: "Email" },
                  { key: "rfc", label: "RFC" },
                  { key: "balance", label: "Saldo" },
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
                <TableHead className="hidden sm:table-cell">Teléfono</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden lg:table-cell">RFC</TableHead>
                <TableHead>Límite Crédito</TableHead>
                <TableHead>Saldo</TableHead>
                <TableHead className="w-28">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.paged.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium cursor-pointer hover:text-primary transition-colors" onClick={() => openDetail(c)}>{c.name}</TableCell>
                  <TableCell className="hidden sm:table-cell">{c.phone || "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{c.email || "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{c.rfc || "—"}</TableCell>
                  <TableCell>${c.credit_limit.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={c.balance > 0 ? "destructive" : "secondary"}>${c.balance.toLocaleString()}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <button onClick={() => openDetail(c)} className="p-1.5 rounded hover:bg-primary/10 text-primary transition-colors" title="Historial">
                        <History className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-muted transition-colors"><Edit2 className="h-3.5 w-3.5" /></button>
                      <button onClick={() => handleDelete(c.id, c.name)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {table.total === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    {loading ? "Cargando..." : "No hay clientes"}
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
            <DialogTitle>{editing ? "Editar Cliente" : "Nuevo Cliente"}</DialogTitle>
            <DialogDescription>Ingresa los datos del cliente</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <div><Label>Dirección</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>RFC</Label><Input value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value })} /></div>
              <div><Label>Límite de Crédito</Label><Input type="number" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: e.target.value })} /></div>
            </div>
            <div><Label>Notas</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="gradient-brand text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

  );
};

export default Clientes;
