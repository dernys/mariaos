import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Search, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useTaxRates } from "@/hooks/useTaxRates";
import { useUnits } from "@/hooks/useUnits";
import { beginSaleIntent, callFinancialRpc } from "@/lib/finance/idempotentRpc";
import type { OperationContext } from "@/lib/context/operationContext";

interface Item {
  product_id?: string;
  product_name: string;
  sku?: string;
  unit?: string;
  qty: number;
  price: number;
}

interface PaymentLine {
  method: string;
  currency: string;
  amount: string;
  exchange_rate: string;
}

type Kind = "sale" | "purchase";
type PartyType = "customer" | "employee" | "supplier";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (saleId: string) => void;
}

const METHODS = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "qr", label: "QR / Móvil" },
  { value: "check", label: "Cheque" },
];

const newPayment = (): PaymentLine => ({ method: "cash", currency: "CUP", amount: "0", exchange_rate: "1" });

export function QuickSaleDialog({ open, onOpenChange, onCreated }: Props) {
  const { tenantId } = useTenantContext();
  const { taxes, defaultTax } = useTaxRates();
  const { units, defaultUnit } = useUnits();

  const [kind, setKind] = useState<Kind>("sale");
  const [partyType, setPartyType] = useState<PartyType>("customer");
  const [partyId, setPartyId] = useState<string>("");
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [currencies, setCurrencies] = useState<any[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [taxRateId, setTaxRateId] = useState<string>("");
  const [payments, setPayments] = useState<PaymentLine[]>([newPayment()]);
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [issueAfter, setIssueAfter] = useState(true);
  const [busy, setBusy] = useState(false);
  // QW1/QW2: una intención por apertura del diálogo (sobrevive a reintentos).
  const [intent, setIntent] = useState<OperationContext | null>(null);

  useEffect(() => {
    if (!open || !tenantId) return;
    setIntent(beginSaleIntent(tenantId));
    (async () => {
      const [p, c, e, s, cur] = await Promise.all([
        supabase.from("products").select("id, name, sku, price, cost, unit_code").eq("tenant_id", tenantId).eq("is_active", true).order("name").limit(500),
        supabase.from("customers").select("id, name, balance").eq("tenant_id", tenantId).order("name").limit(500),
        supabase.from("employees").select("id, name, balance").eq("tenant_id", tenantId).eq("is_active", true).order("name").limit(500),
        supabase.from("suppliers").select("id, name, balance").eq("tenant_id", tenantId).eq("is_active", true).order("name").limit(500),
        supabase.from("currencies").select("code, exchange_rate, is_base").eq("tenant_id", tenantId).eq("is_active", true),
      ]);
      setProducts(p.data || []);
      setCustomers(c.data || []);
      setEmployees(e.data || []);
      setSuppliers(s.data || []);
      setCurrencies(cur.data || []);
    })();
  }, [open, tenantId]);

  useEffect(() => { if (open && defaultTax && !taxRateId) setTaxRateId(defaultTax.id); }, [open, defaultTax, taxRateId]);
  useEffect(() => { setPartyId(""); }, [partyType]);
  useEffect(() => { setPartyType(kind === "purchase" ? "supplier" : "customer"); }, [kind]);

  const rate = useMemo(() => Number(taxes.find((t) => t.id === taxRateId)?.rate ?? 0), [taxes, taxRateId]);
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0);
  const tax = Math.round(subtotal * (rate / 100) * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0) * (Number(p.exchange_rate) || 1), 0);
  const pending = Math.round((total - paid) * 100) / 100;
  const creditWithoutParty = pending > 0.01 && !partyId;

  const partyList = kind === "purchase" ? suppliers : partyType === "employee" ? employees : customers;
  const selectedParty = partyList.find((p) => p.id === partyId);

  const filteredProducts = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase())
  ).slice(0, 12);

  const addProduct = (p: any) => {
    const idx = items.findIndex((i) => i.product_id === p.id);
    if (idx >= 0) { const next = [...items]; next[idx].qty += 1; setItems(next); return; }
    setItems([...items, {
      product_id: p.id,
      product_name: p.name,
      sku: p.sku,
      unit: p.unit_code || defaultUnit?.code || "u",
      qty: 1,
      price: Number(kind === "purchase" ? (p.cost ?? 0) : (p.price ?? 0)),
    }]);
  };

  const reset = () => {
    setItems([]); setPartyId(""); setPayments([newPayment()]); setDueDate(""); setNotes(""); setIntent(null);
  };

  const create = async () => {
    if (!tenantId) return;
    if (items.length === 0) return toast.error("Agrega al menos una línea");
    if (creditWithoutParty) {
      return toast.error(kind === "purchase"
        ? "No se puede dejar pendiente sin proveedor"
        : "No se puede dejar fiado sin cliente o empleado");
    }
    setBusy(true);
    const ctx = intent ?? beginSaleIntent(tenantId);
    const payload = payments
      .filter((p) => Number(p.amount) > 0)
      .map((p) => ({ method: p.method, currency: p.currency, amount: Number(p.amount), exchange_rate: Number(p.exchange_rate) || 1 }));

    const { data, error } = await callFinancialRpc<any>("create_quick_operation", {
      p_tenant_id: tenantId,
      p_kind: kind,
      p_party_type: kind === "purchase" ? "supplier" : partyType,
      p_party_id: partyId || null,
      p_items: items.map((i) => ({ ...i, cost: i.price })) as any,
      p_payments: payload as any,
      p_notes: notes || null,
      p_tax_rate_id: taxRateId || null,
      p_tax_rate: rate,
      p_due_date: pending > 0.01 ? (dueDate || null) : null,
      p_issue_invoice: kind === "sale" ? issueAfter : false,
    }, ctx);

    if (error || !data?.id) {
      toast.error(error ?? "No se pudo registrar la operación");
      setBusy(false);
      return;
    }

    if (kind === "sale") {
      toast.success(data.invoice_id ? "Venta y factura creadas" : "Venta creada");
    } else {
      toast.success(pending > 0.01
        ? `Compra ${data.number} registrada · cuenta por pagar $${pending.toFixed(2)}`
        : `Compra ${data.number} registrada y pagada`);
    }
    setBusy(false);
    onOpenChange(false);
    reset();
    if (kind === "sale") onCreated(data.id);
  };

  const currencyOptions = currencies.length
    ? currencies.map((c) => ({ value: c.code, label: c.code }))
    : [{ value: "CUP", label: "CUP" }];

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Operación rápida</DialogTitle>
          <DialogDescription>
            Registra una venta a cliente/empleado o una compra a proveedor, con varias formas de pago y saldo fiado.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={kind} onValueChange={(v) => { setKind(v as Kind); setItems([]); }}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="sale">Venta (por cobrar)</TabsTrigger>
            <TabsTrigger value="purchase">Compra (por pagar)</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {kind === "sale" && (
            <div className="space-y-1">
              <Label className="text-xs">Tipo de contraparte</Label>
              <Select value={partyType} onValueChange={(v) => setPartyType(v as PartyType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Cliente</SelectItem>
                  <SelectItem value="employee">Empleado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">{kind === "purchase" ? "Proveedor" : partyType === "employee" ? "Empleado" : "Cliente"}</Label>
            <SearchableSelect
              options={partyList.map((p) => ({
                value: p.id,
                label: Number(p.balance || 0) > 0 ? `${p.name} · saldo $${Number(p.balance).toFixed(2)}` : p.name,
              }))}
              value={partyId}
              onChange={setPartyId}
              placeholder={kind === "sale" && partyType === "customer" ? "Consumidor final" : "Selecciona"}
              searchPlaceholder="Buscar..."
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Impuesto</Label>
            <Select value={taxRateId || "none"} onValueChange={(v) => setTaxRateId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Sin impuesto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin impuesto (0%)</SelectItem>
                {taxes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} — {Number(t.rate)}%</SelectItem>)}
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
                  + {p.name}
                  <span className="opacity-60 ml-1">${Number(kind === "purchase" ? p.cost : p.price).toFixed(2)}</span>
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
              <TableHead className="text-xs w-24">Unidad</TableHead>
              <TableHead className="text-xs w-24 text-right">{kind === "purchase" ? "Costo" : "Precio"}</TableHead>
              <TableHead className="text-xs w-24 text-right">Total</TableHead>
              <TableHead className="w-10" />
            </TableRow></TableHeader>
            <TableBody>
              {items.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-4">Sin líneas</TableCell></TableRow>}
              {items.map((it, idx) => (
                <TableRow key={idx}>
                  <TableCell className="text-xs">{it.product_name}</TableCell>
                  <TableCell className="text-right">
                    <Input type="number" className="h-7 text-xs text-right" value={it.qty} onChange={(e) => { const n = [...items]; n[idx].qty = Number(e.target.value || 0); setItems(n); }} />
                  </TableCell>
                  <TableCell>
                    <Select value={it.unit || defaultUnit?.code || "u"} onValueChange={(v) => { const n = [...items]; n[idx].unit = v; setItems(n); }}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {units.map((u) => <SelectItem key={u.id} value={u.code}>{u.code}</SelectItem>)}
                      </SelectContent>
                    </Select>
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

        {/* Multi-pago */}
        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Formas de pago</Label>
            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setPayments([...payments, newPayment()])}>
              <Plus className="h-3 w-3 mr-1" />Añadir pago
            </Button>
          </div>
          {payments.map((p, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-4">
                <Select value={p.method} onValueChange={(v) => { const n = [...payments]; n[i].method = v; setPayments(n); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                <Select
                  value={p.currency}
                  onValueChange={(v) => {
                    const n = [...payments];
                    n[i].currency = v;
                    const cur = currencies.find((c) => c.code === v);
                    n[i].exchange_rate = String(cur?.exchange_rate ?? 1);
                    setPayments(n);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currencyOptions.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                <Input type="number" className="h-8 text-xs text-right" value={p.amount}
                  onChange={(e) => { const n = [...payments]; n[i].amount = e.target.value; setPayments(n); }} />
              </div>
              <div className="col-span-1 text-[10px] text-muted-foreground text-center">×{Number(p.exchange_rate) || 1}</div>
              <div className="col-span-1">
                {payments.length > 1 && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPayments(payments.filter((_, x) => x !== i))}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" variant="secondary" className="h-7 text-[10px]"
              onClick={() => { const n = [...payments]; n[0] = { ...n[0], amount: String(total), exchange_rate: "1", currency: n[0].currency }; setPayments([n[0]]); }}>
              Pagar total
            </Button>
            <Button size="sm" variant="secondary" className="h-7 text-[10px]"
              onClick={() => setPayments([{ ...newPayment(), amount: "0" }])}>
              Todo fiado
            </Button>
            {pending > 0.01 && (
              <div className="flex items-center gap-2">
                <Label className="text-[10px]">Vence</Label>
                <Input type="date" className="h-7 text-xs w-36" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Notas</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Referencia, factura del proveedor..." />
          </div>
          {kind === "sale" && (
            <div className="flex items-end gap-2">
              <Switch checked={issueAfter} onCheckedChange={setIssueAfter} />
              <Label className="text-xs">Emitir factura al crear</Label>
            </div>
          )}
        </div>

        {creditWithoutParty && (
          <div className="flex items-center gap-2 text-xs text-destructive border border-destructive/40 rounded-md p-2">
            <AlertTriangle className="h-4 w-4" />
            {kind === "purchase"
              ? "Selecciona el proveedor para registrar la cuenta por pagar."
              : "Selecciona cliente o empleado para registrar la cuenta por cobrar."}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-4 text-sm border-t pt-3">
          <span>Subtotal: <strong>${subtotal.toFixed(2)}</strong></span>
          <span>Impuesto ({rate}%): <strong>${tax.toFixed(2)}</strong></span>
          <span className="text-base">Total: <strong className="text-primary">${total.toFixed(2)}</strong></span>
          <span>Pagado: <strong>${paid.toFixed(2)}</strong></span>
          {pending > 0.01 && (
            <Badge variant="outline" className="text-[10px]">
              {kind === "purchase" ? "Por pagar" : "Por cobrar"}: ${pending.toFixed(2)}
              {selectedParty ? ` · ${selectedParty.name}` : ""}
            </Badge>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={create} disabled={busy || items.length === 0 || creditWithoutParty}>
            {busy ? "Registrando..." : kind === "purchase" ? "Registrar compra" : "Crear venta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
