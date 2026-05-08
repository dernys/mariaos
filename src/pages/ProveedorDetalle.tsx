import { AppLayout } from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DetailHeader } from "@/components/detail/DetailHeader";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Truck, Phone, Mail, FileText, ArrowUpFromLine, Package, Wallet, Check, TrendingUp } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiPaymentDialog } from "@/components/payments/MultiPaymentDialog";

export default function ProveedorDetalle() {
  const { id } = useParams();
  const nav = useNavigate();
  const { toast } = useToast();
  const [s, setS] = useState<any>(null);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [purchaseItems, setPurchaseItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [payOpen, setPayOpen] = useState(false);
  const [payCtx, setPayCtx] = useState<{ amount: number; refType: any; refId: string | null; title: string } | null>(null);

  const fetchAll = async () => {
    if (!id) return;
    const [sR, pR, payR, lR, stR, cR] = await Promise.all([
      (supabase.from as any)("suppliers").select("*").eq("id", id).maybeSingle(),
      (supabase.from as any)("purchases").select("id, purchase_number, total, amount_paid, status, created_at, is_consignment").eq("supplier_id", id).order("created_at", { ascending: false }).limit(100),
      (supabase.from as any)("account_payments").select("*").eq("party_type", "supplier").eq("party_id", id).order("created_at", { ascending: false }).limit(100),
      (supabase.from as any)("consignment_lots").select("*, products(name, sku)").eq("supplier_id", id).order("received_at", { ascending: false }).limit(100),
      (supabase.from as any)("consignment_settlements").select("*, consignment_lots(product_id, products(name))").eq("supplier_id", id).order("created_at", { ascending: false }).limit(200),
      (supabase.from as any)("supplier_products").select("*").eq("supplier_id", id).order("product_name"),
    ]);
    setS(sR.data); setPurchases(pR.data || []); setPayments(payR.data || []); setLots(lR.data || []); setSettlements(stR.data || []); setCatalog(cR.data || []);
  };

  const updateStatus = async (rowId: string, status: string) => {
    const { error } = await (supabase.from as any)("supplier_products").update({ status }).eq("id", rowId);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Estado actualizado" }); fetchAll();
  };
  useEffect(() => { fetchAll(); }, [id]);

  if (!s) return <AppLayout title="Proveedor"><p className="text-sm text-muted-foreground">Cargando...</p></AppLayout>;

  const debt = Number(s.balance || 0);
  const pendingPurchases = purchases.filter((p) => Number(p.total) - Number(p.amount_paid) > 0.01);
  const pendingSettlements = settlements.filter((x) => x.status === "pending");
  const pendingTotal = pendingSettlements.reduce((a, x) => a + Number(x.total || 0), 0);
  const activeLots = lots.filter((l) => l.status === "active");
  const consignmentValuePending = activeLots.reduce((a, l) => a + Number(l.quantity_remaining || 0) * Number(l.unit_cost || 0), 0);

  // aging buckets for unpaid purchases
  const aging = pendingPurchases.reduce(
    (acc, p) => {
      const days = differenceInDays(new Date(), new Date(p.created_at));
      const remaining = Number(p.total) - Number(p.amount_paid);
      if (days <= 30) acc.b1 += remaining;
      else if (days <= 60) acc.b2 += remaining;
      else if (days <= 90) acc.b3 += remaining;
      else acc.b4 += remaining;
      return acc;
    },
    { b1: 0, b2: 0, b3: 0, b4: 0 }
  );

  const toggle = (id: string) => {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  };

  const settle = async () => {
    if (selected.size === 0) { toast({ title: "Selecciona liquidaciones", variant: "destructive" }); return; }
    const { error } = await (supabase.rpc as any)("settle_consignment_lots", {
      p_settlement_ids: Array.from(selected), p_method: "cash", p_notes: "Liquidación manual",
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Liquidación registrada" });
    setSelected(new Set()); fetchAll();
  };

  return (
    <AppLayout title={s.name}>
      <div className="space-y-6">
        <DetailHeader
          icon={Truck}
          title={s.name}
          subtitle={s.email || s.phone || "Proveedor"}
          backTo="/proveedores"
          badges={[{ label: debt > 0 ? `Debemos $${debt.toFixed(2)}` : "Sin deuda", variant: debt > 0 ? "destructive" : "secondary" }]}
          kpis={[
            { label: "Compras", value: purchases.length, tone: "primary" },
            { label: "Por pagar", value: `$${debt.toLocaleString()}`, tone: debt > 0 ? "warning" : "success" },
            { label: "Productos", value: catalog.length },
            { label: "Liquidación pend.", value: `$${pendingTotal.toLocaleString()}`, tone: pendingTotal > 0 ? "warning" : "default" },
          ]}
        />

        <Tabs defaultValue="resumen">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            <TabsTrigger value="catalog">Productos ({catalog.length})</TabsTrigger>
            <TabsTrigger value="purchases">Compras ({purchases.length})</TabsTrigger>
            <TabsTrigger value="payables">Por pagar</TabsTrigger>
            <TabsTrigger value="payments">Pagos</TabsTrigger>
            <TabsTrigger value="consignment">Consignación ({activeLots.length})</TabsTrigger>
            <TabsTrigger value="activity">Actividad</TabsTrigger>
          </TabsList>

          <TabsContent value="catalog">
            <div className="bg-card rounded-xl border overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Producto</TableHead>
                  <TableHead className="text-xs">SKU</TableHead>
                  <TableHead className="text-xs text-right">Costo</TableHead>
                  <TableHead className="text-xs text-right">Mín. orden</TableHead>
                  <TableHead className="text-xs">Lead</TableHead>
                  <TableHead className="text-xs">Última compra</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {catalog.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs font-medium">{c.product_name}{c.is_consignment && <Badge variant="outline" className="ml-2 text-[10px]">Consig.</Badge>}{c.is_preferred && <Badge className="ml-1 text-[10px]">Preferido</Badge>}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.supplier_sku || c.sku || "—"}</TableCell>
                      <TableCell className="text-xs text-right">${Number(c.unit_cost).toFixed(2)} {c.currency}</TableCell>
                      <TableCell className="text-xs text-right">{c.min_order_qty}</TableCell>
                      <TableCell className="text-xs">{c.lead_time_days}d</TableCell>
                      <TableCell className="text-xs">{c.last_purchase_at ? format(new Date(c.last_purchase_at), "dd/MM/yy") : "—"}</TableCell>
                      <TableCell>
                        <select className="text-[10px] bg-background border rounded px-1.5 py-0.5" value={c.status} onChange={(e) => updateStatus(c.id, e.target.value)}>
                          <option value="available">Disponible</option>
                          <option value="low_stock">Bajo stock</option>
                          <option value="out_of_stock">Agotado</option>
                          <option value="discontinued">Descontinuado</option>
                        </select>
                      </TableCell>
                    </TableRow>
                  ))}
                  {catalog.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">Sin productos catalogados — se agregan automáticamente al registrar compras</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="resumen">
            <div className="bg-card rounded-xl border p-4 space-y-2 text-sm">
              {s.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{s.phone}</div>}
              {s.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{s.email}</div>}
              {s.tax_id && <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" />NIT: {s.tax_id}</div>}
              {s.address && <div className="text-xs text-muted-foreground">{s.address}</div>}
            </div>
          </TabsContent>

          <TabsContent value="purchases">
            <div className="bg-card rounded-xl border overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Nº</TableHead>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-right">Pagado</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {purchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs font-medium">{p.purchase_number}</TableCell>
                      <TableCell className="text-xs">{format(new Date(p.created_at), "dd/MM/yy")}</TableCell>
                      <TableCell className="text-xs text-right font-bold">${Number(p.total).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-right">${Number(p.amount_paid).toFixed(2)}</TableCell>
                      <TableCell><Badge variant={p.is_consignment ? "default" : "outline"} className="text-[10px]">{p.is_consignment ? "Consignación" : "Compra"}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{p.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {purchases.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Sin compras</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="payables" className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-card rounded-xl border p-3"><p className="text-[10px] text-muted-foreground">0-30 días</p><p className="font-bold">${aging.b1.toFixed(2)}</p></div>
              <div className="bg-card rounded-xl border p-3"><p className="text-[10px] text-muted-foreground">31-60 días</p><p className="font-bold text-warning">${aging.b2.toFixed(2)}</p></div>
              <div className="bg-card rounded-xl border p-3"><p className="text-[10px] text-muted-foreground">61-90 días</p><p className="font-bold text-warning">${aging.b3.toFixed(2)}</p></div>
              <div className="bg-card rounded-xl border p-3"><p className="text-[10px] text-muted-foreground">+90 días</p><p className="font-bold text-destructive">${aging.b4.toFixed(2)}</p></div>
            </div>
            <div className="bg-card rounded-xl border overflow-hidden">
              <div className="flex items-center justify-between p-3 border-b">
                <p className="text-xs font-heading font-semibold">Compras pendientes de pago</p>
                <Button size="sm" className="h-8 text-xs gap-1 gradient-brand text-primary-foreground" onClick={() => nav("/cuentas")}>
                  <ArrowUpFromLine className="h-3 w-3" />Registrar pago
                </Button>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Nº</TableHead>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs">Antigüedad</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-right">Pagado</TableHead>
                  <TableHead className="text-xs text-right">Saldo</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {pendingPurchases.map((p) => {
                    const days = differenceInDays(new Date(), new Date(p.created_at));
                    const remaining = Number(p.total) - Number(p.amount_paid);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs font-medium">{p.purchase_number}</TableCell>
                        <TableCell className="text-xs">{format(new Date(p.created_at), "dd/MM/yy")}</TableCell>
                        <TableCell className="text-xs"><Badge variant="outline" className={`text-[10px] ${days > 60 ? "bg-destructive/10 text-destructive" : days > 30 ? "bg-warning/10 text-warning" : ""}`}>{days} días</Badge></TableCell>
                        <TableCell className="text-xs text-right">${Number(p.total).toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right">${Number(p.amount_paid).toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right font-bold text-destructive">${remaining.toFixed(2)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {pendingPurchases.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Sin saldos pendientes</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="payments">
            <div className="bg-card rounded-xl border overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs">Método</TableHead>
                  <TableHead className="text-xs">Referencia</TableHead>
                  <TableHead className="text-xs">Notas</TableHead>
                  <TableHead className="text-xs text-right">Monto</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {payments.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">{format(new Date(m.created_at), "dd/MM/yy HH:mm")}</TableCell>
                      <TableCell className="text-xs capitalize">{m.method}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.reference_type || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.notes || "—"}</TableCell>
                      <TableCell className="text-xs text-right font-bold">${Number(m.amount_in_base).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {payments.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Sin pagos</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="consignment" className="space-y-3">
            <div className="bg-card rounded-xl border overflow-hidden">
              <div className="flex items-center justify-between p-3 border-b">
                <p className="text-xs font-heading font-semibold flex items-center gap-1.5"><Package className="h-3.5 w-3.5" />Lotes en consignación</p>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Producto</TableHead>
                  <TableHead className="text-xs">Recibido</TableHead>
                  <TableHead className="text-xs text-right">Cant. recibida</TableHead>
                  <TableHead className="text-xs text-right">Vendido</TableHead>
                  <TableHead className="text-xs text-right">Restante</TableHead>
                  <TableHead className="text-xs text-right">Costo unit.</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {lots.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs font-medium">{l.products?.name || "—"} <span className="text-muted-foreground">{l.products?.sku ? `· ${l.products.sku}` : ""}</span></TableCell>
                      <TableCell className="text-xs">{format(new Date(l.received_at), "dd/MM/yy")}</TableCell>
                      <TableCell className="text-xs text-right">{l.quantity_received}</TableCell>
                      <TableCell className="text-xs text-right">{l.quantity_sold}</TableCell>
                      <TableCell className="text-xs text-right font-bold">{l.quantity_remaining}</TableCell>
                      <TableCell className="text-xs text-right">${Number(l.unit_cost).toFixed(2)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{l.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {lots.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">Sin lotes</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>

            <div className="bg-card rounded-xl border overflow-hidden">
              <div className="flex items-center justify-between p-3 border-b">
                <p className="text-xs font-heading font-semibold flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" />Liquidaciones por unidades vendidas</p>
                <Button size="sm" className="h-8 text-xs gap-1 gradient-brand text-primary-foreground" disabled={selected.size === 0} onClick={settle}>
                  <Check className="h-3 w-3" />Liquidar ({selected.size})
                </Button>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs w-8"></TableHead>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs">Producto</TableHead>
                  <TableHead className="text-xs text-right">Cant.</TableHead>
                  <TableHead className="text-xs text-right">Costo unit.</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {settlements.map((st) => (
                    <TableRow key={st.id}>
                      <TableCell>
                        {st.status === "pending" && (
                          <Checkbox checked={selected.has(st.id)} onCheckedChange={() => toggle(st.id)} />
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{format(new Date(st.created_at), "dd/MM/yy")}</TableCell>
                      <TableCell className="text-xs">{st.consignment_lots?.products?.name || "—"}</TableCell>
                      <TableCell className="text-xs text-right">{st.quantity}</TableCell>
                      <TableCell className="text-xs text-right">${Number(st.unit_cost).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-right font-bold">${Number(st.total).toFixed(2)}</TableCell>
                      <TableCell><Badge variant={st.status === "settled" ? "default" : "outline"} className="text-[10px]">{st.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {settlements.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">Sin liquidaciones</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="activity">
            <div className="bg-card rounded-xl border p-4">
              <ActivityTimeline entityType="supplier" entityId={s.id} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
