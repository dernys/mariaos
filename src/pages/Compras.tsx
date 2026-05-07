import { AppLayout } from "@/components/AppLayout";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, CheckCircle2, XCircle, Truck, ShoppingCart, FileText, DollarSign, Wallet } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { useTableState } from "@/hooks/useTableState";
import { TableToolbar } from "@/components/data/TableToolbar";
import { ExportButton } from "@/components/data/ExportButton";
import { TablePagination } from "@/components/data/TablePagination";
import { MiniStatCard, StatRow } from "@/components/data/MiniStatCard";

interface Supplier { id: string; name: string; balance: number; phone?: string | null; email?: string | null; }
interface Product { id: string; name: string; sku: string; cost: number; }
interface Loc { id: string; name: string; type: "warehouse" | "store"; }
interface Purchase {
  id: string; purchase_number: string; status: string; supplier_id: string | null;
  destination_type: string; destination_id: string;
  subtotal: number; tax: number; total: number; amount_paid: number; payment_status: string;
  notes: string | null; created_at: string; received_at: string | null;
}

const statusBadge = (s: string) => {
  const m: Record<string, { c: string; l: string }> = {
    draft: { c: "bg-warning/10 text-warning", l: "Borrador" },
    received: { c: "bg-success/10 text-success", l: "Recibida" },
    cancelled: { c: "bg-destructive/10 text-destructive", l: "Cancelada" },
  };
  return m[s] || { c: "bg-muted", l: s };
};

export default function Compras() {
  const tenantId = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Loc[]>([]);
  const [stores, setStores] = useState<Loc[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  const [open, setOpen] = useState(false);
  const [openSup, setOpenSup] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<Purchase | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payNotes, setPayNotes] = useState("");

  // Supplier form
  const [supName, setSupName] = useState("");
  const [supPhone, setSupPhone] = useState("");
  const [supEmail, setSupEmail] = useState("");
  const [supTaxId, setSupTaxId] = useState("");

  // Purchase form
  const [supplierId, setSupplierId] = useState("");
  const [destType, setDestType] = useState<"warehouse" | "store">("warehouse");
  const [destId, setDestId] = useState("");
  const [tax, setTax] = useState("0");
  const [notes, setNotes] = useState("");
  const [amountPaid, setAmountPaid] = useState("0");
  const [items, setItems] = useState<{ product_id: string; qty: string; cost: string }[]>([
    { product_id: "", qty: "1", cost: "0" },
  ]);

  const fetchAll = async () => {
    const [supR, prR, whR, stR, pchR] = await Promise.all([
      (supabase.from as any)("suppliers").select("*").order("name"),
      supabase.from("products").select("id, name, sku, cost").order("name"),
      supabase.from("warehouses").select("id, name").order("name"),
      supabase.from("stores").select("id, name").order("name"),
      (supabase.from as any)("purchases").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    setSuppliers(supR.data || []);
    setProducts(prR.data || []);
    setWarehouses((whR.data || []).map((w: any) => ({ ...w, type: "warehouse" })));
    setStores((stR.data || []).map((s: any) => ({ ...s, type: "store" })));
    setPurchases(pchR.data || []);
  };

  useEffect(() => { fetchAll(); }, []);

  const subtotal = items.reduce((a, b) => a + (Number(b.qty) || 0) * (Number(b.cost) || 0), 0);
  const total = subtotal + (Number(tax) || 0);

  const resetForm = () => {
    setSupplierId(""); setDestType("warehouse"); setDestId("");
    setTax("0"); setNotes(""); setAmountPaid("0");
    setItems([{ product_id: "", qty: "1", cost: "0" }]);
  };

  const handleCreateSupplier = async () => {
    if (!supName.trim()) { toast({ title: "Nombre requerido", variant: "destructive" }); return; }
    const { error } = await (supabase.from as any)("suppliers").insert({
      tenant_id: tenantId, name: supName.trim(), phone: supPhone || null, email: supEmail || null, tax_id: supTaxId || null,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Proveedor creado" });
    setOpenSup(false); setSupName(""); setSupPhone(""); setSupEmail(""); setSupTaxId("");
    fetchAll();
  };

  const handleCreate = async () => {
    if (!destId) { toast({ title: "Selecciona un destino", variant: "destructive" }); return; }
    const valid = items.filter((it) => it.product_id && Number(it.qty) > 0);
    if (!valid.length) { toast({ title: "Agrega al menos un producto", variant: "destructive" }); return; }
    const paid = Math.max(0, Number(amountPaid) || 0);
    if (paid > 0 && !supplierId) {
      toast({ title: "Proveedor requerido", description: "El pago a crédito requiere proveedor.", variant: "destructive" }); return;
    }
    const isPartial = paid < total - 0.01;
    if (isPartial && !supplierId) {
      toast({ title: "Proveedor requerido", description: "El saldo pendiente requiere proveedor.", variant: "destructive" }); return;
    }

    const code = "PC-" + Date.now().toString(36).toUpperCase();
    const { data: pch, error } = await (supabase.from as any)("purchases").insert({
      tenant_id: tenantId,
      purchase_number: code,
      supplier_id: supplierId || null,
      destination_type: destType,
      destination_id: destId,
      subtotal, tax: Number(tax) || 0, total,
      amount_paid: paid,
      notes: notes || null,
      created_by: user?.id,
      status: "draft",
    }).select("id").single();
    if (error || !pch) { toast({ title: "Error", description: error?.message, variant: "destructive" }); return; }

    const rows = valid.map((it) => {
      const prod = products.find((p) => p.id === it.product_id);
      const qty = Number(it.qty), cost = Number(it.cost);
      return {
        purchase_id: pch.id, product_id: it.product_id,
        product_name: prod?.name || "", sku: prod?.sku || null,
        qty, cost, total: qty * cost,
      };
    });
    const { error: e2 } = await (supabase.from as any)("purchase_items").insert(rows);
    if (e2) { toast({ title: "Error items", description: e2.message, variant: "destructive" }); return; }

    toast({ title: "Compra creada", description: code });
    setOpen(false); resetForm(); fetchAll();
  };

  const receive = async (id: string, isConsignment: boolean) => {
    const fn = isConsignment ? "receive_purchase_consignment" : "receive_purchase";
    const { error } = await supabase.rpc(fn as any, { p_purchase_id: id });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: isConsignment ? "Consignación recibida" : "Compra recibida y stock actualizado" });
    fetchAll();
  };

  const cancel = async (id: string) => {
    const { error } = await (supabase.from as any)("purchases").update({ status: "cancelled" }).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Compra cancelada" });
    fetchAll();
  };

  const openPay = (p: Purchase) => {
    setPayTarget(p);
    setPayAmount(String(Math.max(0, Number(p.total) - Number(p.amount_paid)).toFixed(2)));
    setPayMethod("cash"); setPayNotes("");
    setPayOpen(true);
  };

  const submitPay = async () => {
    if (!payTarget || !payTarget.supplier_id) { toast({ title: "Compra sin proveedor", variant: "destructive" }); return; }
    const amt = Number(payAmount);
    if (!amt || amt <= 0) { toast({ title: "Monto inválido", variant: "destructive" }); return; }
    const { error } = await (supabase.rpc as any)("register_account_payment", {
      p_party_type: "supplier", p_party_id: payTarget.supplier_id,
      p_amount: amt, p_method: payMethod, p_currency: "CUP", p_exchange_rate: 1,
      p_reference_type: "purchase", p_reference_id: payTarget.id, p_notes: payNotes || null,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Pago registrado" });
    setPayOpen(false); fetchAll();
  };

  const supName2 = (id: string | null) => suppliers.find((s) => s.id === id)?.name || "—";
  const locName = (type: string, id: string) => {
    const list = type === "warehouse" ? warehouses : stores;
    return list.find((l) => l.id === id)?.name || "—";
  };

  const purchasesEnriched = useMemo(() => purchases.map((p) => ({
    ...p,
    supplier_name: supName2(p.supplier_id),
    location_name: locName(p.destination_type, p.destination_id),
  })), [purchases, suppliers, warehouses, stores]);

  const purchasesTable = useTableState({
    data: purchasesEnriched,
    searchKeys: ["purchase_number", "supplier_name", "location_name", "notes"],
    filterFns: {
      status: (p, v) => p.status === v,
      payment: (p, v) => {
        const pending = (p.total || 0) - (p.amount_paid || 0);
        if (v === "paid") return pending <= 0.01;
        if (v === "pending") return pending > 0.01;
        return true;
      },
    },
  });

  const suppliersTable = useTableState({
    data: suppliers,
    searchKeys: ["name", "email", "phone"],
    filterFns: {
      debt: (s, v) => v === "with" ? (Number(s.balance) || 0) > 0 : v === "without" ? (Number(s.balance) || 0) <= 0 : true,
    },
  });

  const stats = useMemo(() => {
    const totalPurchases = purchases.length;
    const pendingDraft = purchases.filter((p) => p.status === "draft").length;
    const totalAmount = purchases.reduce((a, p) => a + Number(p.total || 0), 0);
    const totalDebt = purchases.reduce((a, p) => a + Math.max(0, Number(p.total || 0) - Number(p.amount_paid || 0)), 0);
    return { totalPurchases, pendingDraft, totalAmount, totalDebt };
  }, [purchases]);

  return (
    <AppLayout title="Compras">
      <Tabs defaultValue="purchases" className="space-y-4">
        <TabsList>
          <TabsTrigger value="purchases">Órdenes de compra</TabsTrigger>
          <TabsTrigger value="suppliers">Proveedores</TabsTrigger>
        </TabsList>

        <TabsContent value="purchases" className="space-y-4">
          <StatRow>
            <MiniStatCard label="Compras" value={stats.totalPurchases} icon={ShoppingCart} tone="primary" />
            <MiniStatCard label="Borradores" value={stats.pendingDraft} icon={FileText} tone={stats.pendingDraft > 0 ? "warning" : "default"} />
            <MiniStatCard label="Monto total" value={`$${stats.totalAmount.toLocaleString()}`} icon={DollarSign} />
            <MiniStatCard label="Por pagar" value={`$${stats.totalDebt.toLocaleString()}`} icon={Wallet} tone={stats.totalDebt > 0 ? "destructive" : "success"} />
          </StatRow>

          <TableToolbar
            search={purchasesTable.search}
            onSearchChange={purchasesTable.setSearch}
            searchPlaceholder="Buscar nº, proveedor, destino..."
            filters={[
              { key: "status", label: "Estado", value: purchasesTable.filters.status || "__all__",
                onChange: (v) => purchasesTable.setFilter("status", v),
                options: [
                  { value: "draft", label: "Borrador" },
                  { value: "received", label: "Recibida" },
                  { value: "cancelled", label: "Cancelada" },
                ]},
              { key: "payment", label: "Pago", value: purchasesTable.filters.payment || "__all__",
                onChange: (v) => purchasesTable.setFilter("payment", v),
                options: [{ value: "paid", label: "Pagado" }, { value: "pending", label: "Pendiente" }] },
            ]}
            rightSlot={
              <>
                <ExportButton
                  rows={purchasesTable.filtered}
                  filename="compras"
                  title="Órdenes de compra"
                  columns={[
                    { key: "purchase_number", label: "Nº" },
                    { key: "supplier_name", label: "Proveedor" },
                    { key: "location_name", label: "Destino" },
                    { key: "total", label: "Total" },
                    { key: "amount_paid", label: "Pagado" },
                    { key: "status", label: "Estado" },
                    { key: "created_at", label: "Fecha" },
                  ]}
                />
                <Button size="sm" className="gap-1 gradient-brand text-primary-foreground h-9" onClick={() => setOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Nueva Compra
                </Button>
              </>
            }
          />

          <div className="bg-card rounded-xl shadow-card border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nº</TableHead>
                  <TableHead className="text-xs">Proveedor</TableHead>
                  <TableHead className="text-xs">Destino</TableHead>
                  <TableHead className="text-xs">Total</TableHead>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                  <TableHead className="text-xs w-44">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchasesTable.paged.map((p) => {
                  const st = statusBadge(p.status);
                  const pending = Number(p.total || 0) - Number(p.amount_paid || 0);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs font-heading font-semibold">{p.purchase_number}</TableCell>
                      <TableCell className="text-xs">{p.supplier_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px] mr-1">{p.destination_type === "warehouse" ? "Alm." : "Tnd."}</Badge>
                        {p.location_name}
                      </TableCell>
                      <TableCell className="text-xs font-heading font-bold">
                        ${Number(p.total).toFixed(2)}
                        {pending > 0.01 && <span className="block text-[9px] text-destructive font-normal">Debe ${pending.toFixed(2)}</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{format(new Date(p.created_at), "dd/MM/yy HH:mm")}</TableCell>
                      <TableCell><Badge variant="outline" className={`text-[10px] ${st.c}`}>{st.l}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {p.status === "draft" && (
                            <>
                              <Button size="sm" className="h-7 text-[10px] gradient-brand text-primary-foreground" onClick={() => receive(p.id, (p as any).is_consignment)}>
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Recibir
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-[10px] text-destructive" onClick={() => cancel(p.id)}>
                                <XCircle className="h-3 w-3 mr-1" /> Cancelar
                              </Button>
                            </>
                          )}
                          {pending > 0.01 && p.supplier_id && (
                            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => openPay(p)}>
                              <Wallet className="h-3 w-3 mr-1" /> Pagar
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {purchasesTable.total === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" /> Sin compras
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination page={purchasesTable.page} pageSize={purchasesTable.pageSize} total={purchasesTable.total}
              onPageChange={purchasesTable.setPage} onPageSizeChange={purchasesTable.setPageSize} />
          </div>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          <StatRow>
            <MiniStatCard label="Proveedores" value={suppliers.length} icon={Truck} tone="primary" />
            <MiniStatCard label="Con saldo" value={suppliers.filter((s) => Number(s.balance || 0) > 0).length} icon={Wallet} tone="warning" />
            <MiniStatCard label="Total por pagar" value={`$${suppliers.reduce((a, s) => a + Math.max(0, Number(s.balance) || 0), 0).toLocaleString()}`} icon={DollarSign} tone="destructive" />
          </StatRow>

          <TableToolbar
            search={suppliersTable.search}
            onSearchChange={suppliersTable.setSearch}
            searchPlaceholder="Buscar proveedor..."
            filters={[{
              key: "debt", label: "Saldo", value: suppliersTable.filters.debt || "__all__",
              onChange: (v) => suppliersTable.setFilter("debt", v),
              options: [{ value: "with", label: "Con saldo" }, { value: "without", label: "Sin saldo" }],
            }]}
            rightSlot={
              <Button size="sm" className="gap-1 gradient-brand text-primary-foreground h-9" onClick={() => setOpenSup(true)}>
                <Plus className="h-3.5 w-3.5" /> Nuevo Proveedor
              </Button>
            }
          />

          <div className="bg-card rounded-xl shadow-card border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nombre</TableHead>
                  <TableHead className="text-xs">Teléfono</TableHead>
                  <TableHead className="text-xs">Email</TableHead>
                  <TableHead className="text-xs">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppliersTable.paged.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs font-medium">{s.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.phone || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.email || "—"}</TableCell>
                    <TableCell className="text-xs font-heading font-bold">${Number(s.balance || 0).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {suppliersTable.total === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-xs text-muted-foreground">Sin proveedores</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination page={suppliersTable.page} pageSize={suppliersTable.pageSize} total={suppliersTable.total}
              onPageChange={suppliersTable.setPage} onPageSizeChange={suppliersTable.setPageSize} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Supplier dialog */}
      <Dialog open={openSup} onOpenChange={setOpenSup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Proveedor</DialogTitle>
            <DialogDescription>Datos básicos de contacto</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Nombre *</Label><Input value={supName} onChange={(e) => setSupName(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Teléfono</Label><Input value={supPhone} onChange={(e) => setSupPhone(e.target.value)} /></div>
              <div><Label>Email</Label><Input value={supEmail} onChange={(e) => setSupEmail(e.target.value)} /></div>
            </div>
            <div><Label>RFC / NIT</Label><Input value={supTaxId} onChange={(e) => setSupTaxId(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenSup(false)}>Cancelar</Button>
            <Button onClick={handleCreateSupplier} className="gradient-brand text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purchase dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Compra</DialogTitle>
            <DialogDescription>Registra una orden y al recibirla se sumará al stock del destino</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Proveedor</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Destino</Label>
                <div className="flex gap-2">
                  <Select value={destType} onValueChange={(v) => { setDestType(v as any); setDestId(""); }}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="warehouse">Almacén</SelectItem>
                      <SelectItem value="store">Tienda</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={destId} onValueChange={setDestId}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {(destType === "warehouse" ? warehouses : stores).map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <Label className="text-xs font-semibold">Productos</Label>
                <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setItems([...items, { product_id: "", qty: "1", cost: "0" }])}>
                  <Plus className="h-3 w-3 mr-1" /> Agregar
                </Button>
              </div>
              <div className="space-y-2">
                {items.map((it, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Select value={it.product_id} onValueChange={(v) => {
                      const arr = [...items]; arr[i].product_id = v;
                      const p = products.find((x) => x.id === v);
                      if (p && Number(arr[i].cost) === 0) arr[i].cost = String(p.cost || 0);
                      setItems(arr);
                    }}>
                      <SelectTrigger className="flex-1 h-9 text-xs"><SelectValue placeholder="Producto" /></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input type="number" min="1" className="w-20 h-9 text-xs" placeholder="Cant"
                      value={it.qty} onChange={(e) => { const a = [...items]; a[i].qty = e.target.value; setItems(a); }} />
                    <Input type="number" min="0" className="w-24 h-9 text-xs" placeholder="Costo"
                      value={it.cost} onChange={(e) => { const a = [...items]; a[i].cost = e.target.value; setItems(a); }} />
                    <Button size="icon" variant="ghost" className="h-9 w-9 text-destructive" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Subtotal</Label><Input value={subtotal.toFixed(2)} disabled /></div>
              <div><Label className="text-xs">Impuesto</Label><Input type="number" value={tax} onChange={(e) => setTax(e.target.value)} /></div>
              <div><Label className="text-xs">Total</Label><Input value={total.toFixed(2)} disabled className="font-bold" /></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Pagado al proveedor</Label>
                <Input type="number" min="0" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Saldo pendiente: <span className="font-bold">${Math.max(0, total - (Number(amountPaid)||0)).toFixed(2)}</span>
                  {Number(amountPaid) < total - 0.01 && supplierId ? " — Se sumará a la deuda del proveedor" : ""}
                </p>
              </div>
              <div><Label className="text-xs">Notas</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="gradient-brand text-primary-foreground" onClick={handleCreate}>Crear Compra</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
