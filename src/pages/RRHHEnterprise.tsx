import { AppLayout } from "@/components/AppLayout";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Clock, Plane, FileText, TrendingUp, CheckCircle2, XCircle, LogIn, LogOut, MapPin } from "lucide-react";
import { format } from "date-fns";

interface Employee { id: string; name: string; position: string | null; department: string | null; }
interface Attendance { id: string; employee_id: string; check_in: string; check_out: string | null; hours_worked: number | null; check_in_lat: number | null; check_in_lng: number | null; }
interface Leave { id: string; employee_id: string; leave_type: string; start_date: string; end_date: string; days: number; status: string; reason: string | null; }
interface Contract { id: string; employee_id: string; contract_type: string; start_date: string; end_date: string | null; base_salary: number; status: string; }
interface Overtime { id: string; employee_id: string; date: string; hours: number; pay_factor: number; status: string; }

export default function RRHHEnterprise() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const [tab, setTab] = useState("fichaje");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [overtime, setOvertime] = useState<Overtime[]>([]);

  const [selectedEmp, setSelectedEmp] = useState<string>("");
  const [openLeave, setOpenLeave] = useState(false);
  const [openContract, setOpenContract] = useState(false);
  const [openOvertime, setOpenOvertime] = useState(false);

  const [leaveForm, setLeaveForm] = useState({ employee_id: "", leave_type: "vacation", start_date: format(new Date(), "yyyy-MM-dd"), end_date: format(new Date(), "yyyy-MM-dd"), reason: "" });
  const [contractForm, setContractForm] = useState({ employee_id: "", contract_type: "indefinite", start_date: format(new Date(), "yyyy-MM-dd"), end_date: "", base_salary: "", weekly_hours: "40" });
  const [otForm, setOtForm] = useState({ employee_id: "", date: format(new Date(), "yyyy-MM-dd"), hours: "", pay_factor: "1.5", reason: "" });

  const load = async () => {
    if (!tenantId) return;
    const [e, a, l, c, o] = await Promise.all([
      supabase.from("employees").select("id, name, position, department").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
      supabase.from("employee_attendance").select("*").eq("tenant_id", tenantId).order("check_in", { ascending: false }).limit(100),
      supabase.from("leave_requests" as any).select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      supabase.from("employee_contracts" as any).select("*").eq("tenant_id", tenantId).order("start_date", { ascending: false }),
      supabase.from("overtime_records" as any).select("*").eq("tenant_id", tenantId).order("date", { ascending: false }),
    ]);
    setEmployees((e.data as any) || []);
    setAttendance((a.data as any) || []);
    setLeaves((l.data as any) || []);
    setContracts((c.data as any) || []);
    setOvertime((o.data as any) || []);
    if (!selectedEmp && e.data?.length) setSelectedEmp(e.data[0].id);
  };
  useEffect(() => { load(); }, [tenantId]);

  const empName = (id: string) => employees.find((x) => x.id === id)?.name || "—";
  const openShift = useMemo(() => attendance.find((a) => a.employee_id === selectedEmp && !a.check_out), [attendance, selectedEmp]);

  const getGeo = (): Promise<{ lat: number | null; lng: number | null }> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({ lat: null, lng: null });
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve({ lat: null, lng: null }),
        { timeout: 5000 }
      );
    });

  const doClockIn = async () => {
    if (!selectedEmp) return;
    const geo = await getGeo();
    const { error } = await (supabase as any).rpc("clock_in", { p_employee_id: selectedEmp, p_lat: geo.lat, p_lng: geo.lng, p_source: "web" });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Entrada registrada" }); load();
  };
  const doClockOut = async () => {
    if (!selectedEmp) return;
    const geo = await getGeo();
    const { error } = await (supabase as any).rpc("clock_out", { p_employee_id: selectedEmp, p_lat: geo.lat, p_lng: geo.lng });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    toast({ title: "Salida registrada" }); load();
  };

  const createLeave = async () => {
    if (!leaveForm.employee_id) return;
    const { error } = await (supabase as any).rpc("request_leave", {
      p_employee_id: leaveForm.employee_id, p_type: leaveForm.leave_type,
      p_start: leaveForm.start_date, p_end: leaveForm.end_date, p_reason: leaveForm.reason || null,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    setOpenLeave(false); load();
  };
  const approveLeave = async (id: string, approve: boolean) => {
    const { error } = await (supabase as any).rpc("approve_leave", { p_leave_id: id, p_approve: approve });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    load();
  };
  const createContract = async () => {
    if (!contractForm.employee_id) return;
    const { error } = await supabase.from("employee_contracts" as any).insert({
      tenant_id: tenantId, employee_id: contractForm.employee_id,
      contract_type: contractForm.contract_type, start_date: contractForm.start_date,
      end_date: contractForm.end_date || null, base_salary: parseFloat(contractForm.base_salary) || 0,
      weekly_hours: parseFloat(contractForm.weekly_hours) || 40,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    setOpenContract(false); load();
  };
  const createOvertime = async () => {
    if (!otForm.employee_id) return;
    const { error } = await supabase.from("overtime_records" as any).insert({
      tenant_id: tenantId, employee_id: otForm.employee_id, date: otForm.date,
      hours: parseFloat(otForm.hours), pay_factor: parseFloat(otForm.pay_factor) || 1.5, reason: otForm.reason || null,
    });
    if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    setOpenOvertime(false); load();
  };

  const pendingLeaves = leaves.filter((l) => l.status === "pending").length;
  const activeContracts = contracts.filter((c) => c.status === "active").length;
  const openShifts = attendance.filter((a) => !a.check_out).length;
  const otApproved = overtime.filter((o) => o.status === "approved").reduce((s, o) => s + Number(o.hours), 0);

  return (
    <AppLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">RRHH Operativo</h1>
          <p className="text-sm text-muted-foreground">Fichaje, vacaciones, contratos y horas extras</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground">En turno</div><div className="text-xl font-bold text-success">{openShifts}</div></div><Clock className="h-5 w-5 text-success" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground">Solicitudes pendientes</div><div className="text-xl font-bold text-warning">{pendingLeaves}</div></div><Plane className="h-5 w-5 text-warning" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground">Contratos activos</div><div className="text-xl font-bold">{activeContracts}</div></div><FileText className="h-5 w-5 text-primary" /></div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="flex items-center justify-between"><div><div className="text-xs text-muted-foreground">Horas extras aprob.</div><div className="text-xl font-bold">{otApproved.toFixed(1)}</div></div><TrendingUp className="h-5 w-5 text-primary" /></div></CardContent></Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="fichaje">Fichaje</TabsTrigger>
            <TabsTrigger value="vacaciones">Vacaciones {pendingLeaves > 0 && <Badge variant="secondary" className="ml-2">{pendingLeaves}</Badge>}</TabsTrigger>
            <TabsTrigger value="contratos">Contratos</TabsTrigger>
            <TabsTrigger value="horas-extras">Horas extras</TabsTrigger>
          </TabsList>

          {/* FICHAJE */}
          <TabsContent value="fichaje" className="space-y-3">
            <Card><CardContent className="p-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="flex-1">
                  <Label>Empleado</Label>
                  <Select value={selectedEmp} onValueChange={setSelectedEmp}>
                    <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                    <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {openShift ? (
                  <Button onClick={doClockOut} variant="destructive" className="gap-1"><LogOut className="h-4 w-4" /> Marcar salida</Button>
                ) : (
                  <Button onClick={doClockIn} className="gap-1"><LogIn className="h-4 w-4" /> Marcar entrada</Button>
                )}
              </div>
              {openShift && <div className="text-xs text-muted-foreground">Turno abierto desde {format(new Date(openShift.check_in), "dd/MM HH:mm")} · {openShift.check_in_lat ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{openShift.check_in_lat.toFixed(4)},{openShift.check_in_lng?.toFixed(4)}</span> : "sin geo"}</div>}
            </CardContent></Card>

            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Empleado</TableHead><TableHead>Entrada</TableHead><TableHead>Salida</TableHead><TableHead>Horas</TableHead><TableHead>Geo</TableHead></TableRow></TableHeader>
                <TableBody>
                  {attendance.slice(0, 50).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{empName(a.employee_id)}</TableCell>
                      <TableCell className="text-xs">{format(new Date(a.check_in), "dd/MM HH:mm")}</TableCell>
                      <TableCell className="text-xs">{a.check_out ? format(new Date(a.check_out), "dd/MM HH:mm") : <Badge variant="secondary">Abierto</Badge>}</TableCell>
                      <TableCell>{a.hours_worked ? Number(a.hours_worked).toFixed(2) : "—"}</TableCell>
                      <TableCell>{a.check_in_lat ? <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" /> Sí</Badge> : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {attendance.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">Sin registros</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          {/* VACACIONES */}
          <TabsContent value="vacaciones" className="space-y-3">
            <div className="flex justify-end"><Button size="sm" onClick={() => setOpenLeave(true)} className="gap-1"><Plus className="h-4 w-4" /> Nueva solicitud</Button></div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Empleado</TableHead><TableHead>Tipo</TableHead><TableHead>Desde</TableHead><TableHead>Hasta</TableHead><TableHead>Días</TableHead><TableHead>Estado</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {leaves.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{empName(l.employee_id)}</TableCell>
                      <TableCell><Badge variant="outline">{l.leave_type}</Badge></TableCell>
                      <TableCell>{format(new Date(l.start_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{format(new Date(l.end_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{l.days}</TableCell>
                      <TableCell><Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"}>{l.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        {l.status === "pending" && <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => approveLeave(l.id, true)}><CheckCircle2 className="h-3.5 w-3.5 text-success" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => approveLeave(l.id, false)}><XCircle className="h-3.5 w-3.5 text-destructive" /></Button>
                        </div>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {leaves.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Sin solicitudes</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          {/* CONTRATOS */}
          <TabsContent value="contratos" className="space-y-3">
            <div className="flex justify-end"><Button size="sm" onClick={() => setOpenContract(true)} className="gap-1"><Plus className="h-4 w-4" /> Nuevo contrato</Button></div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Empleado</TableHead><TableHead>Tipo</TableHead><TableHead>Inicio</TableHead><TableHead>Fin</TableHead><TableHead className="text-right">Salario base</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
                <TableBody>
                  {contracts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{empName(c.employee_id)}</TableCell>
                      <TableCell><Badge variant="outline">{c.contract_type}</Badge></TableCell>
                      <TableCell>{format(new Date(c.start_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{c.end_date ? format(new Date(c.end_date), "dd/MM/yyyy") : "—"}</TableCell>
                      <TableCell className="text-right font-mono">{Number(c.base_salary).toFixed(2)}</TableCell>
                      <TableCell><Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {contracts.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">Sin contratos</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          {/* HORAS EXTRAS */}
          <TabsContent value="horas-extras" className="space-y-3">
            <div className="flex justify-end"><Button size="sm" onClick={() => setOpenOvertime(true)} className="gap-1"><Plus className="h-4 w-4" /> Registrar</Button></div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Empleado</TableHead><TableHead>Fecha</TableHead><TableHead>Horas</TableHead><TableHead>Factor</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
                <TableBody>
                  {overtime.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>{empName(o.employee_id)}</TableCell>
                      <TableCell>{format(new Date(o.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{Number(o.hours).toFixed(2)}</TableCell>
                      <TableCell>x{Number(o.pay_factor).toFixed(2)}</TableCell>
                      <TableCell><Badge variant={o.status === "approved" || o.status === "paid" ? "default" : "secondary"}>{o.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {overtime.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">Sin registros</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>

        {/* Leave dialog */}
        <Dialog open={openLeave} onOpenChange={setOpenLeave}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nueva solicitud</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Empleado</Label>
                <Select value={leaveForm.employee_id} onValueChange={(v) => setLeaveForm({ ...leaveForm, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                  <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Tipo</Label>
                <Select value={leaveForm.leave_type} onValueChange={(v) => setLeaveForm({ ...leaveForm, leave_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vacation">Vacaciones</SelectItem>
                    <SelectItem value="sick">Enfermedad</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="maternity">Maternidad</SelectItem>
                    <SelectItem value="paternity">Paternidad</SelectItem>
                    <SelectItem value="unpaid">Sin sueldo</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Desde</Label><Input type="date" value={leaveForm.start_date} onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })} /></div>
                <div><Label>Hasta</Label><Input type="date" value={leaveForm.end_date} onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })} /></div>
              </div>
              <div><Label>Motivo</Label><Textarea value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpenLeave(false)}>Cancelar</Button><Button onClick={createLeave}>Solicitar</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Contract dialog */}
        <Dialog open={openContract} onOpenChange={setOpenContract}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nuevo contrato</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Empleado</Label>
                <Select value={contractForm.employee_id} onValueChange={(v) => setContractForm({ ...contractForm, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                  <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Tipo</Label>
                <Select value={contractForm.contract_type} onValueChange={(v) => setContractForm({ ...contractForm, contract_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="indefinite">Indefinido</SelectItem>
                    <SelectItem value="fixed">Fijo (con fin)</SelectItem>
                    <SelectItem value="temporary">Temporal</SelectItem>
                    <SelectItem value="part_time">Tiempo parcial</SelectItem>
                    <SelectItem value="internship">Prácticas</SelectItem>
                    <SelectItem value="freelance">Autónomo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Inicio</Label><Input type="date" value={contractForm.start_date} onChange={(e) => setContractForm({ ...contractForm, start_date: e.target.value })} /></div>
                <div><Label>Fin (opcional)</Label><Input type="date" value={contractForm.end_date} onChange={(e) => setContractForm({ ...contractForm, end_date: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Salario base</Label><Input type="number" step="0.01" value={contractForm.base_salary} onChange={(e) => setContractForm({ ...contractForm, base_salary: e.target.value })} /></div>
                <div><Label>Horas semanales</Label><Input type="number" value={contractForm.weekly_hours} onChange={(e) => setContractForm({ ...contractForm, weekly_hours: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpenContract(false)}>Cancelar</Button><Button onClick={createContract}>Crear</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Overtime dialog */}
        <Dialog open={openOvertime} onOpenChange={setOpenOvertime}>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar horas extras</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Empleado</Label>
                <Select value={otForm.employee_id} onValueChange={(v) => setOtForm({ ...otForm, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                  <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>Fecha</Label><Input type="date" value={otForm.date} onChange={(e) => setOtForm({ ...otForm, date: e.target.value })} /></div>
                <div><Label>Horas</Label><Input type="number" step="0.25" value={otForm.hours} onChange={(e) => setOtForm({ ...otForm, hours: e.target.value })} /></div>
                <div><Label>Factor</Label><Input type="number" step="0.1" value={otForm.pay_factor} onChange={(e) => setOtForm({ ...otForm, pay_factor: e.target.value })} /></div>
              </div>
              <div><Label>Motivo</Label><Textarea value={otForm.reason} onChange={(e) => setOtForm({ ...otForm, reason: e.target.value })} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpenOvertime(false)}>Cancelar</Button><Button onClick={createOvertime}>Registrar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
