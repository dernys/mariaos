import { AppLayout } from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DetailHeader } from "@/components/detail/DetailHeader";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { User, Phone, Mail, MapPin, FileText, Award } from "lucide-react";
import { format } from "date-fns";

export default function ClienteDetalle() {
  const { id } = useParams();
  const nav = useNavigate();
  const [c, setC] = useState<any>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loyalty, setLoyalty] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [cR, sR, pR, lR] = await Promise.all([
        supabase.from("customers").select("*").eq("id", id).maybeSingle(),
        supabase.from("sales").select("id, ticket_number, total, amount_paid, status, created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(200),
        (supabase.from as any)("account_payments").select("*").eq("party_id", id).eq("party_type", "customer").order("created_at", { ascending: false }).limit(100),
        (supabase.from as any)("loyalty_movements").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(100),
      ]);
      setC(cR.data); setSales(sR.data || []); setPayments(pR.data || []); setLoyalty(lR.data || []);
    })();
  }, [id]);

  if (!c) return <AppLayout title="Cliente"><p className="text-sm text-muted-foreground">Cargando...</p></AppLayout>;

  const debt = Number(c.balance || 0);
  const totalSpent = Number(c.total_spent || 0);

  return (
    <AppLayout title={c.name}>
      <div className="space-y-6">
        <DetailHeader
          icon={User}
          title={c.name}
          subtitle={c.email || c.phone || "Sin contacto"}
          backTo="/clientes"
          badges={[
            { label: c.loyalty_tier || "bronze", variant: "outline" },
            { label: debt > 0 ? `Debe $${debt.toFixed(2)}` : "Sin deuda", variant: debt > 0 ? "destructive" : "secondary" },
          ]}
          kpis={[
            { label: "Compras", value: c.visits_count || 0, tone: "primary" },
            { label: "Total gastado", value: `$${totalSpent.toLocaleString()}`, tone: "success" },
            { label: "Saldo", value: `$${debt.toLocaleString()}`, tone: debt > 0 ? "destructive" : "default" },
            { label: "Puntos", value: c.loyalty_points || 0, tone: "primary" },
          ]}
        />

        <Tabs defaultValue="resumen">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            <TabsTrigger value="sales">Compras ({sales.length})</TabsTrigger>
            <TabsTrigger value="payments">Pagos ({payments.length})</TabsTrigger>
            <TabsTrigger value="loyalty">Fidelización</TabsTrigger>
            <TabsTrigger value="activity">Actividad</TabsTrigger>
          </TabsList>

          <TabsContent value="resumen" className="space-y-3">
            <div className="bg-card rounded-xl border p-4 space-y-2 text-sm">
              {c.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {c.phone}</div>}
              {c.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {c.email}</div>}
              {c.address && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {c.address}</div>}
              {c.rfc && <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /> RFC: {c.rfc}</div>}
              <div className="text-xs text-muted-foreground">Crédito autorizado: ${Number(c.credit_limit || 0).toLocaleString()}</div>
              {c.notes && <p className="text-xs text-muted-foreground italic mt-2">{c.notes}</p>}
            </div>
          </TabsContent>

          <TabsContent value="sales">
            <div className="bg-card rounded-xl border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Ticket</TableHead>
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs text-right">Pagado</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((s) => (
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => nav(`/ventas/${s.id}`)}>
                      <TableCell className="text-xs font-medium">{s.ticket_number || s.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-xs">{format(new Date(s.created_at), "dd/MM/yy HH:mm")}</TableCell>
                      <TableCell className="text-xs text-right font-bold">${Number(s.total).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-right">${Number(s.amount_paid).toFixed(2)}</TableCell>
                      <TableCell><Badge variant={s.status === "paid" ? "default" : "outline"} className="text-[10px]">{s.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {sales.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Sin compras</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="payments">
            <div className="bg-card rounded-xl border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Método</TableHead>
                    <TableHead className="text-xs">Notas</TableHead>
                    <TableHead className="text-xs text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{format(new Date(p.created_at), "dd/MM/yy HH:mm")}</TableCell>
                      <TableCell><Badge variant="outline" className={`text-[10px] ${p.direction === "in" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>{p.direction === "in" ? "Cobro" : "Pago"}</Badge></TableCell>
                      <TableCell className="text-xs capitalize">{p.method}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.notes || "—"}</TableCell>
                      <TableCell className="text-xs text-right font-bold">${Number(p.amount_in_base).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {payments.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Sin pagos</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="loyalty">
            <div className="bg-card rounded-xl border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Notas</TableHead>
                    <TableHead className="text-xs text-right">Puntos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loyalty.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs">{format(new Date(l.created_at), "dd/MM/yy HH:mm")}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]"><Award className="h-3 w-3 mr-1" />{l.movement_type}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{l.notes || "—"}</TableCell>
                      <TableCell className={`text-xs text-right font-bold ${Number(l.points) > 0 ? "text-success" : "text-destructive"}`}>{Number(l.points) > 0 ? "+" : ""}{l.points}</TableCell>
                    </TableRow>
                  ))}
                  {loyalty.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">Sin movimientos de fidelización</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="activity">
            <div className="bg-card rounded-xl border p-4">
              <ActivityTimeline entityType="customer" entityId={c.id} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
