import { AppLayout } from "@/components/AppLayout";
import { useTranslation } from "react-i18next";
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
import { MultiPaymentDialog } from "@/components/payments/MultiPaymentDialog";
import { useTaxRates } from "@/hooks/useTaxRates";

interface Supplier { id: string; name: string; balance: number; phone?: string | null; email?: string | null; }
interface Product { id: string; name: string; sku: string; cost: number; }
interface Loc { id: string; name: string; type: "warehouse" | "store"; }
interface Purchase {
  id: string; purchase_number: string; status: string; supplier_id: string | null;
  destination_type: string; destination_id: string;
  subtotal: number; tax: number; total: number; amount_paid: number; payment_status: string;
  notes: string | null; created_at: string; received_at: string | null;
  tax_rate_id?: string | null;
}
interface PayLine { id: string; method: string; currency: string; amount: string; rate: string; }
interface PaymentMethodRow { id: string; name: string; type: string; }
interface CurrencyRow { id: string; code: string; exchange_rate: number; is_base: boolean; }

const statusBadge = (s: string) => {
  const m: Record<string, { c: string; l: string }> = {
    draft: { c: "bg-warning/10 text-warning", l: "Borrador" },
    received: { c: "bg-success/10 text-success", l: "Recibida" },
    cancelled: { c: "bg-destructive/10 text-destructive", l: "Cancelada" },
  };
  return m[s] || { c: "bg-muted", l: s };
};

export default function Compras() {
  const { t } = useTranslation();
  const tenantId = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const { taxes, defaultTax } = useTaxRates();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Loc[]>([]);
  const [stores, setStores] = useState<Loc[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([]);
  const [currenciesList, setCurrenciesList] = useState<CurrencyRow[]>([]);

  const [open, setOpen] = useState(false);
  const [openSup, setOpenSup] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<Purchase | null>(null);

  // Supplier form
  const [supName, setSupName] = useState("");
  const [supPhone, setSupPhone] = useState("");
  const [supEmail, setSupEmail] = useState("");
  const [supTaxId, setSupTaxId] = useState("");

  // Purchase form
  const [supplierId, setSupplierId] = useState("");
  const [destType, setDestType] = useState<"warehouse" | "store">("warehouse");
  const [destId, setDestId] = useState("");
  const [taxRateId, setTaxRateId] = useState<string>("none");
  const [taxOverride, setTaxOverride] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<{ product_id: string; qty: string; cost: string }[]>([
    { product_id: "", qty: "1", cost: "0" },
  ]);
  const [payLines, setPayLines] = useState<PayLine[]>([]);

  const fetchAll = async () => {
    const [supR, prR, whR, stR, pchR, pmR, curR] = await Promise.all([
      (supabase.from as any)("suppliers").select("*").order("name"),
      supabase.from("products").select("id, name, sku, cost").order("name"),
      supabase.from("warehouses").select("id, name").order("name"),
      supabase.from("stores").select("id, name").order("name"),
      (supabase.from as any)("purchases").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("payment_methods").select("id, name, type").eq("is_active", true).order("name"),
      supabase.from("currencies").select("id, code, exchange_rate, is_base").eq("is_active", true).order("is_base", { ascending: false }),
    ]);
    setSuppliers(supR.data || []);
    setProducts(prR.data || []);
    setWarehouses((whR.data || []).map((w: any) => ({ ...w, type: "warehouse" })));
    setStores((stR.data || []).map((s: any) => ({ ...s, type: "store" })));
    setPurchases(pchR.data || []);
    setPaymentMethods((pmR.data as any) || []);
    setCurrenciesList((curR.data as any) || []);
  };

  useEffect(() => { fetchAll(); }, []);

  const subtotal = items.reduce((a, b) => a + (Number(b.qty) || 0) * (Number(b.cost) || 0), 0);
  const selectedTax = taxes.find((t) => t.id === taxRateId);
  const computedTax = taxOverride !== "" ? Number(taxOverride) || 0 : (selectedTax ? subtotal * (selectedTax.rate / 100) : 0);
  const total = subtotal + computedTax;
  const totalPaidLines = payLines.reduce((s, l) => s + (parseFloat(l.amount) || 0) * (parseFloat(l.rate) || 1), 0);
  const pendingAfterPay = Math.max(0, total - totalPaidLines);

  const resetForm = () => {
    setSupplierId(""); setDestType("warehouse"); setDestId("");
    setTaxRateId(defaultTax?.id || "none"); setTaxOverride("");
    setNotes("");
    setItems([{ product_id: "", qty: "1", cost: "0" }]);
    setPayLines([]);
  };

  // Set default tax when taxes load
  useEffect(() => {
    if (defaultTax && taxRateId === "none") setTaxRateId(defaultTax.id);
  }, [defaultTax]);

  const addPayLine = () => {
    const baseC = currenciesList.find((c) => c.is_base) || currenciesList[0];
    const defM = paymentMethods.find((m) => m.type === "cash") || paymentMethods[0];
    setPayLines((p) => [...p, {
      id: crypto.randomUUID(),
      method: defM?.type || "cash",
      currency: baseC?.code || "CUP",
      amount: pendingAfterPay > 0 ? pendingAfterPay.toFixed(2) : "0",
      rate: String(baseC?.exchange_rate || 1),
    }]);
  };
  const removePayLine = (id: string) => setPayLines((p) => p.filter((l) => l.id !== id));
  const updatePayLine = (id: string, patch: Partial<PayLine>) => setPayLines((prev) => prev.map((l) => {
    if (l.id !== id) return l;
    const next = { ...l, ...patch };
    if (patch.currency) {
      const cur = currenciesList.find((c) => c.code === patch.currency);
      if (cur) next.rate = String(cur.exchange_rate);
    }
    return next;
  }));

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
    const paid = totalPaidLines;
    if (paid > total + 0.01) {
      toast({ title: "Pago excede el total", variant: "destructive" }); return;
    }
    if (paid < total - 0.01 && !supplierId) {
      toast({ title: "Proveedor requerido", description: "El saldo pendiente requiere proveedor.", variant: "destructive" }); return;
    }
    if (paid > 0 && !supplierId) {
      toast({ title: "Proveedor requerido", description: "Para registrar pagos selecciona un proveedor.", variant: "destructive" }); return;
    }

    const code = "PC-" + Date.now().toString(36).toUpperCase();
    const { data: pch, error } = await (supabase.from as any)("purchases").insert({
      tenant_id: tenantId,
      purchase_number: code,
      supplier_id: supplierId || null,
      destination_type: destType,
      destination_id: destId,
      subtotal, tax: computedTax, total,
      tax_rate_id: taxRateId !== "none" ? taxRateId : null,
      amount_paid: 0,
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

    if (supplierId && payLines.length > 0) {
      for (const l of payLines) {
        const amt = parseFloat(l.amount) || 0;
        if (amt <= 0) continue;
        const ctx = beginOperation({
          module: "purchasing",
          operation: "register_account_payment",
          tenant_id: tenantId,
          correlationId: `purchase-pay:${pch.id}:${l.id}`,
        });
        const { error: pe } = await callFinancialRpc("register_account_payment", {
          p_party_type: "supplier",
          p_party_id: supplierId,
          p_amount: amt,
          p_method: l.method,
          p_currency: l.currency,
          p_exchange_rate: parseFloat(l.rate) || 1,
          p_reference_type: "purchase",
          p_reference_id: pch.id,
          p_notes: `Pago al crear compra ${code}`,
        }, ctx);
        if (pe) { toast({ title: "Error registrando pago", description: pe, variant: "destructive" }); }
      }
    }


    // Emit business event for reactive workflows / agents
    try {
      await (supabase.from as any)("business_events").insert({
        tenant_id: tenantId,
        source: "purchases",
        event_type: "purchase.created",
        payload: {
          purchase_id: pch.id,
          purchase_number: code,
          supplier_id: supplierId || null,
          destination_type: destType,
          destination_id: destId,
          total, subtotal, tax: computedTax,
          items_count: valid.length,
        },
      });
      // Fire-and-forget: trigger reactive workflows
      supabase.functions.invoke("workflow-runner").catch(() => {});
    } catch (e) { console.warn("business_events emit failed", e); }


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
    setPayOpen(true);
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
    <AppLayout title={t("modules.purchases.title")}>
      <Tabs defaultValue="purchases" className="space-y-4">
        <TabsList>
          <TabsTrigger value="purchases">{t("modules.purchases.tabs.purchases")}</TabsTrigger>
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
                  title={t("modules.purchases.header")}
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
                  <Plus className="h-3.5 w-3.5" /> {t("modules.purchases.newPurchase")}
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Tasa de impuesto</Label>
                <Select value={taxRateId} onValueChange={(v) => { setTaxRateId(v); setTaxOverride(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin impuesto</SelectItem>
                    {taxes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.rate}%)</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Impuesto (override)</Label>
                <Input type="number" placeholder={computedTax.toFixed(2)} value={taxOverride} onChange={(e) => setTaxOverride(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div><Label className="text-xs">Subtotal</Label><Input value={subtotal.toFixed(2)} disabled /></div>
              <div><Label className="text-xs">Impuesto</Label><Input value={computedTax.toFixed(2)} disabled /></div>
              <div><Label className="text-xs">Total</Label><Input value={total.toFixed(2)} disabled className="font-bold" /></div>
            </div>

            <div className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Pagos al proveedor</Label>
                <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={addPayLine} disabled={!supplierId}>
                  <Plus className="h-3 w-3 mr-1" /> Agregar pago
                </Button>
              </div>
              {!supplierId && <p className="text-[10px] text-muted-foreground">Selecciona un proveedor para registrar pagos.</p>}
              {payLines.map((l, idx) => (
                <div key={l.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    {idx === 0 && <Label className="text-[10px]">Método</Label>}
                    <Select value={l.method} onValueChange={(v) => updatePayLine(l.id, { method: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {paymentMethods.length > 0 ? paymentMethods.map((m) => <SelectItem key={m.id} value={m.type}>{m.name}</SelectItem>) : (
                          <>
                            <SelectItem value="cash">Efectivo</SelectItem>
                            <SelectItem value="card">Tarjeta</SelectItem>
                            <SelectItem value="transfer">Transferencia</SelectItem>
                            <SelectItem value="qr">QR</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    {idx === 0 && <Label className="text-[10px]">Moneda</Label>}
                    <Select value={l.currency} onValueChange={(v) => updatePayLine(l.id, { currency: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {currenciesList.length > 0 ? currenciesList.map((c) => <SelectItem key={c.id} value={c.code}>{c.code}</SelectItem>) : <SelectItem value="CUP">CUP</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-[10px]">Monto</Label>}
                    <Input type="number" className="h-8 text-xs" value={l.amount} onChange={(e) => updatePayLine(l.id, { amount: e.target.value })} />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-[10px]">Tasa</Label>}
                    <Input type="number" className="h-8 text-xs" value={l.rate} onChange={(e) => updatePayLine(l.id, { rate: e.target.value })} />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button onClick={() => removePayLine(l.id)} className="p-1 rounded hover:bg-destructive/10 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t text-xs">
                <span>Pagado: <b>${totalPaidLines.toFixed(2)}</b></span>
                <span className={pendingAfterPay > 0.01 ? "text-warning" : "text-emerald-600"}>
                  Pendiente: <b>${pendingAfterPay.toFixed(2)}</b>
                </span>
              </div>
            </div>

            <div><Label className="text-xs">Notas</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button className="gradient-brand text-primary-foreground" onClick={handleCreate}>{t("modules.purchases.createPurchase")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pay purchase dialog (multi-currency, multi-method) */}
      {payTarget && payTarget.supplier_id && (
        <MultiPaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          partyType="supplier"
          partyId={payTarget.supplier_id}
          partyName={supName2(payTarget.supplier_id)}
          amountDue={Math.max(0, Number(payTarget.total) - Number(payTarget.amount_paid))}
          referenceType="purchase"
          referenceId={payTarget.id}
          title={`Pagar compra ${payTarget.purchase_number}`}
          onPaid={fetchAll}
        />
      )}
    </AppLayout>
  );
}
