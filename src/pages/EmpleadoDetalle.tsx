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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserCheck, Phone, Mail, Briefcase, Calendar, Plus } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

export default function EmpleadoDetalle() {
  const { id } = useParams();
  const nav = useNavigate();
  const { toast } = useToast();
  const [e, setE] = useState<any>(null);
  const [shifts, setShifts] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [periodStart, setPeriodStart] = useState(format(new Date(new Date().setDate(1)), "yyyy-MM-dd"));
  const [periodEnd, setPeriodEnd] = useState(format(new Date(), "yyyy-MM-dd"));

  const fetchAll = async () => {
    if (!id) return;
    const [eR, sR, aR, pR, advR] = await Promise.all([
      supabase.from("employees").select("*").eq("id", id).maybeSingle(),
      supabase.from("sales_shifts").select("id, store_name, opened_at, closed_at, total_sales, status, cash_difference").eq("employee_id", id).order("opened_at", { ascending: false }).limit(100),
      (supabase.from as any)("employee_attendance").select("*").eq("employee_id", id).order("check_in", { ascending: false }).limit(60),
      (supabase.from as any)("payroll_runs").select("*").eq("employee_id", id).order("created_at", { ascending: false }).limit(20),
      (supabase.from as any)("account_payments").select("*").eq("party_type", "employee").eq("party_id", id).order("created_at", { ascending: false }).limit(60),
    ]);
    setE(eR.data); setShifts(sR.data || []); setAttendance(aR.data || []); setPayroll(pR.data || []); setAdvances(advR.data || []);
  };

  useEffect(() => { fetchAll(); }, [id]);

  const generatePayroll = async () => {
    if (!id) return;
    const { data, error } = await (supabase.rpc as any)("compute_payroll", { _employee_id: id, _start: periodStart, _end: periodEnd });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    const row = Array.isArray(data) ? data[0] : data;
    const hours = Number(row?.hours_worked || 0);
    const base = Number(row?.base || 0);
    const { error: insErr } = await (supabase.from as any)("payroll_runs").insert({
      tenant_id: e.tenant_id, employee_id: id, period_start: periodStart, period_end: periodEnd,
      hours_worked: hours, base_salary: base, net_pay: base, status: "draft",
    });
    if (insErr) { toast({ title: "Error", description: insErr.message, variant: "destructive" }); return; }
    toast({ title: "Nómina generada", description: `Horas: ${hours} · Base: $${base}` });
    fetchAll();
  };

  if (!e) return <AppLayout title="Empleado"><p className="text-sm text-muted-foreground">Cargando...</p></AppLayout>;

  const totalShifts = shifts.length;
  const totalSales = shifts.reduce((a, s) => a + Number(s.total_sales || 0), 0);
  const totalHours = attendance.reduce((a, x) => a + Number(x.hours_worked || 0), 0);

  return (
    <AppLayout title={e.name}>
      <div className="space-y-6">
        <DetailHeader
          icon={UserCheck}
          title={e.name}
          subtitle={e.position || "Empleado"}
          backTo="/empleados"
          badges={[{ label: e.is_active ? "Activo" : "Inactivo", variant: e.is_active ? "default" : "secondary" }]}
          kpis={[
            { label: "Turnos", value: totalShifts, tone: "primary" },
            { label: "Ventas totales", value: `$${totalSales.toLocaleString()}`, tone: "success" },
            { label: "Horas trabajadas", value: totalHours.toFixed(1) },
            { label: "Adelantos", value: `$${Number(e.balance || 0).toFixed(2)}`, tone: Number(e.balance) > 0 ? "warning" : "default" },
          ]}
        />

        <Tabs defaultValue="resumen">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            <TabsTrigger value="shifts">Turnos ({shifts.length})</TabsTrigger>
            <TabsTrigger value="attendance">Asistencia</TabsTrigger>
            <TabsTrigger value="payroll">Nómina</TabsTrigger>
            <TabsTrigger value="advances">Adelantos</TabsTrigger>
            <TabsTrigger value="activity">Actividad</TabsTrigger>
          </TabsList>

          <TabsContent value="resumen">
            <div className="bg-card rounded-xl border p-4 space-y-2 text-sm">
              {e.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{e.phone}</div>}
              {e.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{e.email}</div>}
              <div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-muted-foreground" />Salario: ${Number(e.salary || 0).toLocaleString()}</div>
              {e.hire_date && <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" />Contratación: {e.hire_date}</div>}
              {e.notes && <p className="text-xs text-muted-foreground italic mt-2">{e.notes}</p>}
            </div>
          </TabsContent>

          <TabsContent value="shifts">
            <div className="bg-card rounded-xl border overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Tienda</TableHead>
                  <TableHead className="text-xs">Apertura</TableHead>
                  <TableHead className="text-xs">Cierre</TableHead>
                  <TableHead className="text-xs text-right">Ventas</TableHead>
                  <TableHead className="text-xs text-right">Diferencia</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {shifts.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">{s.store_name}</TableCell>
                      <TableCell className="text-xs">{format(new Date(s.opened_at), "dd/MM/yy HH:mm")}</TableCell>
                      <TableCell className="text-xs">{s.closed_at ? format(new Date(s.closed_at), "dd/MM/yy HH:mm") : "—"}</TableCell>
                      <TableCell className="text-xs text-right font-bold">${Number(s.total_sales || 0).toFixed(2)}</TableCell>
                      <TableCell className={`text-xs text-right ${Math.abs(Number(s.cash_difference || 0)) > 0.01 ? "text-warning" : ""}`}>${Number(s.cash_difference || 0).toFixed(2)}</TableCell>
                      <TableCell><Badge variant={s.status === "open" ? "default" : "secondary"} className="text-[10px]">{s.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {shifts.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Sin turnos</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="attendance">
            <div className="bg-card rounded-xl border overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Entrada</TableHead>
                  <TableHead className="text-xs">Salida</TableHead>
                  <TableHead className="text-xs text-right">Horas</TableHead>
                  <TableHead className="text-xs">Notas</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {attendance.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs">{format(new Date(a.check_in), "dd/MM/yy HH:mm")}</TableCell>
                      <TableCell className="text-xs">{a.check_out ? format(new Date(a.check_out), "dd/MM/yy HH:mm") : <Badge variant="default" className="text-[10px]">Activo</Badge>}</TableCell>
                      <TableCell className="text-xs text-right font-bold">{Number(a.hours_worked || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {attendance.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-6">Sin asistencia registrada</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="payroll" className="space-y-3">
            <div className="bg-card rounded-xl border p-3 flex flex-wrap items-end gap-2">
              <div><Label className="text-xs">Inicio</Label><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></div>
              <div><Label className="text-xs">Fin</Label><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></div>
              <Button size="sm" onClick={generatePayroll} className="gap-1 gradient-brand text-primary-foreground"><Plus className="h-3.5 w-3.5" />Generar nómina</Button>
            </div>
            <div className="bg-card rounded-xl border overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Periodo</TableHead>
                  <TableHead className="text-xs text-right">Horas</TableHead>
                  <TableHead className="text-xs text-right">Base</TableHead>
                  <TableHead className="text-xs text-right">Neto</TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {payroll.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{p.period_start} → {p.period_end}</TableCell>
                      <TableCell className="text-xs text-right">{Number(p.hours_worked).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-right">${Number(p.base_salary).toFixed(2)}</TableCell>
                      <TableCell className="text-xs text-right font-bold">${Number(p.net_pay).toFixed(2)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{p.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {payroll.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Sin nóminas generadas</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="advances">
            <div className="bg-card rounded-xl border overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs">Tipo</TableHead>
                  <TableHead className="text-xs">Método</TableHead>
                  <TableHead className="text-xs">Notas</TableHead>
                  <TableHead className="text-xs text-right">Monto</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {advances.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">{format(new Date(m.created_at), "dd/MM/yy HH:mm")}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{m.direction === "in" ? "Cobro" : "Adelanto"}</Badge></TableCell>
                      <TableCell className="text-xs capitalize">{m.method}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.notes || "—"}</TableCell>
                      <TableCell className="text-xs text-right font-bold">${Number(m.amount_in_base).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {advances.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Sin movimientos</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="activity">
            <div className="bg-card rounded-xl border p-4">
              <ActivityTimeline entityType="employee" entityId={e.id} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
