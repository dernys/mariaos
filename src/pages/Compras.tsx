import { AppLayout } from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, CheckCircle2, XCircle, Truck, ShoppingCart } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";

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
    setTax("0"); setNotes("");
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

    const code = "PC-" + Date.now().toString(36).toUpperCase();
    const { data: pch, error } = await (supabase.from as any)("purchases").insert({
      tenant_id: tenantId,
      purchase_number: code,
      supplier_id: supplierId || null,
      destination_type: destType,
      destination_id: destId,
      subtotal, tax: Number(tax) || 0, total,
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

  const receive = async (id: string) => {
    const { error } = await supabase.rpc("receive_purchase" as any, { p_purchase_id: id });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Compra recibida y stock actualizado" });
    fetchAll();
  };

  const cancel = async (id: string) => {
    const { error } = await (supabase.from as any)("purchases").update({ status: "cancelled" }).eq("id", id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Compra cancelada" });
    fetchAll();
  };

  const supName2 = (id: string | null) => suppliers.find((s) => s.id === id)?.name || "—";
  const locName = (type: string, id: string) => {
    const list = type === "warehouse" ? warehouses : stores;
    return list.find((l) => l.id === id)?.name || "—";
  };

  return (
    <AppLayout title="Compras">
      <Tabs defaultValue="purchases" className="space-y-4">
        <TabsList>
          <TabsTrigger value="purchases">Órdenes de compra</TabsTrigger>
          <TabsTrigger value="suppliers">Proveedores</TabsTrigger>
        </TabsList>

        <TabsContent value="purchases" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">Gestiona compras a proveedores</p>
            <Button size="sm" className="gap-1 gradient-brand text-primary-foreground" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Nueva Compra
            </Button>
          </div>

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
                {purchases.map((p) => {
                  const st = statusBadge(p.status);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs font-heading font-semibold">{p.purchase_number}</TableCell>
                      <TableCell className="text-xs">{supName2(p.supplier_id)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px] mr-1">{p.destination_type === "warehouse" ? "Alm." : "Tnd."}</Badge>
                        {locName(p.destination_type, p.destination_id)}
                      </TableCell>
                      <TableCell className="text-xs font-heading font-bold">${Number(p.total).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{format(new Date(p.created_at), "dd/MM/yy HH:mm")}</TableCell>
                      <TableCell><Badge variant="outline" className={`text-[10px] ${st.c}`}>{st.l}</Badge></TableCell>
                      <TableCell>
                        {p.status === "draft" && (
                          <div className="flex gap-1">
                            <Button size="sm" className="h-7 text-[10px] gradient-brand text-primary-foreground" onClick={() => receive(p.id)}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Recibir
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] text-destructive" onClick={() => cancel(p.id)}>
                              <XCircle className="h-3 w-3 mr-1" /> Cancelar
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {purchases.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                    <ShoppingCart className="h-8 w-8 mx-auto mb-2 opacity-30" /> Sin compras registradas
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">Catálogo de proveedores</p>
            <Button size="sm" className="gap-1 gradient-brand text-primary-foreground" onClick={() => setOpenSup(true)}>
              <Plus className="h-3.5 w-3.5" /> Nuevo Proveedor
            </Button>
          </div>
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
                {suppliers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs font-medium">{s.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.phone || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.email || "—"}</TableCell>
                    <TableCell className="text-xs font-heading font-bold">${Number(s.balance || 0).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {suppliers.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-xs text-muted-foreground">Sin proveedores</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
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

            <div><Label className="text-xs">Notas</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
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
