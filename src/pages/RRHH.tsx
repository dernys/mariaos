import { AppLayout } from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Clock, LogIn, LogOut, Calendar, DollarSign, Plus, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

interface Employee { id: string; name: string; salary: number; }
interface Attendance { id: string; employee_id: string; check_in: string; check_out: string | null; hours_worked: number | null; employees?: { name: string }; }
interface Schedule { id: string; employee_id: string; day_of_week: number; start_time: string; end_time: string; is_active: boolean; employees?: { name: string }; }
interface Payroll { id: string; employee_id: string; period_start: string; period_end: string; base_salary: number; hours_worked: number; bonus: number; deductions: number; net_pay: number; status: string; employees?: { name: string }; }

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default function RRHH() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);

  const [schedDialog, setSchedDialog] = useState(false);
  const [schedForm, setSchedForm] = useState({ employee_id: "", day_of_week: "1", start_time: "09:00", end_time: "17:00" });
  const [payDialog, setPayDialog] = useState(false);
  const [payForm, setPayForm] = useState({ employee_id: "", period_start: "", period_end: "", bonus: "0", deductions: "0" });

  const load = async () => {
    if (!tenantId) return;
    const [e, a, s, p] = await Promise.all([
      supabase.from("employees").select("id,name,salary").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
      supabase.from("employee_attendance").select("*, employees(name)").eq("tenant_id", tenantId).order("check_in", { ascending: false }).limit(50),
      supabase.from("work_schedules").select("*, employees(name)").eq("tenant_id", tenantId).order("day_of_week"),
      supabase.from("payroll_runs").select("*, employees(name)").eq("tenant_id", tenantId).order("period_end", { ascending: false }),
    ]);
    setEmployees((e.data as any) || []);
    setAttendance((a.data as any) || []);
    setSchedules((s.data as any) || []);
    setPayrolls((p.data as any) || []);
  };

  useEffect(() => { load(); }, [tenantId]);

  const checkIn = async (employee_id: string) => {
    const { error } = await supabase.from("employee_attendance").insert({ tenant_id: tenantId, employee_id });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Entrada registrada" }); load();
  };

  const checkOut = async (id: string) => {
    const { error } = await supabase.from("employee_attendance").update({ check_out: new Date().toISOString() }).eq("id", id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Salida registrada" }); load();
  };

  const saveSchedule = async () => {
    const { error } = await supabase.from("work_schedules").insert({
      tenant_id: tenantId, employee_id: schedForm.employee_id,
      day_of_week: parseInt(schedForm.day_of_week), start_time: schedForm.start_time, end_time: schedForm.end_time,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    setSchedDialog(false); load();
  };

  const computeAndCreatePayroll = async () => {
    if (!payForm.employee_id || !payForm.period_start || !payForm.period_end) return;
    const { data, error } = await supabase.rpc("compute_payroll" as any, {
      _employee_id: payForm.employee_id, _start: payForm.period_start, _end: payForm.period_end,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    const row = (data as any)?.[0] || { hours_worked: 0, base: 0 };
    const bonus = parseFloat(payForm.bonus || "0");
    const ded = parseFloat(payForm.deductions || "0");
    const net = (row.base || 0) + bonus - ded;
    const { error: e2 } = await supabase.from("payroll_runs").insert({
      tenant_id: tenantId, employee_id: payForm.employee_id,
      period_start: payForm.period_start, period_end: payForm.period_end,
      base_salary: row.base, hours_worked: row.hours_worked, bonus, deductions: ded, net_pay: net,
    });
    if (e2) return toast({ title: "Error", description: e2.message, variant: "destructive" });
    toast({ title: "Nómina generada", description: `Neto: ${net.toFixed(2)}` });
    setPayDialog(false); load();
  };

  const markPaid = async (id: string) => {
    await supabase.from("payroll_runs").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", id);
    load();
  };

  return (
    <AppLayout title="Recursos Humanos">
      <div className="p-6 space-y-6">
        <Tabs defaultValue="attendance">
          <TabsList>
            <TabsTrigger value="attendance"><Clock className="h-4 w-4 mr-2" />Asistencia</TabsTrigger>
            <TabsTrigger value="schedules"><Calendar className="h-4 w-4 mr-2" />Horarios</TabsTrigger>
            <TabsTrigger value="payroll"><DollarSign className="h-4 w-4 mr-2" />Nóminas</TabsTrigger>
          </TabsList>

          <TabsContent value="attendance" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Marcar entrada/salida</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {employees.map(e => (
                  <Button key={e.id} variant="outline" onClick={() => checkIn(e.id)}>
                    <LogIn className="h-4 w-4 mr-2" />{e.name}
                  </Button>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Registros recientes</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Empleado</TableHead><TableHead>Entrada</TableHead><TableHead>Salida</TableHead><TableHead>Horas</TableHead><TableHead></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {attendance.map(a => (
                      <TableRow key={a.id}>
                        <TableCell>{a.employees?.name}</TableCell>
                        <TableCell>{format(new Date(a.check_in), "dd/MM HH:mm")}</TableCell>
                        <TableCell>{a.check_out ? format(new Date(a.check_out), "dd/MM HH:mm") : <Badge variant="secondary">Activo</Badge>}</TableCell>
                        <TableCell>{a.hours_worked ? a.hours_worked.toFixed(2) : "-"}</TableCell>
                        <TableCell>{!a.check_out && <Button size="sm" variant="outline" onClick={() => checkOut(a.id)}><LogOut className="h-3 w-3 mr-1" />Salida</Button>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="schedules" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setSchedDialog(true)}><Plus className="h-4 w-4 mr-2" />Nuevo horario</Button>
            </div>
            <Card><CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead>Empleado</TableHead><TableHead>Día</TableHead><TableHead>Inicio</TableHead><TableHead>Fin</TableHead></TableRow></TableHeader>
                <TableBody>
                  {schedules.map(s => (
                    <TableRow key={s.id}>
                      <TableCell>{s.employees?.name}</TableCell>
                      <TableCell>{DAYS[s.day_of_week]}</TableCell>
                      <TableCell>{s.start_time}</TableCell>
                      <TableCell>{s.end_time}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="payroll" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setPayDialog(true)}><Plus className="h-4 w-4 mr-2" />Generar nómina</Button>
            </div>
            <Card><CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead>Empleado</TableHead><TableHead>Período</TableHead><TableHead>Horas</TableHead><TableHead>Base</TableHead><TableHead>Neto</TableHead><TableHead>Estado</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {payrolls.map(p => (
                    <TableRow key={p.id}>
                      <TableCell>{p.employees?.name}</TableCell>
                      <TableCell>{p.period_start} → {p.period_end}</TableCell>
                      <TableCell>{Number(p.hours_worked).toFixed(2)}</TableCell>
                      <TableCell>{Number(p.base_salary).toFixed(2)}</TableCell>
                      <TableCell className="font-bold">{Number(p.net_pay).toFixed(2)}</TableCell>
                      <TableCell><Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                      <TableCell>{p.status !== "paid" && <Button size="sm" variant="outline" onClick={() => markPaid(p.id)}><CheckCircle2 className="h-3 w-3 mr-1" />Pagar</Button>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>

        <Dialog open={schedDialog} onOpenChange={setSchedDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo horario</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Empleado</Label>
                <Select value={schedForm.employee_id} onValueChange={v => setSchedForm({ ...schedForm, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Día</Label>
                <Select value={schedForm.day_of_week} onValueChange={v => setSchedForm({ ...schedForm, day_of_week: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Inicio</Label><Input type="time" value={schedForm.start_time} onChange={e => setSchedForm({ ...schedForm, start_time: e.target.value })} /></div>
                <div><Label>Fin</Label><Input type="time" value={schedForm.end_time} onChange={e => setSchedForm({ ...schedForm, end_time: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter><Button onClick={saveSchedule}>Guardar</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={payDialog} onOpenChange={setPayDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Generar nómina</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Empleado</Label>
                <Select value={payForm.employee_id} onValueChange={v => setPayForm({ ...payForm, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Desde</Label><Input type="date" value={payForm.period_start} onChange={e => setPayForm({ ...payForm, period_start: e.target.value })} /></div>
                <div><Label>Hasta</Label><Input type="date" value={payForm.period_end} onChange={e => setPayForm({ ...payForm, period_end: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Bono</Label><Input type="number" value={payForm.bonus} onChange={e => setPayForm({ ...payForm, bonus: e.target.value })} /></div>
                <div><Label>Deducciones</Label><Input type="number" value={payForm.deductions} onChange={e => setPayForm({ ...payForm, deductions: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter><Button onClick={computeAndCreatePayroll}>Calcular y guardar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
