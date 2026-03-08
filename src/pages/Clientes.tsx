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
import { Plus, Search, Edit2, Trash2, User, History, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

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

const Clientes = () => {
  const { user } = useAuth();
  const tenantId = useTenant();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);
  const [customerSales, setCustomerSales] = useState<Sale[]>([]);
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

  const openDetail = async (c: Customer) => {
    setDetailCustomer(c);
    const { data } = await supabase.from("sales").select("id, total, amount_paid, status, created_at").eq("customer_id", c.id).order("created_at", { ascending: false }).limit(50);
    setCustomerSales((data as Sale[]) || []);
  };

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

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) || (c.email || "").toLowerCase().includes(search.toLowerCase()) || (c.phone || "").includes(search)
  );

  return (
    <AppLayout title="Clientes">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Button onClick={openNew} className="gradient-brand text-primary-foreground gap-2">
            <Plus className="h-4 w-4" /> Nuevo Cliente
          </Button>
        </div>

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
              {filtered.map((c) => (
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
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    {loading ? "Cargando..." : "No hay clientes"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
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

      {/* Detail Dialog with History */}
      <Dialog open={!!detailCustomer} onOpenChange={() => setDetailCustomer(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailCustomer?.name}</DialogTitle>
            <DialogDescription>
              Saldo: <Badge variant={detailCustomer?.balance && detailCustomer.balance > 0 ? "destructive" : "secondary"}>${detailCustomer?.balance?.toLocaleString() || 0}</Badge>
              {" "}Límite: ${detailCustomer?.credit_limit?.toLocaleString() || 0}
            </DialogDescription>
          </DialogHeader>
          {detailCustomer && (
            <Tabs defaultValue="sales">
              <TabsList className="w-full">
                <TabsTrigger value="sales" className="flex-1">Compras</TabsTrigger>
                <TabsTrigger value="activity" className="flex-1">Actividad</TabsTrigger>
              </TabsList>
              <TabsContent value="sales" className="max-h-64 overflow-y-auto">
                {customerSales.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Sin compras registradas</p>
                ) : (
                  <div className="space-y-2">
                    {customerSales.map((s) => (
                      <div key={s.id} className="flex items-center justify-between bg-muted/40 rounded-lg p-3">
                        <div>
                          <p className="text-xs font-medium">${s.total.toLocaleString()}</p>
                          <p className="text-[10px] text-muted-foreground">{format(new Date(s.created_at), "dd/MM/yyyy HH:mm")}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={s.status === "paid" ? "default" : s.status === "partial" ? "outline" : "secondary"} className="text-[10px]">
                            {s.status === "paid" ? "Pagado" : s.status === "partial" ? "Parcial" : s.status}
                          </Badge>
                          {s.amount_paid < s.total && (
                            <span className="text-[10px] text-destructive font-heading font-semibold">
                              Deuda: ${(s.total - s.amount_paid).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="activity">
                <ActivityTimeline entityType="customer" entityId={detailCustomer.id} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Clientes;
