import { AppLayout } from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DetailHeader } from "@/components/detail/DetailHeader";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Receipt, User } from "lucide-react";
import { format } from "date-fns";

export default function VentaDetalle() {
  const { id } = useParams();
  const nav = useNavigate();
  const [sale, setSale] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [invoice, setInvoice] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [sR, iR, pR, rR, invR] = await Promise.all([
        supabase.from("sales").select("*, customers(name), employees(name)").eq("id", id).maybeSingle(),
        supabase.from("sale_items").select("*").eq("sale_id", id),
        (supabase.from as any)("sale_payments").select("*").eq("sale_id", id),
        (supabase.from as any)("sale_returns").select("*").eq("sale_id", id).order("created_at", { ascending: false }),
        (supabase.from as any)("invoices").select("*").eq("sale_id", id).maybeSingle(),
      ]);
      setSale(sR.data); setItems(iR.data || []); setPayments(pR.data || []); setReturns(rR.data || []); setInvoice(invR.data);
    })();
  }, [id]);

  if (!sale) return <AppLayout title="Venta"><p className="text-sm text-muted-foreground">Cargando...</p></AppLayout>;

  return (
    <AppLayout title={`Venta ${sale.ticket_number || ""}`}>
      <div className="space-y-6">
        <DetailHeader
          icon={Receipt}
          title={sale.ticket_number || sale.id.slice(0, 8)}
          subtitle={`${format(new Date(sale.created_at), "dd/MM/yyyy HH:mm")} · ${sale.customers?.name || "Consumidor final"}`}
          backTo="/turnos"
          badges={[
            { label: sale.status, variant: sale.status === "paid" ? "default" : "outline" },
            ...(sale.customers ? [{ label: sale.customers.name, variant: "outline" as const }] : []),
            ...(sale.employees ? [{ label: `Cajero: ${sale.employees.name}`, variant: "secondary" as const }] : []),
          ]}
          kpis={[
            { label: "Subtotal", value: `$${Number(sale.subtotal || 0).toFixed(2)}` },
            { label: "Impuesto", value: `$${Number(sale.tax || 0).toFixed(2)}` },
            { label: "Total", value: `$${Number(sale.total).toFixed(2)}`, tone: "primary" },
            { label: "Pagado", value: `$${Number(sale.amount_paid).toFixed(2)}`, tone: sale.amount_paid >= sale.total ? "success" : "warning" },
          ]}
        />

        <Tabs defaultValue="items">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="items">Items ({items.length})</TabsTrigger>
            <TabsTrigger value="payments">Pagos ({payments.length})</TabsTrigger>
            <TabsTrigger value="returns">Devoluciones ({returns.length})</TabsTrigger>
            <TabsTrigger value="invoice">Factura</TabsTrigger>
            <TabsTrigger value="activity">Actividad</TabsTrigger>
          </TabsList>

          <TabsContent value="items">
            <div className="bg-card rounded-xl border overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Producto</TableHead>
                  <TableHead className="text-xs">SKU</TableHead>
                  <TableHead className="text-xs text-right">Cant.</TableHead>
                  <TableHead className="text-xs text-right">Precio</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="text-xs font-medium">{i.product_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{i.sku || "—"}</TableCell>
                      <TableCell className="text-xs text-right">{i.qty}</TableCell>
                      <TableCell className="text-xs text-right">${Number(i.price).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-right font-bold">${Number(i.total).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
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
                  <TableHead className="text-xs">Moneda</TableHead>
                  <TableHead className="text-xs text-right">Monto</TableHead>
                  <TableHead className="text-xs text-right">En base</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{format(new Date(p.created_at), "dd/MM/yy HH:mm")}</TableCell>
                      <TableCell className="text-xs capitalize">{p.method}</TableCell>
                      <TableCell className="text-xs">{p.currency}</TableCell>
                      <TableCell className="text-xs text-right">${Number(p.amount).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-right font-bold">${Number(p.amount_in_base).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {payments.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Sin pagos</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="returns">
            <div className="bg-card rounded-xl border overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs">Método reembolso</TableHead>
                  <TableHead className="text-xs">Razón</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {returns.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{format(new Date(r.created_at), "dd/MM/yy HH:mm")}</TableCell>
                      <TableCell className="text-xs capitalize">{r.refund_method}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.reason || "—"}</TableCell>
                      <TableCell className="text-xs text-right font-bold">${Number(r.total).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {returns.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">Sin devoluciones</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="invoice">
            {invoice ? (
              <div className="bg-card rounded-xl border p-4 space-y-2 text-sm">
                <p className="text-lg font-heading font-bold">{invoice.invoice_number}</p>
                <p className="text-xs text-muted-foreground">Emitida: {format(new Date(invoice.created_at), "dd/MM/yyyy")}</p>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">{invoice.status}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${
                    invoice.transmission_status === "transmitted" ? "bg-success/10 text-success" :
                    invoice.transmission_status === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted"
                  }`}>
                    {invoice.transmission_status === "transmitted" ? "Transmitida" :
                     invoice.transmission_status === "failed" ? "Fallida" :
                     invoice.transmission_status === "pending" ? "Pendiente" : "Local"}
                  </Badge>
                </div>
                <div className="text-xs">Cliente: <strong>{invoice.customer_name}</strong></div>
                <div className="text-xs">Total: <strong>${Number(invoice.total).toFixed(2)}</strong></div>
                {invoice.cufe && <div className="text-[10px] font-mono text-muted-foreground break-all">CUFE: {invoice.cufe}</div>}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">Sin factura emitida</p>
            )}
          </TabsContent>

          <TabsContent value="activity">
            <div className="bg-card rounded-xl border p-4">
              <ActivityTimeline entityType="sale" entityId={sale.id} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
