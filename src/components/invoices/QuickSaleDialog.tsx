import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTenantContext } from "@/hooks/useTenantContext";

interface Item { product_id?: string; product_name: string; sku?: string; qty: number; price: number; }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (saleId: string) => void;
}

export function QuickSaleDialog({ open, onOpenChange, onCreated }: Props) {
  const { tenantId } = useTenantContext();
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [paid, setPaid] = useState("0");
  const [method, setMethod] = useState("cash");
  const [issueAfter, setIssueAfter] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !tenantId) return;
    (async () => {
      const [p, c, e] = await Promise.all([
        supabase.from("products").select("id, name, sku, price").eq("tenant_id", tenantId).eq("is_active", true).order("name").limit(500),
        supabase.from("customers").select("id, name").eq("tenant_id", tenantId).order("name").limit(500),
        supabase.from("employees").select("id, name").eq("tenant_id", tenantId).eq("is_active", true).order("name").limit(500),
      ]);
      setProducts(p.data || []);
      setCustomers(c.data || []);
      setEmployees(e.data || []);
    })();
  }, [open, tenantId]);

  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const tax = subtotal * (Number(taxRate) || 0) / 100;
  const total = subtotal + tax;

  const filteredProducts = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase())
  ).slice(0, 12);

  const addProduct = (p: any) => {
    const idx = items.findIndex((i) => i.product_id === p.id);
    if (idx >= 0) { const next = [...items]; next[idx].qty += 1; setItems(next); }
    else setItems([...items, { product_id: p.id, product_name: p.name, sku: p.sku, qty: 1, price: Number(p.price || 0) }]);
  };

  const create = async () => {
    if (!tenantId) return;
    if (items.length === 0) return toast.error("Agrega al menos un producto");
    setBusy(true);
    const payments = Number(paid) > 0 ? [{ method, currency: "CUP", amount: Number(paid), exchange_rate: 1 }] : [];
    const { data, error } = await supabase.rpc("create_quick_sale", {
      p_tenant_id: tenantId,
      p_customer_id: customerId || null,
      p_employee_id: employeeId || null,
      p_items: items as any,
      p_payments: payments as any,
      p_notes: null,
      p_tax_rate: Number(taxRate) || 0,
    });
    if (error) { toast.error(error.message); setBusy(false); return; }
    const saleId = data as unknown as string;
    if (issueAfter) {
      const { error: e2 } = await supabase.rpc("issue_invoice", { p_sale_id: saleId, p_series_code: null });
      if (e2) toast.error("Venta creada, pero no se pudo facturar: " + e2.message);
      else toast.success("Venta y factura creadas");
    } else toast.success("Venta creada");
    setBusy(false);
    onOpenChange(false);
    setItems([]); setCustomerId(""); setEmployeeId(""); setPaid("0");
    onCreated(saleId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Venta rápida</DialogTitle>
          <DialogDescription>Crea una venta y factura desde aquí, sin pasar por el POS.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Cliente (opcional)</Label>
            <Select value={customerId || "none"} onValueChange={(v) => setCustomerId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Consumidor final" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Consumidor final</SelectItem>
                {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cajero / Empleado (opcional)</Label>
            <Select value={employeeId || "none"} onValueChange={(v) => setEmployeeId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-xs">Buscar producto</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre o SKU..." />
          </div>
          {search && (
            <div className="mt-2 flex flex-wrap gap-1 max-h-32 overflow-y-auto">
              {filteredProducts.map((p) => (
                <Button key={p.id} size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => addProduct(p)}>
                  + {p.name} <span className="opacity-60 ml-1">${Number(p.price).toFixed(2)}</span>
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="text-xs">Producto</TableHead>
              <TableHead className="text-xs w-20 text-right">Cant.</TableHead>
              <TableHead className="text-xs w-24 text-right">Precio</TableHead>
              <TableHead className="text-xs w-24 text-right">Total</TableHead>
              <TableHead className="w-10" />
            </TableRow></TableHeader>
            <TableBody>
              {items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-4">Sin productos</TableCell></TableRow>}
              {items.map((it, idx) => (
                <TableRow key={idx}>
                  <TableCell className="text-xs">{it.product_name}</TableCell>
                  <TableCell className="text-right">
                    <Input type="number" className="h-7 text-xs text-right" value={it.qty} onChange={(e) => { const n = [...items]; n[idx].qty = Number(e.target.value || 0); setItems(n); }} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input type="number" className="h-7 text-xs text-right" value={it.price} onChange={(e) => { const n = [...items]; n[idx].price = Number(e.target.value || 0); setItems(n); }} />
                  </TableCell>
                  <TableCell className="text-xs text-right font-bold">${(it.qty * it.price).toFixed(2)}</TableCell>
                  <TableCell><Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setItems(items.filter((_, i) => i !== idx))}><Trash2 className="h-3 w-3 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label className="text-xs">IVA %</Label><Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></div>
          <div><Label className="text-xs">Pagado</Label><Input type="number" value={paid} onChange={(e) => setPaid(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Método</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Efectivo</SelectItem>
                <SelectItem value="card">Tarjeta</SelectItem>
                <SelectItem value="transfer">Transferencia</SelectItem>
                <SelectItem value="credit">Fiado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2"><Switch checked={issueAfter} onCheckedChange={setIssueAfter} /><Label className="text-xs">Emitir factura</Label></div>
        </div>

        <div className="flex justify-end gap-4 text-sm border-t pt-3">
          <span>Subtotal: <strong>${subtotal.toFixed(2)}</strong></span>
          <span>IVA: <strong>${tax.toFixed(2)}</strong></span>
          <span className="text-base">Total: <strong className="text-primary">${total.toFixed(2)}</strong></span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={create} disabled={busy || items.length === 0}>{busy ? "Creando..." : "Crear venta"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
