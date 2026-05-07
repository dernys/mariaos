import { AppLayout } from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DetailHeader } from "@/components/detail/DetailHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { format } from "date-fns";

export default function TurnoDetalle() {
  const { id } = useParams();
  const [shift, setShift] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [sR, mR, salesR, sumR] = await Promise.all([
        supabase.from("sales_shifts").select("*").eq("id", id).maybeSingle(),
        (supabase.from as any)("shift_cash_movements").select("*").eq("shift_id", id).order("created_at", { ascending: false }),
        supabase.from("sales").select("id, ticket_number, total, amount_paid, status, created_at, customer_id").eq("shift_id", id).order("created_at", { ascending: false }),
        (supabase.rpc as any)("calculate_shift_summary", { p_shift_id: id }),
      ]);
      setShift(sR.data); setMovements(mR.data || []); setSales(salesR.data || []);
      if (sumR.data) setSummary(sumR.data);
    })();
  }, [id]);

  if (!shift) return <AppLayout title="Turno"><p className="text-sm text-muted-foreground">Cargando...</p></AppLayout>;

  return (
    <AppLayout title={`Turno ${shift.id.slice(0, 8)}`}>
      <div className="space-y-6">
        <DetailHeader
          icon={Clock}
          title={`Turno · ${shift.store_name || "Tienda"}`}
          subtitle={`Apertura: ${format(new Date(shift.opened_at), "dd/MM/yy HH:mm")}${shift.closed_at ? ` · Cierre: ${format(new Date(shift.closed_at), "dd/MM/yy HH:mm")}` : ""}`}
          backTo="/turnos"
          badges={[{ label: shift.status === "open" ? "Abierto" : "Cerrado", variant: shift.status === "open" ? "default" : "secondary" }]}
          kpis={[
            { label: "Caja inicial", value: `$${Number(shift.opening_cash || 0).toFixed(2)}` },
            { label: "Ventas", value: `$${Number(shift.total_sales || 0).toFixed(2)}`, tone: "primary" },
            { label: "Transacciones", value: shift.total_transactions || 0 },
            { label: "Diferencia", value: `$${Number(shift.cash_difference || 0).toFixed(2)}`, tone: Math.abs(Number(shift.cash_difference || 0)) < 0.01 ? "success" : "warning" },
          ]}
        />

        <Tabs defaultValue="resumen">
          <TabsList>
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            <TabsTrigger value="ventas">Ventas ({sales.length})</TabsTrigger>
            <TabsTrigger value="movimientos">Movimientos ({movements.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="resumen">
            <div className="bg-card rounded-xl border p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {summary && Object.entries(summary).map(([k, v]) => (
                <div key={k} className="bg-muted/40 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground capitalize">{k.replace(/_/g, " ")}</p>
                  <p className="font-heading font-bold mt-0.5">${Number(v as number).toFixed(2)}</p>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="ventas">
            <div className="bg-card rounded-xl border overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Ticket</TableHead>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-right">Pagado</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {sales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs font-medium">{s.ticket_number || s.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-xs">{format(new Date(s.created_at), "HH:mm")}</TableCell>
                      <TableCell className="text-xs text-right font-bold">${Number(s.total).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-right">${Number(s.amount_paid).toFixed(2)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{s.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {sales.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Sin ventas</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="movimientos">
            <div className="bg-card rounded-xl border overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Hora</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Motivo</TableHead>
                  <TableHead className="text-xs text-right">Monto</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">{format(new Date(m.created_at), "HH:mm")}</TableCell>
                      <TableCell><Badge variant={m.movement_type === "cash_in" ? "default" : "destructive"} className="text-[10px]">{m.movement_type}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.reason || "—"}</TableCell>
                      <TableCell className="text-xs text-right font-bold">${Number(m.amount).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {movements.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">Sin movimientos</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
