import { AppLayout } from "@/components/AppLayout";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { logActivity } from "@/hooks/useActivityLog";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit2, Trash2, Truck, Wallet, DollarSign, Package, History, ArrowUpFromLine } from "lucide-react";
import { useServerTable, useTableStats } from "@/hooks/useServerTable";
import { TableToolbar } from "@/components/data/TableToolbar";
import { ExportButton } from "@/components/data/ExportButton";
import { TablePagination } from "@/components/data/TablePagination";
import { TableDataState } from "@/components/data/DataState";
import { MiniStatCard, StatRow } from "@/components/data/MiniStatCard";

import { MultiPaymentDialog } from "@/components/payments/MultiPaymentDialog";

interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  rfc: string | null;
  address: string | null;
  balance: number;
  is_active: boolean;
}

export default function Proveedores() {
  const { t } = useTranslation();
  const tenantId = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const nav = useNavigate();
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: "", contact_name: "", phone: "", email: "", rfc: "", address: "" });
  const [payOpen, setPayOpen] = useState(false);
  const [paying, setPaying] = useState<Supplier | null>(null);

  const table = useServerTable<Supplier>({
    table: "suppliers",
    select: "id,name,contact_name,phone,email,rfc,address,balance,is_active",
    searchColumns: ["name", "contact_name", "phone", "email", "rfc"],
    orderBy: { column: "name", ascending: true },
    scope: tenantId,
    filterFns: {
      debt: (q, v) => (v === "with" ? q.gt("balance", 0) : q.lte("balance", 0)),
      status: (q, v) => q.eq("is_active", v === "active"),
    },
  });

  const statsQuery = useTableStats<{ balance: number }>("suppliers", "balance", { scope: tenantId });
  const statRows = statsQuery.data ?? [];

  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from as any)("supplier_products").select("supplier_id");
      const c: Record<string, number> = {};
      (data || []).forEach((r: any) => { c[r.supplier_id] = (c[r.supplier_id] || 0) + 1; });
      setProductCounts(c);
    })();
  }, [tenantId]);

  const fetchAll = () => { table.invalidate(); statsQuery.refetch(); };


  const openNew = () => {
    setEditing(null);
    setForm({ name: "", contact_name: "", phone: "", email: "", rfc: "", address: "" });
    setOpen(true);
  };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({
      name: s.name, contact_name: s.contact_name || "", phone: s.phone || "",
      email: s.email || "", rfc: s.rfc || "", address: s.address || "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Nombre requerido", variant: "destructive" }); return; }
    const payload = { ...form, name: form.name.trim(), tenant_id: tenantId };
    if (editing) {
      const { error } = await (supabase.from as any)("suppliers").update(payload).eq("id", editing.id);
      if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
      await logActivity({ entity_type: "supplier", entity_id: editing.id, action: "Proveedor actualizado", description: `Se actualizó ${payload.name}`, tenant_id: tenantId, performed_by: user?.id });
      toast({ title: "Proveedor actualizado" });
    } else {
      const { data, error } = await (supabase.from as any)("suppliers").insert(payload).select("id").single();
      if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
      if (data) await logActivity({ entity_type: "supplier", entity_id: data.id, action: "Proveedor creado", description: `Se creó ${payload.name}`, tenant_id: tenantId, performed_by: user?.id });
      toast({ title: "Proveedor creado" });
    }
    setOpen(false); fetchAll();
  };

  const remove = async (s: Supplier) => {
    if (!confirm(`Eliminar ${s.name}?`)) return;
    const { error } = await (supabase.from as any)("suppliers").delete().eq("id", s.id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    await logActivity({ entity_type: "supplier", entity_id: s.id, action: "Proveedor eliminado", description: `Se eliminó ${s.name}`, tenant_id: tenantId, performed_by: user?.id });
    toast({ title: "Eliminado" }); fetchAll();
  };

  const totalDebt = statRows.reduce((a, s) => a + Math.max(0, Number(s.balance) || 0), 0);
  const withDebt = statRows.filter((s) => Number(s.balance) > 0).length;
  const totalProducts = Object.values(productCounts).reduce((a, b) => a + b, 0);

  return (
    <AppLayout title={t("modules.suppliers.title")}>
      <div className="space-y-4">
        <StatRow>
          <MiniStatCard label="Proveedores" value={statRows.length} icon={Truck} tone="primary" />

          <MiniStatCard label="Con saldo" value={withDebt} icon={Wallet} tone={withDebt > 0 ? "warning" : "default"} />
          <MiniStatCard label="Por pagar" value={`$${totalDebt.toLocaleString()}`} icon={DollarSign} tone={totalDebt > 0 ? "destructive" : "success"} />
          <MiniStatCard label="Productos" value={totalProducts} icon={Package} />
        </StatRow>

        <TableToolbar
          search={table.search}
          onSearchChange={table.setSearch}
          searchPlaceholder="Buscar proveedor, contacto, RFC..."
          filters={[
            { key: "debt", label: "Saldo", value: table.filters.debt || "__all__",
              onChange: (v) => table.setFilter("debt", v),
              options: [{ value: "with", label: "Con saldo" }, { value: "without", label: "Sin saldo" }] },
            { key: "status", label: "Estado", value: table.filters.status || "__all__",
              onChange: (v) => table.setFilter("status", v),
              options: [{ value: "active", label: "Activos" }, { value: "inactive", label: "Inactivos" }] },
          ]}
          rightSlot={
            <>
              <ExportButton rows={table.rows} filename="proveedores" title="Proveedores"
                columns={[
                  { key: "name", label: "Nombre" }, { key: "contact_name", label: "Contacto" },
                  { key: "phone", label: "Teléfono" }, { key: "email", label: "Email" },
                  { key: "rfc", label: "RFC" }, { key: "balance", label: "Saldo" },
                ]} />
              <Button onClick={openNew} size="sm" className="gradient-brand text-primary-foreground gap-2 h-9">
                <Plus className="h-4 w-4" />{t("modules.suppliers.newSupplier")}
              </Button>
            </>
          }
        />

        <div className="bg-card rounded-xl shadow-card border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Nombre</TableHead>
                <TableHead className="text-xs hidden sm:table-cell">Contacto</TableHead>
                <TableHead className="text-xs hidden md:table-cell">Teléfono</TableHead>
                <TableHead className="text-xs hidden lg:table-cell">Email</TableHead>
                <TableHead className="text-xs text-right">Productos</TableHead>
                <TableHead className="text-xs text-right">Saldo</TableHead>
                <TableHead className="text-xs w-32">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((s) => {
                const debt = Number(s.balance || 0);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs font-medium cursor-pointer hover:text-primary" onClick={() => nav(`/proveedores/${s.id}`)}>
                      {s.name}
                      {!s.is_active && <Badge variant="secondary" className="ml-2 text-[10px]">Inactivo</Badge>}
                    </TableCell>
                    <TableCell className="text-xs hidden sm:table-cell text-muted-foreground">{s.contact_name || "—"}</TableCell>
                    <TableCell className="text-xs hidden md:table-cell text-muted-foreground">{s.phone || "—"}</TableCell>
                    <TableCell className="text-xs hidden lg:table-cell text-muted-foreground">{s.email || "—"}</TableCell>
                    <TableCell className="text-xs text-right">{productCounts[s.id] || 0}</TableCell>
                    <TableCell className="text-xs text-right">
                      <Badge variant="outline" className={`text-[10px] ${debt > 0 ? "bg-warning/10 text-warning" : "bg-muted"}`}>
                        ${debt.toFixed(2)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <button onClick={() => nav(`/proveedores/${s.id}`)} className="p-1.5 rounded hover:bg-primary/10 text-primary" title={t("modules.suppliers.history")}><History className="h-3.5 w-3.5" /></button>
                        {debt > 0 && (
                          <button onClick={() => { setPaying(s); setPayOpen(true); }} className="p-1.5 rounded hover:bg-warning/10 text-warning" title={t("modules.suppliers.payBalance")}><ArrowUpFromLine className="h-3.5 w-3.5" /></button>
                        )}
                        <button onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-muted"><Edit2 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => remove(s)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {table.total === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  <Truck className="h-8 w-8 mx-auto mb-2 opacity-30" />Sin proveedores
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination page={table.page} pageSize={table.pageSize} total={table.total}
            onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Proveedor" : "Nuevo Proveedor"}</DialogTitle>
            <DialogDescription>Datos del proveedor y contacto comercial</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Nombre *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Contacto</Label><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <div><Label>RFC / NIT</Label><Input value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value })} /></div>
            <div><Label>Dirección</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} className="gradient-brand text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {paying && (
        <MultiPaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          partyType="supplier"
          partyId={paying.id}
          partyName={paying.name}
          amountDue={Math.max(0, Number(paying.balance || 0))}
          referenceType={null}
          title={t("modules.suppliers.payTitle")}
          onPaid={fetchAll}
        />
      )}
    </AppLayout>
  );
}
