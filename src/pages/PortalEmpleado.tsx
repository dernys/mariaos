import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Briefcase, Calendar, Clock, FileText, Plane, Download } from "lucide-react";
import { format } from "date-fns";

interface EmpRec { id: string; emp_name: string; email: string | null; job_position: string | null; salary: number; }
interface Payslip { id: string; period_start: string; period_end: string; gross_salary: number; net_pay: number; irpf_amount: number; ss_worker_amount: number; status: string; receipt_number: string | null; payslip_url: string | null; }
interface Leave { id: string; leave_type: string; start_date: string; end_date: string; days: number; status: string; reason: string | null; }
interface Att { id: string; check_in: string; check_out: string | null; hours_worked: number | null; }
interface Vac { entitled: number; taken: number; pending: number; remaining: number; }

export default function PortalEmpleado() {
  const [emp, setEmp] = useState<EmpRec | null>(null);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [att, setAtt] = useState<Att[]>([]);
  const [vac, setVac] = useState<Vac | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [empR, psR, lvR, atR, vcR] = await Promise.all([
        supabase.rpc("my_employee_record"),
        supabase.rpc("my_payslips"),
        supabase.rpc("my_leave_requests"),
        supabase.rpc("my_attendance", { _from: null, _to: null }),
        supabase.rpc("my_vacation_balance"),
      ]);
      if (empR.error) toast.error("No se encontró tu ficha de empleado");
      setEmp((empR.data as EmpRec[])?.[0] ?? null);
      setPayslips((psR.data as Payslip[]) ?? []);
      setLeaves((lvR.data as Leave[]) ?? []);
      setAtt((atR.data as Att[])?.slice(0, 30) ?? []);
      setVac((vcR.data as Vac[])?.[0] ?? null);
      setLoading(false);
    })();
  }, []);

  const downloadPayslip = async (p: Payslip) => {
    if (!p.payslip_url) { toast.info("Recibo aún no generado"); return; }
    const { data, error } = await supabase.storage.from("payslips").createSignedUrl(p.payslip_url, 60);
    if (error || !data) { toast.error("No se pudo descargar"); return; }
    window.open(data.signedUrl, "_blank");
  };

  if (loading) return <AppLayout title="Portal del Empleado"><div className="p-8 text-center text-muted-foreground">Cargando…</div></AppLayout>;
  if (!emp) return <AppLayout title="Portal del Empleado"><div className="p-8 text-center text-muted-foreground">No tienes un perfil de empleado asignado.</div></AppLayout>;

  return (
    <AppLayout title="Portal del Empleado">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full gradient-brand flex items-center justify-center text-primary-foreground font-bold">
                {emp.emp_name?.[0]?.toUpperCase()}
              </div>
              <div>
                <CardTitle className="text-base">{emp.emp_name}</CardTitle>
                <p className="text-xs text-muted-foreground">{emp.job_position ?? "—"} · {emp.email ?? "—"}</p>
              </div>
            </div>
          </CardHeader>
        </Card>

        {vac && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Días vacaciones</p><p className="text-2xl font-heading font-bold">{vac.entitled}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Disfrutados</p><p className="text-2xl font-heading font-bold">{vac.taken}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Pendientes</p><p className="text-2xl font-heading font-bold text-warning">{vac.pending}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Disponibles</p><p className="text-2xl font-heading font-bold text-success">{vac.remaining}</p></CardContent></Card>
          </div>
        )}

        <Tabs defaultValue="payslips">
          <TabsList>
            <TabsTrigger value="payslips" className="gap-2 text-xs"><FileText className="h-3.5 w-3.5" />Nóminas</TabsTrigger>
            <TabsTrigger value="leaves" className="gap-2 text-xs"><Plane className="h-3.5 w-3.5" />Ausencias</TabsTrigger>
            <TabsTrigger value="attendance" className="gap-2 text-xs"><Clock className="h-3.5 w-3.5" />Fichajes</TabsTrigger>
          </TabsList>

          <TabsContent value="payslips" className="space-y-2">
            {payslips.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Aún no tienes nóminas.</p>}
            {payslips.map(p => (
              <Card key={p.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{format(new Date(p.period_start), "dd/MM/yyyy")} – {format(new Date(p.period_end), "dd/MM/yyyy")}</p>
                    <p className="text-xs text-muted-foreground">Bruto €{Number(p.gross_salary).toFixed(2)} · IRPF €{Number(p.irpf_amount).toFixed(2)} · SS €{Number(p.ss_worker_amount).toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={p.status === "paid" ? "default" : "outline"}>{p.status}</Badge>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Neto</p>
                      <p className="font-bold">€{Number(p.net_pay).toFixed(2)}</p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => downloadPayslip(p)}><Download className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="leaves" className="space-y-2">
            {leaves.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No has solicitado ausencias.</p>}
            {leaves.map(l => (
              <Card key={l.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm capitalize">{l.leave_type}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(l.start_date), "dd/MM/yy")} → {format(new Date(l.end_date), "dd/MM/yy")} ({l.days}d)</p>
                  </div>
                  <Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "outline"}>{l.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="attendance" className="space-y-2">
            {att.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Sin fichajes registrados.</p>}
            {att.map(a => (
              <Card key={a.id}>
                <CardContent className="p-3 flex items-center justify-between text-xs">
                  <span>{format(new Date(a.check_in), "dd/MM/yyyy HH:mm")} → {a.check_out ? format(new Date(a.check_out), "HH:mm") : "—"}</span>
                  <span className="font-medium">{a.hours_worked ? `${Number(a.hours_worked).toFixed(2)} h` : "Abierto"}</span>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
