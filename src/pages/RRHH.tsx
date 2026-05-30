import { AppLayout } from "@/components/AppLayout";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Calendar, DollarSign, Plus, CheckCircle2, Briefcase, Edit2, Trash2, FileText, AlertCircle,
} from "lucide-react";
import { format, addDays } from "date-fns";

interface Employee { id: string; name: string; salary: number; position_id?: string | null; }
interface Schedule { id: string; employee_id: string; day_of_week: number; start_time: string; end_time: string; is_active: boolean; employees?: { name: string }; }
interface Payroll {
  id: string; employee_id: string; period_start: string; period_end: string;
  base_salary: number; hours_worked: number; bonus: number; deductions: number;
  net_pay: number; status: string; paid_at: string | null;
  employees?: { name: string };
}
interface JobPosition {
  id: string; code: string; name: string; department: string | null; level: string | null;
  base_salary: number; min_salary: number; max_salary: number; description: string | null; is_active: boolean;
}
interface AP {
  id: string; party_id: string; source_id: string; amount: number; amount_paid: number;
  status: string; due_date: string | null; description: string;
}

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

export default function RRHH() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [payables, setPayables] = useState<AP[]>([]);

  // Dialogs
  const [schedDialog, setSchedDialog] = useState(false);
  const [schedForm, setSchedForm] = useState({ employee_id: "", day_of_week: "1", start_time: "09:00", end_time: "17:00" });

  const [posDialog, setPosDialog] = useState(false);
  const [editPos, setEditPos] = useState<JobPosition | null>(null);
  const [posForm, setPosForm] = useState({ code: "", name: "", department: "", level: "", base_salary: "0", min_salary: "0", max_salary: "0", description: "" });

  const [payDialog, setPayDialog] = useState(false);
  const [payForm, setPayForm] = useState({
    employee_id: "",
    period_start: format(new Date(new Date().setDate(1)), "yyyy-MM-dd"),
    period_end: format(new Date(), "yyyy-MM-dd"),
    bonus: "0",
    deductions: "0",
  });
  const [preview, setPreview] = useState<{ hours: number; base: number; bonus: number; ded: number; gross: number; net: number } | null>(null);
  const [computing, setComputing] = useState(false);

  const load = async () => {
    if (!tenantId) return;
    const [e, s, p, jp, ap] = await Promise.all([
      supabase.from("employees").select("id,name,salary,position_id").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
      supabase.from("work_schedules").select("*, employees(name)").eq("tenant_id", tenantId).order("day_of_week"),
      supabase.from("payroll_runs").select("*, employees(name)").eq("tenant_id", tenantId).order("period_end", { ascending: false }),
      (supabase.from as any)("job_positions").select("*").eq("tenant_id", tenantId).order("name"),
      (supabase.from as any)("accounts_payable").select("id, party_id, source_id, amount, amount_paid, status, due_date, description").eq("tenant_id", tenantId).eq("source_type", "payroll"),
    ]);
    setEmployees((e.data as any) || []);
    setSchedules((s.data as any) || []);
    setPayrolls((p.data as any) || []);
    setPositions((jp.data as any) || []);
    setPayables((ap.data as any) || []);
  };

  useEffect(() => { load(); }, [tenantId]);

  // ============= Horarios =============
  const saveSchedule = async () => {
    if (!schedForm.employee_id) return toast({ title: "Selecciona empleado", variant: "destructive" });
    const { error } = await supabase.from("work_schedules").insert({
      tenant_id: tenantId, employee_id: schedForm.employee_id,
      day_of_week: parseInt(schedForm.day_of_week), start_time: schedForm.start_time, end_time: schedForm.end_time,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    setSchedDialog(false); load();
  };

  const deleteSchedule = async (id: string) => {
    const { error } = await supabase.from("work_schedules").delete().eq("id", id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    load();
  };

  // ============= Puestos =============
  const openPosNew = () => {
    setEditPos(null);
    setPosForm({ code: "", name: "", department: "", level: "", base_salary: "0", min_salary: "0", max_salary: "0", description: "" });
    setPosDialog(true);
  };
  const openPosEdit = (p: JobPosition) => {
    setEditPos(p);
    setPosForm({
      code: p.code, name: p.name, department: p.department || "", level: p.level || "",
      base_salary: String(p.base_salary), min_salary: String(p.min_salary), max_salary: String(p.max_salary),
      description: p.description || "",
    });
    setPosDialog(true);
  };
  const savePosition = async () => {
    if (!posForm.code.trim() || !posForm.name.trim()) {
      return toast({ title: "Código y nombre obligatorios", variant: "destructive" });
    }
    const payload: any = {
      code: posForm.code.trim().toUpperCase(),
      name: posForm.name.trim(),
      department: posForm.department || null,
      level: posForm.level || null,
      base_salary: parseFloat(posForm.base_salary) || 0,
      min_salary: parseFloat(posForm.min_salary) || 0,
      max_salary: parseFloat(posForm.max_salary) || 0,
      description: posForm.description || null,
      tenant_id: tenantId,
    };
    const { error } = editPos
      ? await (supabase.from as any)("job_positions").update(payload).eq("id", editPos.id)
      : await (supabase.from as any)("job_positions").insert(payload);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: editPos ? "Puesto actualizado" : "Puesto creado" });
    setPosDialog(false); load();
  };
  const togglePos = async (p: JobPosition) => {
    await (supabase.from as any)("job_positions").update({ is_active: !p.is_active }).eq("id", p.id);
    load();
  };
  const deletePos = async (id: string) => {
    if (!confirm("¿Eliminar puesto? Los empleados con este puesto quedarán sin clasificación.")) return;
    const { error } = await (supabase.from as any)("job_positions").delete().eq("id", id);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    load();
  };

  // ============= Nóminas =============
  const openPayDialog = () => {
    setPreview(null);
    setPayForm({
      employee_id: "",
      period_start: format(new Date(new Date().setDate(1)), "yyyy-MM-dd"),
      period_end: format(new Date(), "yyyy-MM-dd"),
      bonus: "0",
      deductions: "0",
    });
    setPayDialog(true);
  };

  const computePreview = async () => {
    if (!payForm.employee_id || !payForm.period_start || !payForm.period_end) {
      return toast({ title: "Faltan datos", description: "Selecciona empleado y rango", variant: "destructive" });
    }
    setComputing(true);
    const { data, error } = await supabase.rpc("compute_payroll" as any, {
      _employee_id: payForm.employee_id, _start: payForm.period_start, _end: payForm.period_end,
    });
    setComputing(false);
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    const row = (data as any)?.[0] || { hours_worked: 0, base: 0 };
    const bonus = parseFloat(payForm.bonus || "0");
    const ded = parseFloat(payForm.deductions || "0");
    const base = Number(row.base) || 0;
    const gross = base + bonus;
    const net = gross - ded;
    setPreview({ hours: Number(row.hours_worked) || 0, base, bonus, ded, gross, net });
  };

  const savePayroll = async () => {
    if (!preview) return toast({ title: "Calcula primero la nómina", variant: "destructive" });
    const { error } = await supabase.from("payroll_runs").insert({
      tenant_id: tenantId, employee_id: payForm.employee_id,
      period_start: payForm.period_start, period_end: payForm.period_end,
      base_salary: preview.base, hours_worked: preview.hours,
      bonus: preview.bonus, deductions: preview.ded, net_pay: preview.net,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({
      title: "Nómina generada",
      description: `Neto: $${preview.net.toFixed(2)} · Se creó cuenta por pagar automáticamente.`,
    });
    setPayDialog(false); load();
  };

  const payNow = async (p: Payroll) => {
    if (!confirm(`Pagar nómina de ${p.employees?.name} por $${Number(p.net_pay).toFixed(2)}?`)) return;
    const { error } = await (supabase.rpc as any)("pay_payroll", {
      _payroll_id: p.id, _method: "transfer", _notes: null,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Pago registrado", description: "Cuenta por pagar cerrada y movimiento contable creado." });
    load();
  };

  const cancelPayroll = async (p: Payroll) => {
    if (p.status === "paid") return;
    if (!confirm("¿Anular esta nómina y su cuenta por pagar?")) return;
    await (supabase.from as any)("accounts_payable").update({ status: "cancelled" }).eq("source_type", "payroll").eq("source_id", p.id);
    await supabase.from("payroll_runs").delete().eq("id", p.id);
    load();
  };

  // Helpers
  const apFor = useMemo(() => {
    const m = new Map<string, AP>();
    payables.forEach((a) => m.set(a.source_id, a));
    return m;
  }, [payables]);

  const pendingAP = payables.filter((a) => a.status !== "paid" && a.status !== "cancelled");
  const totalDue = pendingAP.reduce((s, a) => s + Number(a.amount) - Number(a.amount_paid), 0);

  return (
    <AppLayout title="Recursos Humanos">
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-heading font-bold tracking-tight">Recursos Humanos</h1>
            <p className="text-sm text-muted-foreground">Puestos, horarios, nóminas y cuentas por pagar</p>
          </div>
          {totalDue > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-warning" />
              <span>Nóminas por pagar: <span className="font-bold">${totalDue.toFixed(2)}</span> ({pendingAP.length})</span>
            </div>
          )}
        </div>

        <Tabs defaultValue="payroll">
          <TabsList>
            <TabsTrigger value="payroll"><DollarSign className="h-4 w-4 mr-2" />Nóminas</TabsTrigger>
            <TabsTrigger value="positions"><Briefcase className="h-4 w-4 mr-2" />Puestos</TabsTrigger>
            <TabsTrigger value="schedules"><Calendar className="h-4 w-4 mr-2" />Horarios</TabsTrigger>
          </TabsList>

          {/* ===== NÓMINAS ===== */}
          <TabsContent value="payroll" className="space-y-3">
            <div className="flex justify-end">
              <Button onClick={openPayDialog} className="gradient-brand text-primary-foreground gap-1"><Plus className="h-4 w-4" />Generar nómina</Button>
            </div>
            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right">Horas trab.</TableHead>
                    <TableHead className="text-right">Salario base</TableHead>
                    <TableHead className="text-right">Bonos</TableHead>
                    <TableHead className="text-right">Deducc.</TableHead>
                    <TableHead className="text-right">Neto a pagar</TableHead>
                    <TableHead>Cuenta x Pagar</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrolls.map((p) => {
                    const ap = apFor.get(p.id);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.employees?.name}</TableCell>
                        <TableCell className="text-xs">{p.period_start} → {p.period_end}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(p.hours_worked).toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums">${Number(p.base_salary).toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums text-success">+${Number(p.bonus).toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums text-destructive">-${Number(p.deductions).toFixed(2)}</TableCell>
                        <TableCell className="text-right tabular-nums font-bold">${Number(p.net_pay).toFixed(2)}</TableCell>
                        <TableCell>
                          {ap ? (
                            <Badge variant={ap.status === "paid" ? "default" : ap.status === "cancelled" ? "secondary" : "outline"} className="text-[10px] gap-1">
                              <FileText className="h-3 w-3" />
                              {ap.status === "paid" ? "Pagada" : ap.status === "cancelled" ? "Anulada" : `Vence ${ap.due_date || "—"}`}
                            </Badge>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell><Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status === "paid" ? "Pagado" : "Pendiente"}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            {p.status !== "paid" && (
                              <Button size="sm" variant="outline" onClick={() => payNow(p)} className="gap-1">
                                <CheckCircle2 className="h-3 w-3" />Pagar
                              </Button>
                            )}
                            {p.status !== "paid" && (
                              <Button size="sm" variant="ghost" onClick={() => cancelPayroll(p)} className="text-destructive">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {payrolls.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-8">Sin nóminas generadas</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          {/* ===== PUESTOS ===== */}
          <TabsContent value="positions" className="space-y-3">
            <div className="flex justify-end">
              <Button onClick={openPosNew} className="gradient-brand text-primary-foreground gap-1"><Plus className="h-4 w-4" />Nuevo puesto</Button>
            </div>
            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Nivel</TableHead>
                  <TableHead className="text-right">Salario base</TableHead>
                  <TableHead className="text-right">Rango</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {positions.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.code}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.department || "—"}</TableCell>
                      <TableCell>{p.level ? <Badge variant="outline">{p.level}</Badge> : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">${Number(p.base_salary).toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                        {p.min_salary || p.max_salary ? `$${Number(p.min_salary).toFixed(0)} – $${Number(p.max_salary).toFixed(0)}` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.is_active ? "default" : "secondary"} className="cursor-pointer" onClick={() => togglePos(p)}>
                          {p.is_active ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => openPosEdit(p)}><Edit2 className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => deletePos(p.id)} className="text-destructive"><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {positions.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">Aún no has creado puestos laborales</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          {/* ===== HORARIOS ===== */}
          <TabsContent value="schedules" className="space-y-3">
            <div className="flex justify-end">
              <Button onClick={() => setSchedDialog(true)} className="gradient-brand text-primary-foreground gap-1"><Plus className="h-4 w-4" />Nuevo horario</Button>
            </div>
            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Empleado</TableHead><TableHead>Día</TableHead><TableHead>Inicio</TableHead><TableHead>Fin</TableHead><TableHead className="text-right">Acciones</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {schedules.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.employees?.name}</TableCell>
                      <TableCell>{DAYS[s.day_of_week]}</TableCell>
                      <TableCell>{s.start_time}</TableCell>
                      <TableCell>{s.end_time}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => deleteSchedule(s.id)} className="text-destructive"><Trash2 className="h-3 w-3" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {schedules.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">Sin horarios configurados</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>

        {/* ===== Dialogs ===== */}
        <Dialog open={schedDialog} onOpenChange={setSchedDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo horario</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Empleado</Label>
                <Select value={schedForm.employee_id} onValueChange={(v) => setSchedForm({ ...schedForm, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Día de la semana</Label>
                <Select value={schedForm.day_of_week} onValueChange={(v) => setSchedForm({ ...schedForm, day_of_week: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Hora inicio</Label><Input type="time" value={schedForm.start_time} onChange={(e) => setSchedForm({ ...schedForm, start_time: e.target.value })} /></div>
                <div><Label>Hora fin</Label><Input type="time" value={schedForm.end_time} onChange={(e) => setSchedForm({ ...schedForm, end_time: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter><Button onClick={saveSchedule} className="gradient-brand text-primary-foreground">Guardar</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ===== Puesto Dialog ===== */}
        <Dialog open={posDialog} onOpenChange={setPosDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editPos ? "Editar puesto" : "Nuevo puesto laboral"}</DialogTitle>
              <DialogDescription>Clasifica los puestos disponibles en la empresa con su rango salarial.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Código *</Label><Input value={posForm.code} onChange={(e) => setPosForm({ ...posForm, code: e.target.value })} placeholder="ADM-01" /></div>
                <div><Label>Nivel</Label>
                  <Select value={posForm.level || "__none__"} onValueChange={(v) => setPosForm({ ...posForm, level: v === "__none__" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin nivel</SelectItem>
                      <SelectItem value="junior">Junior</SelectItem>
                      <SelectItem value="semi-senior">Semi-Senior</SelectItem>
                      <SelectItem value="senior">Senior</SelectItem>
                      <SelectItem value="lead">Líder / Jefe</SelectItem>
                      <SelectItem value="manager">Gerente</SelectItem>
                      <SelectItem value="director">Director</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Nombre del puesto *</Label><Input value={posForm.name} onChange={(e) => setPosForm({ ...posForm, name: e.target.value })} placeholder="Vendedor de tienda" /></div>
              <div><Label>Departamento</Label><Input value={posForm.department} onChange={(e) => setPosForm({ ...posForm, department: e.target.value })} placeholder="Ventas" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>Salario base</Label><Input type="number" value={posForm.base_salary} onChange={(e) => setPosForm({ ...posForm, base_salary: e.target.value })} /></div>
                <div><Label>Salario mín.</Label><Input type="number" value={posForm.min_salary} onChange={(e) => setPosForm({ ...posForm, min_salary: e.target.value })} /></div>
                <div><Label>Salario máx.</Label><Input type="number" value={posForm.max_salary} onChange={(e) => setPosForm({ ...posForm, max_salary: e.target.value })} /></div>
              </div>
              <div><Label>Descripción / responsabilidades</Label><Textarea rows={3} value={posForm.description} onChange={(e) => setPosForm({ ...posForm, description: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPosDialog(false)}>Cancelar</Button>
              <Button onClick={savePosition} className="gradient-brand text-primary-foreground">Guardar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ===== Nómina Dialog con preview ===== */}
        <Dialog open={payDialog} onOpenChange={setPayDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Generar nómina</DialogTitle>
              <DialogDescription>
                Calcula el monto en base a horas trabajadas, bonos y deducciones. Al guardar se creará una cuenta por pagar automáticamente.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div><Label>Empleado</Label>
                <Select value={payForm.employee_id} onValueChange={(v) => { setPreview(null); setPayForm({ ...payForm, employee_id: v }); }}>
                  <SelectTrigger><SelectValue placeholder="Selecciona empleado" /></SelectTrigger>
                  <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Desde</Label><Input type="date" value={payForm.period_start} onChange={(e) => { setPreview(null); setPayForm({ ...payForm, period_start: e.target.value }); }} /></div>
                <div><Label>Hasta</Label><Input type="date" value={payForm.period_end} onChange={(e) => { setPreview(null); setPayForm({ ...payForm, period_end: e.target.value }); }} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Bonos (+)</Label>
                  <Input type="number" value={payForm.bonus} onChange={(e) => { setPreview(null); setPayForm({ ...payForm, bonus: e.target.value }); }} />
                  <p className="text-[10px] text-muted-foreground mt-1">Comisiones, premios extra</p>
                </div>
                <div>
                  <Label>Deducciones (-)</Label>
                  <Input type="number" value={payForm.deductions} onChange={(e) => { setPreview(null); setPayForm({ ...payForm, deductions: e.target.value }); }} />
                  <p className="text-[10px] text-muted-foreground mt-1">Adelantos, multas, descuentos</p>
                </div>
              </div>

              <Button variant="outline" size="sm" onClick={computePreview} disabled={computing} className="w-full">
                {computing ? "Calculando..." : "Calcular nómina"}
              </Button>

              {preview && (
                <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1.5">
                  <div className="flex justify-between"><span className="text-muted-foreground">Horas trabajadas</span><span className="tabular-nums">{preview.hours.toFixed(2)} h</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Salario base (período)</span><span className="tabular-nums">${preview.base.toFixed(2)}</span></div>
                  <div className="flex justify-between text-success"><span>(+) Bonos</span><span className="tabular-nums">${preview.bonus.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="font-medium">Bruto</span><span className="tabular-nums font-medium">${preview.gross.toFixed(2)}</span></div>
                  <div className="flex justify-between text-destructive"><span>(-) Deducciones</span><span className="tabular-nums">${preview.ded.toFixed(2)}</span></div>
                  <div className="flex justify-between border-t pt-1.5 mt-1.5">
                    <span className="font-bold">Neto a pagar</span>
                    <span className="tabular-nums font-bold text-lg">${preview.net.toFixed(2)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-1">
                    Se creará una cuenta por pagar con vencimiento {format(addDays(new Date(payForm.period_end), 5), "dd/MM/yyyy")}.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayDialog(false)}>Cancelar</Button>
              <Button onClick={savePayroll} disabled={!preview} className="gradient-brand text-primary-foreground">Guardar nómina</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
