import { AppLayout } from "@/components/AppLayout";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
  Calendar, DollarSign, Plus, CheckCircle2, Briefcase, Edit2, Trash2, FileText, AlertCircle,
  Clock, Plane, TrendingUp, LogIn, LogOut, MapPin, XCircle, Users, ShieldCheck,
} from "lucide-react";
import { format, addDays } from "date-fns";
import { PayrollEditDialog, type EditablePayroll } from "@/components/rrhh/PayrollEditDialog";
import { PayrollBatchDialog } from "@/components/rrhh/PayrollBatchDialog";
import { PayrollActionsMenu } from "@/components/rrhh/PayrollActionsMenu";
import { PayrollDetailDialog } from "@/components/rrhh/PayrollDetailDialog";
import { PayrollSignatureDialog } from "@/components/rrhh/PayrollSignatureDialog";
import { PAYROLL_STATUS_LABEL, type PayrollRow } from "@/components/rrhh/payrollTypes";
import { TablePagination } from "@/components/data/TablePagination";
import { useModuleSettings } from "@/hooks/useModuleSettings";
import { HR_DEFAULTS, type HRSettings } from "@/components/config/ConfigHR";


interface Employee { id: string; name: string; salary: number; position: string | null; department: string | null; position_id?: string | null; }
interface Schedule { id: string; employee_id: string; day_of_week: number; start_time: string; end_time: string; is_active: boolean; employees?: { name: string }; }
type Payroll = PayrollRow;


interface JobPosition {
  id: string; code: string; name: string; department: string | null; level: string | null;
  base_salary: number; min_salary: number; max_salary: number; description: string | null; is_active: boolean;
}
interface AP {
  id: string; party_id: string; source_id: string; amount: number; amount_paid: number;
  status: string; due_date: string | null; description: string;
}
interface Attendance { id: string; employee_id: string; check_in: string; check_out: string | null; hours_worked: number | null; check_in_lat: number | null; check_in_lng: number | null; }
interface Leave { id: string; employee_id: string; leave_type: string; start_date: string; end_date: string; days: number; status: string; reason: string | null; }
interface Contract { id: string; employee_id: string; contract_type: string; start_date: string; end_date: string | null; base_salary: number; status: string; }
interface Overtime { id: string; employee_id: string; date: string; hours: number; pay_factor: number; status: string; }

export default function RRHH() {
  const { t } = useTranslation();
  const tenantId = useTenant();
  const { toast } = useToast();
  const [tab, setTab] = useState("resumen");

  const DAYS = t("modules.hr.days", { returnObjects: true }) as string[];

  // Translation helpers
  const tx = (key: string, fallback: string, opts?: any): string => {
    const v = t(key, opts) as unknown as string;
    return v === key ? fallback : v;
  };
  const asStr = (v: any): string => (typeof v === "string" ? v : String(v ?? ""));
  const leaveTypeLabel = (k: string) => tx(`modules.hr.leaves.types.${k}`, k);
  const leaveStatusLabel = (k: string) => tx(`modules.hr.leaves.statuses.${k}`, k);
  const contractTypeLabel = (k: string) => tx(`modules.hr.contracts.types.${k}`, k);
  const otStatusLabel = (k: string) => tx(`modules.hr.overtime.statuses.${k}`, k);

  // Datos compartidos
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [positions, setPositions] = useState<JobPosition[]>([]);
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [payables, setPayables] = useState<AP[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [overtime, setOvertime] = useState<Overtime[]>([]);

  // Dialog states
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
  const [editPayroll, setEditPayroll] = useState<EditablePayroll | null>(null);

  const [detailPayroll, setDetailPayroll] = useState<PayrollRow | null>(null);
  const [signPayroll, setSignPayroll] = useState<PayrollRow | null>(null);
  const [detailKey, setDetailKey] = useState(0);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [signedIds, setSignedIds] = useState<Set<string>>(new Set());
  const [payFilters, setPayFilters] = useState({ q: "", status: "all", employee: "all", from: "", to: "" });
  const [payPage, setPayPage] = useState(1);
  const [payPageSize, setPayPageSize] = useState(25);

  const { settings: hrSettings } = useModuleSettings<HRSettings>("hr", HR_DEFAULTS);


  const [selectedEmp, setSelectedEmp] = useState<string>("");
  const [openLeave, setOpenLeave] = useState(false);
  const [openContract, setOpenContract] = useState(false);
  const [openOvertime, setOpenOvertime] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ employee_id: "", leave_type: "vacation", start_date: format(new Date(), "yyyy-MM-dd"), end_date: format(new Date(), "yyyy-MM-dd"), reason: "" });
  const [contractForm, setContractForm] = useState({ employee_id: "", contract_type: "indefinite", start_date: format(new Date(), "yyyy-MM-dd"), end_date: "", base_salary: "", weekly_hours: "40" });
  const [otForm, setOtForm] = useState({ employee_id: "", date: format(new Date(), "yyyy-MM-dd"), hours: "", pay_factor: "1.5", reason: "" });

  const load = async () => {
    if (!tenantId) return;
    const [e, s, p, jp, ap, att, lv, ct, ot] = await Promise.all([
      supabase.from("employees").select("id,name,salary,position,department,position_id").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
      supabase.from("work_schedules").select("*, employees(name)").eq("tenant_id", tenantId).order("day_of_week"),
      supabase.from("payroll_runs").select("*, employees(name, position, department, document_id)").eq("tenant_id", tenantId).order("period_end", { ascending: false }),
      (supabase.from as any)("job_positions").select("*").eq("tenant_id", tenantId).order("name"),
      (supabase.from as any)("accounts_payable").select("id, party_id, source_id, amount, amount_paid, status, due_date, description").eq("tenant_id", tenantId).eq("source_type", "payroll"),
      supabase.from("employee_attendance").select("*").eq("tenant_id", tenantId).order("check_in", { ascending: false }).limit(100),
      (supabase.from as any)("leave_requests").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      (supabase.from as any)("employee_contracts").select("*").eq("tenant_id", tenantId).order("start_date", { ascending: false }),
      (supabase.from as any)("overtime_records").select("*").eq("tenant_id", tenantId).order("date", { ascending: false }),
    ]);
    setEmployees((e.data as any) || []);
    setSchedules((s.data as any) || []);
    setPayrolls((p.data as any) || []);
    setPositions((jp.data as any) || []);
    setPayables((ap.data as any) || []);
    setAttendance((att.data as any) || []);
    setLeaves((lv.data as any) || []);
    setContracts((ct.data as any) || []);
    setOvertime((ot.data as any) || []);
    if (!selectedEmp && e.data?.length) setSelectedEmp(e.data[0].id);

    const [tn, sg] = await Promise.all([
      supabase.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
      (supabase.from as any)("payroll_signatures").select("payroll_id").eq("tenant_id", tenantId),
    ]);
    setTenantName((tn.data as any)?.name ?? null);
    setSignedIds(new Set((((sg.data as any) || []) as any[]).map((r) => r.payroll_id)));
  };

  useEffect(() => { load(); }, [tenantId]);


  const empName = (id: string) => employees.find((x) => x.id === id)?.name || "—";
  const openShift = useMemo(() => attendance.find((a) => a.employee_id === selectedEmp && !a.check_out), [attendance, selectedEmp]);

  const saveSchedule = async () => {
    if (!schedForm.employee_id) return toast({ title: t("modules.hr.schedules.selectEmpError"), variant: "destructive" });
    const { error } = await supabase.from("work_schedules").insert({
      tenant_id: tenantId, employee_id: schedForm.employee_id,
      day_of_week: parseInt(schedForm.day_of_week), start_time: schedForm.start_time, end_time: schedForm.end_time,
    });
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    setSchedDialog(false); load();
  };
  const deleteSchedule = async (id: string) => {
    const { error } = await supabase.from("work_schedules").delete().eq("id", id);
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    load();
  };

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
      return toast({ title: t("modules.hr.positions.codeNameRequired"), variant: "destructive" });
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
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    toast({ title: editPos ? t("modules.hr.positions.updated") : t("modules.hr.positions.created") });
    setPosDialog(false); load();
  };
  const togglePos = async (p: JobPosition) => {
    await (supabase.from as any)("job_positions").update({ is_active: !p.is_active }).eq("id", p.id);
    load();
  };
  const deletePos = async (id: string) => {
    if (!confirm(t("modules.hr.positions.deleteConfirm"))) return;
    const { error } = await (supabase.from as any)("job_positions").delete().eq("id", id);
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    load();
  };

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
      return toast({ title: t("modules.hr.payroll.missingData"), description: t("modules.hr.payroll.selectEmpRange"), variant: "destructive" });
    }
    const emp = employees.find((x) => x.id === payForm.employee_id);
    if (!emp?.position_id) {
      return toast({ title: t("modules.hr.payroll.noPosTitle"), description: t("modules.hr.payroll.noPosDesc"), variant: "destructive" });
    }
    setComputing(true);
    const { data, error } = await supabase.rpc("compute_payroll" as any, {
      _employee_id: payForm.employee_id, _start: payForm.period_start, _end: payForm.period_end,
    });
    setComputing(false);
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    const row = (data as any)?.[0] || { hours_worked: 0, base: 0 };
    const bonus = parseFloat(payForm.bonus || "0");
    const ded = parseFloat(payForm.deductions || "0");
    const base = Number(row.base) || 0;
    const gross = base + bonus;
    const net = gross - ded;
    setPreview({ hours: Number(row.hours_worked) || 0, base, bonus, ded, gross, net });
  };
  const savePayroll = async () => {
    if (!preview) return toast({ title: t("modules.hr.payroll.computeFirst"), variant: "destructive" });
    const { error } = await supabase.from("payroll_runs").insert({
      tenant_id: tenantId, employee_id: payForm.employee_id,
      period_start: payForm.period_start, period_end: payForm.period_end,
      base_salary: preview.base, hours_worked: preview.hours,
      bonus: preview.bonus, deductions: preview.ded, net_pay: preview.net,
    });
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    toast({ title: t("modules.hr.payroll.generated"), description: t("modules.hr.payroll.generatedDesc", { amount: `$${preview.net.toFixed(2)}` }) });
    setPayDialog(false); load();
  };
  const approvePayroll = async (p: Payroll) => {
    const { error } = await (supabase.rpc as any)("approve_payroll_run", { p_payroll_id: p.id });
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    toast({ title: "Nómina aprobada", description: `${p.employees?.name || "—"} · $${Number(p.net_pay).toFixed(2)}` });
    load();
  };
  const payNow = async (p: Payroll) => {
    if (hrSettings.require_payroll_approval && p.status !== "approved") {
      return toast({ title: "Aprobación requerida", description: "Aprueba la nómina antes de registrar el pago.", variant: "destructive" });
    }
    if (!confirm(t("modules.hr.payroll.payConfirm", { name: p.employees?.name || "—", amount: `$${Number(p.net_pay).toFixed(2)}` }))) return;
    const { error } = await (supabase.rpc as any)("pay_payroll", { _payroll_id: p.id, _method: p.payment_method || hrSettings.payment_method || "transfer", _notes: null });
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    toast({ title: t("modules.hr.payroll.paymentRegistered") });
    load();
  };

  const cancelPayroll = async (p: Payroll) => {
    if (p.status === "paid") return;
    if (!confirm(t("modules.hr.payroll.cancelConfirm"))) return;
    await (supabase.from as any)("accounts_payable").update({ status: "cancelled" }).eq("source_type", "payroll").eq("source_id", p.id);
    await supabase.from("payroll_runs").delete().eq("id", p.id);
    load();
  };

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
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    toast({ title: t("modules.hr.clockIn.inRegistered") }); load();
  };
  const doClockOut = async () => {
    if (!selectedEmp) return;
    const geo = await getGeo();
    const { error } = await (supabase as any).rpc("clock_out", { p_employee_id: selectedEmp, p_lat: geo.lat, p_lng: geo.lng });
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    toast({ title: t("modules.hr.clockIn.outRegistered") }); load();
  };

  const createLeave = async () => {
    if (!leaveForm.employee_id) return;
    const { error } = await (supabase as any).rpc("request_leave", {
      p_employee_id: leaveForm.employee_id, p_type: leaveForm.leave_type,
      p_start: leaveForm.start_date, p_end: leaveForm.end_date, p_reason: leaveForm.reason || null,
    });
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    setOpenLeave(false); load();
  };
  const approveLeave = async (id: string, approve: boolean) => {
    const { error } = await (supabase as any).rpc("approve_leave", { p_leave_id: id, p_approve: approve });
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
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
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    setOpenContract(false); load();
  };
  const createOvertime = async () => {
    if (!otForm.employee_id) return;
    const { error } = await supabase.from("overtime_records" as any).insert({
      tenant_id: tenantId, employee_id: otForm.employee_id, date: otForm.date,
      hours: parseFloat(otForm.hours), pay_factor: parseFloat(otForm.pay_factor) || 1.5, reason: otForm.reason || null,
    });
    if (error) return toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    setOpenOvertime(false); load();
  };

  const apFor = useMemo(() => {
    const m = new Map<string, AP>();
    payables.forEach((a) => m.set(a.source_id, a));
    return m;
  }, [payables]);
  const pendingAP = payables.filter((a) => a.status !== "paid" && a.status !== "cancelled");
  const totalDue = pendingAP.reduce((s, a) => s + Number(a.amount) - Number(a.amount_paid), 0);
  const empWithoutPos = employees.filter((e) => !e.position_id).length;
  const openShiftsCount = attendance.filter((a) => !a.check_out).length;
  const pendingLeaves = leaves.filter((l) => l.status === "pending").length;
  const activeContracts = contracts.filter((c) => c.status === "active").length;
  const otApproved = overtime.filter((o) => o.status === "approved").reduce((s, o) => s + Number(o.hours), 0);
  const totalSalary = employees.reduce((s, e) => s + Number(e.salary || 0), 0);

  return (
    <AppLayout title={t("nav.items.hr")}>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-heading font-bold tracking-tight">{t("modules.hr.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("modules.hr.subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {totalDue > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-warning" />
                <span>{t("modules.hr.banners.toPay")}: <span className="font-bold">${totalDue.toFixed(2)}</span></span>
              </div>
            )}
            {empWithoutPos > 0 && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-warning" />
                <span>{t("modules.hr.banners.withoutPos", { count: empWithoutPos })}</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card><CardContent className="p-3"><div className="text-[10px] text-muted-foreground uppercase tracking-widest">{t("modules.hr.kpis.employees")}</div><div className="text-xl font-bold flex items-center gap-1"><Users className="h-4 w-4 text-primary" />{employees.length}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-[10px] text-muted-foreground uppercase tracking-widest">{t("modules.hr.kpis.positions")}</div><div className="text-xl font-bold flex items-center gap-1"><Briefcase className="h-4 w-4 text-primary" />{positions.length}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-[10px] text-muted-foreground uppercase tracking-widest">{t("modules.hr.kpis.onShift")}</div><div className="text-xl font-bold text-success flex items-center gap-1"><Clock className="h-4 w-4" />{openShiftsCount}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-[10px] text-muted-foreground uppercase tracking-widest">{t("modules.hr.kpis.leavesPending")}</div><div className="text-xl font-bold text-warning flex items-center gap-1"><Plane className="h-4 w-4" />{pendingLeaves}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-[10px] text-muted-foreground uppercase tracking-widest">{t("modules.hr.kpis.contractsActive")}</div><div className="text-xl font-bold flex items-center gap-1"><FileText className="h-4 w-4 text-primary" />{activeContracts}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-[10px] text-muted-foreground uppercase tracking-widest">{t("modules.hr.kpis.monthlyPayroll")}</div><div className="text-xl font-bold tabular-nums">${totalSalary.toLocaleString()}</div></CardContent></Card>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <TabsList className="inline-flex w-auto">
              <TabsTrigger value="resumen"><TrendingUp className="h-4 w-4 mr-1.5" />{t("modules.hr.tabs.summary")}</TabsTrigger>
              <TabsTrigger value="fichaje"><Clock className="h-4 w-4 mr-1.5" />{t("modules.hr.tabs.clockIn")}</TabsTrigger>
              <TabsTrigger value="vacaciones"><Plane className="h-4 w-4 mr-1.5" />{t("modules.hr.tabs.vacations")} {pendingLeaves > 0 && <Badge variant="secondary" className="ml-2">{pendingLeaves}</Badge>}</TabsTrigger>
              <TabsTrigger value="payroll"><DollarSign className="h-4 w-4 mr-1.5" />{t("modules.hr.tabs.payroll")}</TabsTrigger>
              <TabsTrigger value="positions"><Briefcase className="h-4 w-4 mr-1.5" />{t("modules.hr.tabs.positions")}</TabsTrigger>
              <TabsTrigger value="contratos"><FileText className="h-4 w-4 mr-1.5" />{t("modules.hr.tabs.contracts")}</TabsTrigger>
              <TabsTrigger value="schedules"><Calendar className="h-4 w-4 mr-1.5" />{t("modules.hr.tabs.schedules")}</TabsTrigger>
              <TabsTrigger value="overtime"><TrendingUp className="h-4 w-4 mr-1.5" />{t("modules.hr.tabs.overtime")}</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="resumen" className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-heading font-bold">{t("modules.hr.summary.byDept")}</h3>
                    <Badge variant="outline">{t("modules.hr.summary.employeesCount", { count: employees.length })}</Badge>
                  </div>
                  <div className="space-y-1.5">
                    {Object.entries(
                      employees.reduce<Record<string, number>>((acc, e) => {
                        const d = e.department || t("modules.hr.summary.noDept"); acc[d] = (acc[d] || 0) + 1; return acc;
                      }, {})
                    ).sort((a, b) => b[1] - a[1]).map(([d, n]) => (
                      <div key={d} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{d}</span>
                        <span className="font-medium tabular-nums">{n}</span>
                      </div>
                    ))}
                    {employees.length === 0 && <p className="text-xs text-muted-foreground">{t("modules.hr.summary.noEmployees")}</p>}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 space-y-2">
                  <h3 className="font-heading font-bold">{t("modules.hr.summary.nextActions")}</h3>
                  <ul className="space-y-1.5 text-sm">
                    {empWithoutPos > 0 && <li className="flex gap-2"><AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" /><span>{t("modules.hr.summary.withoutPosMsg", { count: empWithoutPos })} <button onClick={() => setTab("positions")} className="underline">{t("modules.hr.summary.positionsLink")}</button>.</span></li>}
                    {pendingLeaves > 0 && <li className="flex gap-2"><Plane className="h-4 w-4 text-warning shrink-0 mt-0.5" /><span>{t("modules.hr.summary.leavesPendingMsg", { count: pendingLeaves })}</span></li>}
                    {pendingAP.length > 0 && <li className="flex gap-2"><DollarSign className="h-4 w-4 text-warning shrink-0 mt-0.5" /><span>{t("modules.hr.summary.payrollDueMsg", { count: pendingAP.length })} <b>${totalDue.toFixed(2)}</b>.</span></li>}
                    {empWithoutPos === 0 && pendingLeaves === 0 && pendingAP.length === 0 && (
                      <li className="flex gap-2 text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />{t("modules.hr.summary.allUpToDate")}</li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="fichaje" className="space-y-3">
            <Card><CardContent className="p-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <div className="flex-1">
                  <Label>{t("modules.hr.clockIn.employee")}</Label>
                  <Select value={selectedEmp} onValueChange={setSelectedEmp}>
                    <SelectTrigger><SelectValue placeholder={t("modules.hr.clockIn.selectPlaceholder")} /></SelectTrigger>
                    <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}{e.position ? ` · ${e.position}` : ""}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {openShift ? (
                  <Button onClick={doClockOut} variant="destructive" className="gap-1"><LogOut className="h-4 w-4" /> {t("modules.hr.clockIn.clockOut")}</Button>
                ) : (
                  <Button onClick={doClockIn} className="gap-1 gradient-brand text-primary-foreground"><LogIn className="h-4 w-4" /> {t("modules.hr.clockIn.clockIn")}</Button>
                )}
              </div>
              {openShift && <div className="text-xs text-muted-foreground">{t("modules.hr.clockIn.openSince")} {format(new Date(openShift.check_in), "dd/MM HH:mm")} · {openShift.check_in_lat ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{openShift.check_in_lat.toFixed(4)},{openShift.check_in_lng?.toFixed(4)}</span> : t("modules.hr.clockIn.noGeo")}</div>}
            </CardContent></Card>

            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>{t("modules.hr.clockIn.header.employee")}</TableHead><TableHead>{t("modules.hr.clockIn.header.in")}</TableHead><TableHead>{t("modules.hr.clockIn.header.out")}</TableHead><TableHead>{t("modules.hr.clockIn.header.hours")}</TableHead><TableHead>{t("modules.hr.clockIn.header.geo")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {attendance.slice(0, 50).map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{empName(a.employee_id)}</TableCell>
                      <TableCell className="text-xs">{format(new Date(a.check_in), "dd/MM HH:mm")}</TableCell>
                      <TableCell className="text-xs">{a.check_out ? format(new Date(a.check_out), "dd/MM HH:mm") : <Badge variant="secondary">{t("modules.hr.clockIn.openBadge")}</Badge>}</TableCell>
                      <TableCell>{a.hours_worked ? Number(a.hours_worked).toFixed(2) : "—"}</TableCell>
                      <TableCell>{a.check_in_lat ? <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" /> {t("modules.hr.clockIn.geoYes")}</Badge> : "—"}</TableCell>
                    </TableRow>
                  ))}
                  {attendance.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">{t("modules.hr.clockIn.empty")}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="vacaciones" className="space-y-3">
            <div className="flex justify-end"><Button size="sm" onClick={() => setOpenLeave(true)} className="gap-1 gradient-brand text-primary-foreground"><Plus className="h-4 w-4" /> {t("modules.hr.leaves.newRequest")}</Button></div>
            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>{t("modules.hr.leaves.header.employee")}</TableHead><TableHead>{t("modules.hr.leaves.header.type")}</TableHead><TableHead>{t("modules.hr.leaves.header.from")}</TableHead><TableHead>{t("modules.hr.leaves.header.to")}</TableHead><TableHead>{t("modules.hr.leaves.header.days")}</TableHead><TableHead>{t("modules.hr.leaves.header.status")}</TableHead><TableHead className="text-right">{t("modules.hr.leaves.header.actions")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {leaves.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{empName(l.employee_id)}</TableCell>
                      <TableCell><Badge variant="outline">{leaveTypeLabel(l.leave_type)}</Badge></TableCell>
                      <TableCell>{format(new Date(l.start_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{format(new Date(l.end_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{l.days}</TableCell>
                      <TableCell><Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"}>{leaveStatusLabel(l.status)}</Badge></TableCell>
                      <TableCell className="text-right">
                        {l.status === "pending" && <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => approveLeave(l.id, true)}><CheckCircle2 className="h-3.5 w-3.5 text-success" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => approveLeave(l.id, false)}><XCircle className="h-3.5 w-3.5 text-destructive" /></Button>
                        </div>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {leaves.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">{t("modules.hr.leaves.empty")}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="payroll" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 flex-1 min-w-[280px]">
                <div className="col-span-2 md:col-span-1">
                  <Label className="text-[11px]">Buscar</Label>
                  <Input className="h-9" placeholder="Trabajador o comprobante" value={payFilters.q}
                    onChange={(e) => { setPayPage(1); setPayFilters({ ...payFilters, q: e.target.value }); }} />
                </div>
                <div>
                  <Label className="text-[11px]">Estado</Label>
                  <Select value={payFilters.status} onValueChange={(v) => { setPayPage(1); setPayFilters({ ...payFilters, status: v }); }}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="pending">Generadas</SelectItem>
                      <SelectItem value="approved">Aprobadas</SelectItem>
                      <SelectItem value="paid">Pagadas</SelectItem>
                      <SelectItem value="cancelled">Anuladas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px]">Trabajador</Label>
                  <Select value={payFilters.employee} onValueChange={(v) => { setPayPage(1); setPayFilters({ ...payFilters, employee: v }); }}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[11px]">Desde</Label>
                  <Input className="h-9" type="date" value={payFilters.from}
                    onChange={(e) => { setPayPage(1); setPayFilters({ ...payFilters, from: e.target.value }); }} />
                </div>
                <div>
                  <Label className="text-[11px]">Hasta</Label>
                  <Input className="h-9" type="date" value={payFilters.to}
                    onChange={(e) => { setPayPage(1); setPayFilters({ ...payFilters, to: e.target.value }); }} />
                </div>
              </div>
              <div className="flex gap-2">
                <PayrollBatchDialog tenantId={tenantId} defaultBonus={hrSettings.default_bonus} defaultDeductions={hrSettings.default_deductions} onDone={load} />
                <Button onClick={openPayDialog} className="gradient-brand text-primary-foreground gap-1"><Plus className="h-4 w-4" />{t("modules.hr.payroll.generate")}</Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>{filteredPayrolls.length} nómina(s)</span>
              <span>Neto filtrado: <b className="text-foreground tabular-nums">${filteredNet.toFixed(2)}</b></span>
              <span>Pendientes de aprobar: <b className="text-foreground">{filteredPayrolls.filter((p) => p.status === "pending").length}</b></span>
              <span>Aprobadas sin pagar: <b className="text-foreground">{filteredPayrolls.filter((p) => p.status === "approved").length}</b></span>
            </div>

            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("modules.hr.payroll.header.employee")}</TableHead>
                    <TableHead>{t("modules.hr.payroll.header.position")}</TableHead>
                    <TableHead>{t("modules.hr.payroll.header.period")}</TableHead>
                    <TableHead className="text-right">{t("modules.hr.payroll.header.hours")}</TableHead>
                    <TableHead className="text-right">{t("modules.hr.payroll.header.base")}</TableHead>
                    <TableHead className="text-right">{t("modules.hr.payroll.header.bonus")}</TableHead>
                    <TableHead className="text-right">{t("modules.hr.payroll.header.deductions")}</TableHead>
                    <TableHead className="text-right">{t("modules.hr.payroll.header.net")}</TableHead>
                    <TableHead>{t("modules.hr.payroll.header.ap")}</TableHead>
                    <TableHead>{t("modules.hr.payroll.header.status")}</TableHead>
                    <TableHead className="text-right">{t("modules.hr.payroll.header.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedPayrolls.map((p) => {
                    const ap = apFor.get(p.id);
                    return (
                      <TableRow key={p.id} className="cursor-pointer" onClick={() => setDetailPayroll(p)}>
                        <TableCell className="font-medium">
                          {p.employees?.name}
                          {signedIds.has(p.id) && <PenLine className="inline h-3 w-3 ml-1.5 text-emerald-500" />}
                          {p.receipt_number && <span className="block text-[10px] text-muted-foreground">Nº {p.receipt_number}</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.employees?.position || "—"}</TableCell>
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
                              {ap.status === "paid" ? t("modules.hr.payroll.apPaid") : ap.status === "cancelled" ? t("modules.hr.payroll.apCancelled") : `${t("modules.hr.payroll.apDueAt")} ${ap.due_date || "—"}`}
                            </Badge>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.status === "paid" ? "default" : p.status === "approved" ? "outline" : p.status === "cancelled" ? "destructive" : "secondary"}>
                            {PAYROLL_STATUS_LABEL[p.status] || p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <PayrollActionsMenu
                            payroll={p}
                            tenantName={tenantName}
                            requireApproval={hrSettings.require_payroll_approval}
                            signed={signedIds.has(p.id)}
                            onDetail={setDetailPayroll}
                            onEdit={(row) => setEditPayroll(row as EditablePayroll)}
                            onSign={setSignPayroll}
                            onRefresh={load}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredPayrolls.length === 0 && <TableRow><TableCell colSpan={11} className="text-center text-sm text-muted-foreground py-8">{t("modules.hr.payroll.empty")}</TableCell></TableRow>}
                </TableBody>
              </Table>
              <TablePagination
                page={payPage}
                pageSize={payPageSize}
                total={filteredPayrolls.length}
                onPageChange={setPayPage}
                onPageSizeChange={setPayPageSize}
              />
            </CardContent></Card>
          </TabsContent>



          <TabsContent value="positions" className="space-y-3">
            <div className="flex justify-end">
              <Button onClick={openPosNew} className="gradient-brand text-primary-foreground gap-1"><Plus className="h-4 w-4" />{t("modules.hr.positions.newBtn")}</Button>
            </div>
            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t("modules.hr.positions.header.code")}</TableHead><TableHead>{t("modules.hr.positions.header.name")}</TableHead><TableHead>{t("modules.hr.positions.header.dept")}</TableHead>
                  <TableHead>{t("modules.hr.positions.header.level")}</TableHead><TableHead className="text-right">{t("modules.hr.positions.header.base")}</TableHead>
                  <TableHead className="text-right">{t("modules.hr.positions.header.range")}</TableHead><TableHead>{t("modules.hr.positions.header.status")}</TableHead><TableHead className="text-right">{t("modules.hr.positions.header.actions")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {positions.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.code}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.department || "—"}</TableCell>
                      <TableCell>{p.level ? <Badge variant="outline">{tx(`modules.hr.positions.levels.${p.level}`, p.level)}</Badge> : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">${Number(p.base_salary).toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                        {p.min_salary || p.max_salary ? `$${Number(p.min_salary).toFixed(0)} – $${Number(p.max_salary).toFixed(0)}` : "—"}
                      </TableCell>
                      <TableCell><Badge variant={p.is_active ? "default" : "secondary"} className="cursor-pointer" onClick={() => togglePos(p)}>{p.is_active ? t("common.active") : t("common.inactive")}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" onClick={() => openPosEdit(p)}><Edit2 className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => deletePos(p.id)} className="text-destructive"><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {positions.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">{t("modules.hr.positions.empty")}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="contratos" className="space-y-3">
            <div className="flex justify-end"><Button size="sm" onClick={() => setOpenContract(true)} className="gap-1 gradient-brand text-primary-foreground"><Plus className="h-4 w-4" /> {t("modules.hr.contracts.newBtn")}</Button></div>
            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>{t("modules.hr.contracts.header.employee")}</TableHead><TableHead>{t("modules.hr.contracts.header.type")}</TableHead><TableHead>{t("modules.hr.contracts.header.start")}</TableHead><TableHead>{t("modules.hr.contracts.header.end")}</TableHead><TableHead className="text-right">{t("modules.hr.contracts.header.baseSalary")}</TableHead><TableHead>{t("modules.hr.contracts.header.status")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {contracts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{empName(c.employee_id)}</TableCell>
                      <TableCell><Badge variant="outline">{contractTypeLabel(c.contract_type)}</Badge></TableCell>
                      <TableCell>{format(new Date(c.start_date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{c.end_date ? format(new Date(c.end_date), "dd/MM/yyyy") : "—"}</TableCell>
                      <TableCell className="text-right font-mono">{Number(c.base_salary).toFixed(2)}</TableCell>
                      <TableCell><Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status === "active" ? t("common.active") : c.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {contracts.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">{t("modules.hr.contracts.empty")}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="schedules" className="space-y-3">
            <div className="flex justify-end">
              <Button onClick={() => setSchedDialog(true)} className="gradient-brand text-primary-foreground gap-1"><Plus className="h-4 w-4" />{t("modules.hr.schedules.newBtn")}</Button>
            </div>
            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>{t("modules.hr.schedules.header.employee")}</TableHead><TableHead>{t("modules.hr.schedules.header.day")}</TableHead><TableHead>{t("modules.hr.schedules.header.start")}</TableHead><TableHead>{t("modules.hr.schedules.header.end")}</TableHead><TableHead className="text-right">{t("modules.hr.schedules.header.actions")}</TableHead></TableRow></TableHeader>
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
                  {schedules.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">{t("modules.hr.schedules.empty")}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="overtime" className="space-y-3">
            <div className="flex justify-end"><Button size="sm" onClick={() => setOpenOvertime(true)} className="gap-1 gradient-brand text-primary-foreground"><Plus className="h-4 w-4" /> {t("modules.hr.overtime.registerBtn")}</Button></div>
            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>{t("modules.hr.overtime.header.employee")}</TableHead><TableHead>{t("modules.hr.overtime.header.date")}</TableHead><TableHead>{t("modules.hr.overtime.header.hours")}</TableHead><TableHead>{t("modules.hr.overtime.header.factor")}</TableHead><TableHead>{t("modules.hr.overtime.header.status")}</TableHead></TableRow></TableHeader>
                <TableBody>
                  {overtime.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>{empName(o.employee_id)}</TableCell>
                      <TableCell>{format(new Date(o.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell>{Number(o.hours).toFixed(2)}</TableCell>
                      <TableCell>x{Number(o.pay_factor).toFixed(2)}</TableCell>
                      <TableCell><Badge variant={o.status === "approved" || o.status === "paid" ? "default" : "secondary"}>{otStatusLabel(o.status)}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {overtime.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">{t("modules.hr.overtime.empty")}</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>

        {/* Schedule dialog */}
        <Dialog open={schedDialog} onOpenChange={setSchedDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("modules.hr.schedules.dialog.title")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{t("modules.hr.schedules.dialog.employee")}</Label>
                <Select value={schedForm.employee_id} onValueChange={(v) => setSchedForm({ ...schedForm, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t("modules.hr.schedules.dialog.selectEmployee")} /></SelectTrigger>
                  <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("modules.hr.schedules.dialog.dayOfWeek")}</Label>
                <Select value={schedForm.day_of_week} onValueChange={(v) => setSchedForm({ ...schedForm, day_of_week: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{t("modules.hr.schedules.dialog.startTime")}</Label><Input type="time" value={schedForm.start_time} onChange={(e) => setSchedForm({ ...schedForm, start_time: e.target.value })} /></div>
                <div><Label>{t("modules.hr.schedules.dialog.endTime")}</Label><Input type="time" value={schedForm.end_time} onChange={(e) => setSchedForm({ ...schedForm, end_time: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter><Button onClick={saveSchedule} className="gradient-brand text-primary-foreground">{t("modules.hr.schedules.dialog.save")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Position dialog */}
        <Dialog open={posDialog} onOpenChange={setPosDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editPos ? t("modules.hr.positions.dialog.titleEdit") : t("modules.hr.positions.dialog.titleNew")}</DialogTitle>
              <DialogDescription>{t("modules.hr.positions.dialog.desc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{t("modules.hr.positions.dialog.code")}</Label><Input value={posForm.code} onChange={(e) => setPosForm({ ...posForm, code: e.target.value })} placeholder="ADM-01" /></div>
                <div><Label>{t("modules.hr.positions.dialog.level")}</Label>
                  <Select value={posForm.level || "__none__"} onValueChange={(v) => setPosForm({ ...posForm, level: v === "__none__" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder={t("modules.hr.positions.dialog.selectLevel")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t("modules.hr.positions.levels.none")}</SelectItem>
                      {(hrSettings.levels?.length ? hrSettings.levels : HR_DEFAULTS.levels).map((lv) => (
                        <SelectItem key={lv} value={lv}>{lv}</SelectItem>
                      ))}
                    </SelectContent>

                  </Select>
                </div>
              </div>
              <div><Label>{t("modules.hr.positions.dialog.name")}</Label><Input value={posForm.name} onChange={(e) => setPosForm({ ...posForm, name: e.target.value })} /></div>
              <div><Label>{t("modules.hr.positions.dialog.dept")}</Label><Input value={posForm.department} onChange={(e) => setPosForm({ ...posForm, department: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>{t("modules.hr.positions.dialog.baseSalary")}</Label><Input type="number" value={posForm.base_salary} onChange={(e) => setPosForm({ ...posForm, base_salary: e.target.value })} /></div>
                <div><Label>{t("modules.hr.positions.dialog.minSalary")}</Label><Input type="number" value={posForm.min_salary} onChange={(e) => setPosForm({ ...posForm, min_salary: e.target.value })} /></div>
                <div><Label>{t("modules.hr.positions.dialog.maxSalary")}</Label><Input type="number" value={posForm.max_salary} onChange={(e) => setPosForm({ ...posForm, max_salary: e.target.value })} /></div>
              </div>
              <div><Label>{t("modules.hr.positions.dialog.description")}</Label><Textarea rows={3} value={posForm.description} onChange={(e) => setPosForm({ ...posForm, description: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPosDialog(false)}>{t("modules.hr.positions.dialog.cancel")}</Button>
              <Button onClick={savePosition} className="gradient-brand text-primary-foreground">{t("modules.hr.positions.dialog.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Payroll dialog */}
        <Dialog open={payDialog} onOpenChange={setPayDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("modules.hr.payroll.dialog.title")}</DialogTitle>
              <DialogDescription>{t("modules.hr.payroll.dialog.desc")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div><Label>{t("modules.hr.payroll.dialog.employee")}</Label>
                <Select value={payForm.employee_id} onValueChange={(v) => { setPreview(null); setPayForm({ ...payForm, employee_id: v }); }}>
                  <SelectTrigger><SelectValue placeholder={t("modules.hr.payroll.dialog.selectEmployee")} /></SelectTrigger>
                  <SelectContent>{employees.map((e) => (
                    <SelectItem key={e.id} value={e.id} disabled={!e.position_id}>
                      {e.name}{e.position ? ` · ${e.position}` : ` · ${t("modules.hr.payroll.dialog.noPos")}`}
                    </SelectItem>
                  ))}</SelectContent>
                </Select>
                {employees.length > 0 && empWithoutPos > 0 && (
                  <p className="text-[11px] text-warning mt-1">{t("modules.hr.payroll.dialog.warnNoPos")}</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{t("modules.hr.payroll.dialog.from")}</Label><Input type="date" value={payForm.period_start} onChange={(e) => { setPreview(null); setPayForm({ ...payForm, period_start: e.target.value }); }} /></div>
                <div><Label>{t("modules.hr.payroll.dialog.to")}</Label><Input type="date" value={payForm.period_end} onChange={(e) => { setPreview(null); setPayForm({ ...payForm, period_end: e.target.value }); }} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t("modules.hr.payroll.dialog.bonus")}</Label>
                  <Input type="number" value={payForm.bonus} onChange={(e) => { setPreview(null); setPayForm({ ...payForm, bonus: e.target.value }); }} />
                  <p className="text-[10px] text-muted-foreground mt-1">{t("modules.hr.payroll.dialog.bonusHint")}</p>
                </div>
                <div>
                  <Label>{t("modules.hr.payroll.dialog.deductions")}</Label>
                  <Input type="number" value={payForm.deductions} onChange={(e) => { setPreview(null); setPayForm({ ...payForm, deductions: e.target.value }); }} />
                  <p className="text-[10px] text-muted-foreground mt-1">{t("modules.hr.payroll.dialog.deductionsHint")}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={computePreview} disabled={computing} className="w-full">
                {computing ? t("modules.hr.payroll.dialog.computing") : t("modules.hr.payroll.dialog.compute")}
              </Button>
              {preview && (
                <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1.5">
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("modules.hr.payroll.dialog.hoursWorked")}</span><span className="tabular-nums">{preview.hours.toFixed(2)} h</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("modules.hr.payroll.dialog.baseSalaryPeriod")}</span><span className="tabular-nums">${preview.base.toFixed(2)}</span></div>
                  <div className="flex justify-between text-success"><span>{t("modules.hr.payroll.dialog.plusBonus")}</span><span className="tabular-nums">${preview.bonus.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="font-medium">{t("modules.hr.payroll.dialog.gross")}</span><span className="tabular-nums font-medium">${preview.gross.toFixed(2)}</span></div>
                  <div className="flex justify-between text-destructive"><span>{t("modules.hr.payroll.dialog.minusDed")}</span><span className="tabular-nums">${preview.ded.toFixed(2)}</span></div>
                  <div className="flex justify-between border-t pt-1.5 mt-1.5">
                    <span className="font-bold">{t("modules.hr.payroll.dialog.netToPay")}</span>
                    <span className="tabular-nums font-bold text-lg">${preview.net.toFixed(2)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground pt-1">
                    {t("modules.hr.payroll.dialog.willCreateAP", { date: format(addDays(new Date(payForm.period_end), 5), "dd/MM/yyyy") })}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayDialog(false)}>{t("modules.hr.payroll.dialog.cancel")}</Button>
              <Button onClick={savePayroll} disabled={!preview} className="gradient-brand text-primary-foreground">{t("modules.hr.payroll.dialog.save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Leave dialog */}
        <Dialog open={openLeave} onOpenChange={setOpenLeave}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("modules.hr.leaves.dialogTitle")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{t("modules.hr.leaves.header.employee")}</Label>
                <Select value={leaveForm.employee_id} onValueChange={(v) => setLeaveForm({ ...leaveForm, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t("modules.hr.clockIn.selectPlaceholder")} /></SelectTrigger>
                  <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("modules.hr.leaves.header.type")}</Label>
                <Select value={leaveForm.leave_type} onValueChange={(v) => setLeaveForm({ ...leaveForm, leave_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["vacation","sick","personal","maternity","paternity","unpaid","other"].map(k =>
                      <SelectItem key={k} value={k}>{t(`modules.hr.leaves.types.${k}`)}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{t("modules.hr.leaves.header.from")}</Label><Input type="date" value={leaveForm.start_date} onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })} /></div>
                <div><Label>{t("modules.hr.leaves.header.to")}</Label><Input type="date" value={leaveForm.end_date} onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })} /></div>
              </div>
              <div><Label>{t("modules.hr.leaves.reason")}</Label><Textarea value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpenLeave(false)}>{t("common.cancel")}</Button><Button onClick={createLeave} className="gradient-brand text-primary-foreground">{t("modules.hr.leaves.submit")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Contract dialog */}
        <Dialog open={openContract} onOpenChange={setOpenContract}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("modules.hr.contracts.dialog.title")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{t("modules.hr.contracts.dialog.employee")}</Label>
                <Select value={contractForm.employee_id} onValueChange={(v) => setContractForm({ ...contractForm, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t("modules.hr.clockIn.selectPlaceholder")} /></SelectTrigger>
                  <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("modules.hr.contracts.dialog.type")}</Label>
                <Select value={contractForm.contract_type} onValueChange={(v) => setContractForm({ ...contractForm, contract_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["indefinite","fixed","temporary","part_time","internship","freelance"].map(k =>
                      <SelectItem key={k} value={k}>{t(`modules.hr.contracts.types.${k}`)}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{t("modules.hr.contracts.dialog.start")}</Label><Input type="date" value={contractForm.start_date} onChange={(e) => setContractForm({ ...contractForm, start_date: e.target.value })} /></div>
                <div><Label>{t("modules.hr.contracts.dialog.end")}</Label><Input type="date" value={contractForm.end_date} onChange={(e) => setContractForm({ ...contractForm, end_date: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{t("modules.hr.contracts.dialog.baseSalary")}</Label><Input type="number" step="0.01" value={contractForm.base_salary} onChange={(e) => setContractForm({ ...contractForm, base_salary: e.target.value })} /></div>
                <div><Label>{t("modules.hr.contracts.dialog.weeklyHours")}</Label><Input type="number" value={contractForm.weekly_hours} onChange={(e) => setContractForm({ ...contractForm, weekly_hours: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpenContract(false)}>{t("modules.hr.contracts.dialog.cancel")}</Button><Button onClick={createContract} className="gradient-brand text-primary-foreground">{t("modules.hr.contracts.dialog.create")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Overtime dialog */}
        <Dialog open={openOvertime} onOpenChange={setOpenOvertime}>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("modules.hr.overtime.dialog.title")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>{t("modules.hr.overtime.dialog.employee")}</Label>
                <Select value={otForm.employee_id} onValueChange={(v) => setOtForm({ ...otForm, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t("modules.hr.overtime.dialog.selectEmployee")} /></SelectTrigger>
                  <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>{t("modules.hr.overtime.dialog.date")}</Label><Input type="date" value={otForm.date} onChange={(e) => setOtForm({ ...otForm, date: e.target.value })} /></div>
                <div><Label>{t("modules.hr.overtime.dialog.hours")}</Label><Input type="number" step="0.25" value={otForm.hours} onChange={(e) => setOtForm({ ...otForm, hours: e.target.value })} /></div>
                <div><Label>{t("modules.hr.overtime.dialog.factor")}</Label><Input type="number" step="0.1" value={otForm.pay_factor} onChange={(e) => setOtForm({ ...otForm, pay_factor: e.target.value })} /></div>
              </div>
              <div><Label>{t("modules.hr.overtime.dialog.reason")}</Label><Textarea value={otForm.reason} onChange={(e) => setOtForm({ ...otForm, reason: e.target.value })} /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpenOvertime(false)}>{t("modules.hr.overtime.dialog.cancel")}</Button><Button onClick={createOvertime} className="gradient-brand text-primary-foreground">{t("modules.hr.overtime.dialog.register")}</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <PayrollEditDialog payroll={editPayroll} onOpenChange={(o) => { if (!o) setEditPayroll(null); }} onSaved={load} />
      </div>

    </AppLayout>
  );
}
