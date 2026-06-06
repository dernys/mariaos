import { AppLayout } from "@/components/AppLayout";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Edit2, Trash2, BookOpen, ArrowUpDown, TrendingUp, TrendingDown, DollarSign, Lock, Unlock, Download, Undo2, FolderTree, CalendarClock, FileType, Building2, Wallet } from "lucide-react";
import { format } from "date-fns";
import { AccountingReports } from "@/components/accounting/AccountingReports";
import { CostCentersTab } from "@/components/accounting/CostCentersTab";
import { BudgetsTab } from "@/components/accounting/BudgetsTab";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  nature: string;
  balance: number;
  is_active: boolean;
  is_postable: boolean;
  parent_id: string | null;
  level: number;
}
interface JournalEntry {
  id: string;
  entry_number: string;
  date: string;
  description: string | null;
  status: string;
  series: string | null;
  period_id: string | null;
  reversed_by: string | null;
  reverses: string | null;
}
interface EntryLine { id: string; account_id: string; debit: number; credit: number; description: string | null; }
interface FiscalYear { id: string; year: number; name: string; start_date: string; end_date: string; status: string; is_current: boolean; }
interface Period { id: string; fiscal_year_id: string; period_number: number; name: string; start_date: string; end_date: string; status: string; }

const ACCOUNT_TYPES = [
  { value: "asset", label: "Activo", color: "text-primary" },
  { value: "liability", label: "Pasivo", color: "text-destructive" },
  { value: "equity", label: "Capital", color: "text-muted-foreground" },
  { value: "income", label: "Ingreso", color: "text-success" },
  { value: "expense", label: "Gasto", color: "text-warning" },
];

const typeLabel = (t: string) => ACCOUNT_TYPES.find((a) => a.value === t)?.label || t;
const typeColor = (t: string) => ACCOUNT_TYPES.find((a) => a.value === t)?.color || "";

const Contabilidad = () => {
  const { user } = useAuth();
  const tenantId = useTenant();
  const { toast } = useToast();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);

  // Account dialog
  const [accDialogOpen, setAccDialogOpen] = useState(false);
  const [editingAcc, setEditingAcc] = useState<Account | null>(null);
  const [accForm, setAccForm] = useState({ code: "", name: "", type: "asset", nature: "debit", is_postable: true, parent_id: "" as string });

  // Entry dialog
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryForm, setEntryForm] = useState({ description: "", date: new Date().toISOString().slice(0, 10), series: "GEN", post: true });
  const [entryLines, setEntryLines] = useState<{ account_id: string; debit: string; credit: string; description: string }[]>([
    { account_id: "", debit: "", credit: "", description: "" },
    { account_id: "", debit: "", credit: "", description: "" },
  ]);

  // Detail / FY dialogs
  const [detailEntry, setDetailEntry] = useState<JournalEntry | null>(null);
  const [detailLines, setDetailLines] = useState<EntryLine[]>([]);
  const [fyDialogOpen, setFyDialogOpen] = useState(false);
  const [fyForm, setFyForm] = useState({ year: new Date().getFullYear(), start_month: 1 });
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateChoice, setTemplateChoice] = useState("es_pgc");

  const fetchData = async () => {
    if (!tenantId) return;
    const [accRes, entRes, fyRes, pRes] = await Promise.all([
      supabase.from("accounting_accounts").select("*").order("code"),
      supabase.from("journal_entries").select("*").order("date", { ascending: false }).limit(200),
      supabase.from("fiscal_years").select("*").order("year", { ascending: false }),
      supabase.from("accounting_periods").select("*").order("start_date"),
    ]);
    if (accRes.data) setAccounts(accRes.data as Account[]);
    if (entRes.data) setEntries(entRes.data as JournalEntry[]);
    if (fyRes.data) setFiscalYears(fyRes.data as FiscalYear[]);
    if (pRes.data) setPeriods(pRes.data as Period[]);
  };

  useEffect(() => { fetchData(); }, [tenantId]);

  // ---- Accounts ----
  const postableAccounts = accounts.filter((a) => a.is_postable);
  const accountsByParent = useMemo(() => {
    const map = new Map<string | null, Account[]>();
    accounts.forEach((a) => {
      const k = a.parent_id || null;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(a);
    });
    return map;
  }, [accounts]);

  const openNewAcc = (parent?: Account) => {
    setEditingAcc(null);
    setAccForm({
      code: parent ? parent.code : "",
      name: "", type: parent?.type || "asset",
      nature: parent?.nature || "debit",
      is_postable: true,
      parent_id: parent?.id || "",
    });
    setAccDialogOpen(true);
  };
  const openEditAcc = (a: Account) => {
    setEditingAcc(a);
    setAccForm({ code: a.code, name: a.name, type: a.type, nature: a.nature || "debit", is_postable: a.is_postable, parent_id: a.parent_id || "" });
    setAccDialogOpen(true);
  };

  const saveAccount = async () => {
    if (!accForm.code.trim() || !accForm.name.trim()) {
      toast({ title: "Error", description: "Código y nombre requeridos", variant: "destructive" }); return;
    }
    const parent = accForm.parent_id ? accounts.find((a) => a.id === accForm.parent_id) : null;
    const payload: any = {
      code: accForm.code.trim(), name: accForm.name.trim(), type: accForm.type,
      nature: accForm.nature, is_postable: accForm.is_postable,
      parent_id: accForm.parent_id || null,
      level: parent ? parent.level + 1 : 1,
      tenant_id: tenantId,
    };
    const { error } = editingAcc
      ? await supabase.from("accounting_accounts").update(payload).eq("id", editingAcc.id)
      : await supabase.from("accounting_accounts").insert(payload);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: editingAcc ? "Cuenta actualizada" : "Cuenta creada" });
    setAccDialogOpen(false);
    fetchData();
  };

  const deleteAccount = async (id: string) => {
    const { error } = await supabase.from("accounting_accounts").delete().eq("id", id);
    if (error) { toast({ title: "No se puede eliminar", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Cuenta eliminada" });
    fetchData();
  };

  // ---- Entries ----
  const openNewEntry = () => {
    setEntryForm({ description: "", date: new Date().toISOString().slice(0, 10), series: "GEN", post: true });
    setEntryLines([
      { account_id: "", debit: "", credit: "", description: "" },
      { account_id: "", debit: "", credit: "", description: "" },
    ]);
    setEntryDialogOpen(true);
  };

  const addLine = () => setEntryLines([...entryLines, { account_id: "", debit: "", credit: "", description: "" }]);
  const removeLine = (idx: number) => setEntryLines(entryLines.filter((_, i) => i !== idx));
  const updateLine = (idx: number, field: string, value: string) => {
    const updated = [...entryLines];
    updated[idx] = { ...updated[idx], [field]: value };
    setEntryLines(updated);
  };

  const totalDebits = entryLines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredits = entryLines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  const periodForDate = (d: string) => periods.find((p) => d >= p.start_date && d <= p.end_date) || null;
  const fyForPeriod = (pid: string | null) => {
    if (!pid) return null;
    const p = periods.find((x) => x.id === pid);
    return p ? fiscalYears.find((f) => f.id === p.fiscal_year_id) : null;
  };

  const saveEntry = async () => {
    if (!isBalanced || totalDebits === 0) {
      toast({ title: "Error", description: "Los débitos y créditos deben ser iguales y > 0", variant: "destructive" }); return;
    }
    const period = periodForDate(entryForm.date);
    if (!period) {
      toast({ title: "Sin período", description: "Crea un ejercicio fiscal que cubra esta fecha", variant: "destructive" }); return;
    }
    if (period.status !== "open") {
      toast({ title: "Período cerrado", description: `"${period.name}" está ${period.status}`, variant: "destructive" }); return;
    }

    const entryNumber = `${entryForm.series}-${Date.now().toString(36).toUpperCase()}`;
    const { data: entry, error } = await supabase.from("journal_entries").insert({
      entry_number: entryNumber,
      date: entryForm.date,
      description: entryForm.description || null,
      status: "draft",
      series: entryForm.series,
      period_id: period.id,
      fiscal_year_id: period.fiscal_year_id,
      tenant_id: tenantId,
      created_by: user?.id,
    } as any).select("id").single();

    if (error || !entry) { toast({ title: "Error", description: error?.message || "Error creando asiento", variant: "destructive" }); return; }

    const lines = entryLines
      .filter((l) => l.account_id && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0))
      .map((l) => ({
        entry_id: entry.id,
        account_id: l.account_id,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        description: l.description || null,
      }));

    const { error: linesErr } = await supabase.from("journal_entry_lines").insert(lines);
    if (linesErr) { toast({ title: "Error en líneas", description: linesErr.message, variant: "destructive" }); return; }

    if (entryForm.post) {
      const { error: postErr } = await supabase.rpc("post_journal_entry", { p_entry_id: entry.id });
      if (postErr) {
        toast({ title: "No se posteó", description: postErr.message, variant: "destructive" });
      } else {
        // Update balances only on post
        for (const l of lines) {
          const acc = accounts.find((a) => a.id === l.account_id);
          if (acc) {
            const isDebitNature = (acc.nature || (acc.type === "asset" || acc.type === "expense" ? "debit" : "credit")) === "debit";
            const delta = isDebitNature ? l.debit - l.credit : l.credit - l.debit;
            await supabase.from("accounting_accounts").update({ balance: acc.balance + delta }).eq("id", acc.id);
          }
        }
        toast({ title: "Asiento registrado y posteado" });
      }
    } else {
      toast({ title: "Asiento guardado como borrador" });
    }
    setEntryDialogOpen(false);
    fetchData();
  };

  const postDraft = async (id: string) => {
    const { error } = await supabase.rpc("post_journal_entry", { p_entry_id: id });
    if (error) { toast({ title: "No se posteó", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Asiento posteado" });
    fetchData();
  };

  const reverseEntry = async (id: string) => {
    const reason = prompt("Motivo de la reversión (mín. 3 caracteres):");
    if (!reason || reason.trim().length < 3) return;
    const { error } = await supabase.rpc("reverse_journal_entry", { p_entry_id: id, p_reason: reason });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Asiento reversado" });
    fetchData();
  };

  const openEntryDetail = async (e: JournalEntry) => {
    setDetailEntry(e);
    const { data } = await supabase.from("journal_entry_lines").select("*").eq("entry_id", e.id);
    setDetailLines((data as EntryLine[]) || []);
  };

  const getAccountName = (id: string) => {
    const a = accounts.find((a) => a.id === id);
    return a ? `${a.code} - ${a.name}` : "—";
  };

  // ---- Fiscal Years ----
  const createFiscalYear = async () => {
    const { error } = await supabase.rpc("create_fiscal_year", {
      p_tenant_id: tenantId, p_year: fyForm.year, p_start_month: fyForm.start_month,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: `Ejercicio ${fyForm.year} creado con 12 períodos` });
    setFyDialogOpen(false);
    fetchData();
  };

  const togglePeriod = async (p: Period) => {
    const rpc = p.status === "open" ? "close_accounting_period" : "reopen_accounting_period";
    const { error } = await supabase.rpc(rpc, { p_period_id: p.id });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: p.status === "open" ? "Período cerrado" : "Período reabierto" });
    fetchData();
  };

  const importTemplate = async () => {
    const { data, error } = await supabase.rpc("import_chart_template", { p_tenant_id: tenantId, p_template: templateChoice });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await supabase.rpc("relink_chart_parents", { p_tenant_id: tenantId });
    toast({ title: `Plan importado`, description: `${data} cuentas agregadas` });
    setTemplateDialogOpen(false);
    fetchData();
  };

  // Summaries (cuentas imputables)
  const totalAssets = accounts.filter((a) => a.type === "asset" && a.is_postable).reduce((s, a) => s + Number(a.balance || 0), 0);
  const totalLiabilities = accounts.filter((a) => a.type === "liability" && a.is_postable).reduce((s, a) => s + Number(a.balance || 0), 0);
  const totalIncome = accounts.filter((a) => a.type === "income" && a.is_postable).reduce((s, a) => s + Number(a.balance || 0), 0);
  const totalExpenses = accounts.filter((a) => a.type === "expense" && a.is_postable).reduce((s, a) => s + Number(a.balance || 0), 0);

  // Render tree row
  const renderAccountRow = (a: Account, depth: number): JSX.Element[] => {
    const children = accountsByParent.get(a.id) || [];
    const rows: JSX.Element[] = [
      <TableRow key={a.id}>
        <TableCell className="text-xs font-heading font-semibold" style={{ paddingLeft: `${depth * 16 + 12}px` }}>
          {!a.is_postable && <FolderTree className="inline h-3 w-3 mr-1 text-muted-foreground" />}
          {a.code}
        </TableCell>
        <TableCell className="text-xs font-medium">{a.name}</TableCell>
        <TableCell><Badge variant="outline" className={`text-[10px] ${typeColor(a.type)}`}>{typeLabel(a.type)}</Badge></TableCell>
        <TableCell>
          <Badge variant={a.is_postable ? "default" : "secondary"} className="text-[10px]">
            {a.is_postable ? "Imputable" : "Grupo"}
          </Badge>
        </TableCell>
        <TableCell className="text-xs font-heading font-bold">{a.is_postable ? `$${Number(a.balance || 0).toLocaleString()}` : "—"}</TableCell>
        <TableCell>
          <div className="flex gap-1">
            {!a.is_postable && (
              <button onClick={() => openNewAcc(a)} className="p-1.5 rounded hover:bg-muted" title="Subcuenta">
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={() => openEditAcc(a)} className="p-1.5 rounded hover:bg-muted"><Edit2 className="h-3.5 w-3.5" /></button>
            <button onClick={() => deleteAccount(a.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </TableCell>
      </TableRow>,
    ];
    children.forEach((c) => rows.push(...renderAccountRow(c, depth + 1)));
    return rows;
  };

  const rootAccounts = accountsByParent.get(null) || [];

  return (
    <AppLayout title="Contabilidad">
      <div className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><DollarSign className="h-5 w-5 text-primary" /></div>
            <div><p className="text-[10px] text-muted-foreground">Activos</p><p className="font-heading font-bold text-lg">${totalAssets.toLocaleString()}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center"><ArrowUpDown className="h-5 w-5 text-destructive" /></div>
            <div><p className="text-[10px] text-muted-foreground">Pasivos</p><p className="font-heading font-bold text-lg">${totalLiabilities.toLocaleString()}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-success" /></div>
            <div><p className="text-[10px] text-muted-foreground">Ingresos</p><p className="font-heading font-bold text-lg">${totalIncome.toLocaleString()}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center"><TrendingDown className="h-5 w-5 text-warning" /></div>
            <div><p className="text-[10px] text-muted-foreground">Gastos</p><p className="font-heading font-bold text-lg">${totalExpenses.toLocaleString()}</p></div>
          </CardContent></Card>
        </div>

        <Tabs defaultValue="accounts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="accounts">Plan de Cuentas</TabsTrigger>
            <TabsTrigger value="entries">Asientos</TabsTrigger>
            <TabsTrigger value="periods">Ejercicios y Períodos</TabsTrigger>
            <TabsTrigger value="reports"><FileType className="h-3.5 w-3.5 mr-1" />Reportes</TabsTrigger>
          </TabsList>

          {/* Accounts */}
          <TabsContent value="accounts" className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">{accounts.length} cuentas · {postableAccounts.length} imputables</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setTemplateDialogOpen(true)} className="gap-1 text-xs">
                  <Download className="h-3.5 w-3.5" /> Importar Plantilla
                </Button>
                <Button size="sm" onClick={() => openNewAcc()} className="gap-1 text-xs gradient-brand text-primary-foreground">
                  <Plus className="h-3.5 w-3.5" /> Nueva Cuenta
                </Button>
              </div>
            </div>

            <div className="bg-card rounded-xl shadow-card border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Código</TableHead>
                    <TableHead className="text-xs">Nombre</TableHead>
                    <TableHead className="text-xs">Tipo</TableHead>
                    <TableHead className="text-xs">Naturaleza</TableHead>
                    <TableHead className="text-xs">Saldo</TableHead>
                    <TableHead className="text-xs w-28">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rootAccounts.flatMap((a) => renderAccountRow(a, 0))}
                  {accounts.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-xs">
                      <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      No hay cuentas. Importa una plantilla para empezar.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Entries */}
          <TabsContent value="entries" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{entries.length} asientos</p>
              <Button size="sm" onClick={openNewEntry} disabled={postableAccounts.length === 0 || periods.length === 0} className="gap-1 text-xs gradient-brand text-primary-foreground">
                <Plus className="h-3.5 w-3.5" /> Nuevo Asiento
              </Button>
            </div>
            {periods.length === 0 && (
              <Card className="border-warning/30 bg-warning/5"><CardContent className="p-3 text-xs">
                Crea primero un ejercicio fiscal en la pestaña <strong>Ejercicios y Períodos</strong>.
              </CardContent></Card>
            )}

            <div className="bg-card rounded-xl shadow-card border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Número</TableHead>
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs">Descripción</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                    <TableHead className="text-xs w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.id} className="cursor-pointer hover:bg-muted/20">
                      <TableCell className="text-xs font-heading font-semibold" onClick={() => openEntryDetail(e)}>{e.entry_number}</TableCell>
                      <TableCell className="text-xs text-muted-foreground" onClick={() => openEntryDetail(e)}>{format(new Date(e.date), "dd/MM/yyyy")}</TableCell>
                      <TableCell className="text-xs" onClick={() => openEntryDetail(e)}>
                        {e.description || "—"}
                        {e.reverses && <Badge variant="outline" className="ml-2 text-[9px]">Reversión</Badge>}
                        {e.reversed_by && <Badge variant="destructive" className="ml-2 text-[9px]">Anulado</Badge>}
                      </TableCell>
                      <TableCell onClick={() => openEntryDetail(e)}>
                        <Badge variant={e.status === "posted" ? "default" : "secondary"} className="text-[10px]">
                          {e.status === "posted" ? "Posteado" : e.status === "draft" ? "Borrador" : e.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {e.status === "draft" && (
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1" onClick={() => postDraft(e.id)}>
                              Postear
                            </Button>
                          )}
                          {e.status === "posted" && !e.reversed_by && !e.reverses && (
                            <button onClick={() => reverseEntry(e.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive" title="Reversar">
                              <Undo2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {entries.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-xs">Sin asientos contables</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Periods */}
          <TabsContent value="periods" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{fiscalYears.length} ejercicios · {periods.length} períodos</p>
              <Button size="sm" onClick={() => setFyDialogOpen(true)} className="gap-1 text-xs gradient-brand text-primary-foreground">
                <Plus className="h-3.5 w-3.5" /> Nuevo Ejercicio
              </Button>
            </div>

            {fiscalYears.map((fy) => {
              const fyPeriods = periods.filter((p) => p.fiscal_year_id === fy.id);
              return (
                <Card key={fy.id}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-primary" />
                        <span className="font-heading font-bold">{fy.name}</span>
                        {fy.is_current && <Badge className="text-[10px]">Actual</Badge>}
                        <Badge variant={fy.status === "open" ? "default" : "secondary"} className="text-[10px]">{fy.status}</Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(fy.start_date), "dd/MM/yyyy")} → {format(new Date(fy.end_date), "dd/MM/yyyy")}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                      {fyPeriods.map((p) => (
                        <div key={p.id} className="rounded-lg border p-2 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-medium capitalize">{p.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(p.start_date), "dd/MM")} - {format(new Date(p.end_date), "dd/MM")}
                            </p>
                          </div>
                          <button onClick={() => togglePeriod(p)} className="p-1.5 rounded hover:bg-muted" title={p.status === "open" ? "Cerrar" : "Reabrir"}>
                            {p.status === "open"
                              ? <Unlock className="h-3.5 w-3.5 text-success" />
                              : <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {fiscalYears.length === 0 && (
              <Card><CardContent className="p-8 text-center text-muted-foreground text-xs">
                <CalendarClock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                Crea tu primer ejercicio fiscal
              </CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <AccountingReports accounts={accounts as any} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Account Dialog */}
      <Dialog open={accDialogOpen} onOpenChange={setAccDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAcc ? "Editar" : "Nueva"} Cuenta</DialogTitle>
            <DialogDescription>Plan de cuentas jerárquico</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Código *</Label><Input value={accForm.code} onChange={(e) => setAccForm({ ...accForm, code: e.target.value })} placeholder="1100" /></div>
              <div>
                <Label>Tipo *</Label>
                <Select value={accForm.type} onValueChange={(v) => setAccForm({ ...accForm, type: v, nature: (v === "asset" || v === "expense") ? "debit" : "credit" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ACCOUNT_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Nombre *</Label><Input value={accForm.name} onChange={(e) => setAccForm({ ...accForm, name: e.target.value })} placeholder="Caja" /></div>
            <div>
              <Label>Cuenta padre (opcional)</Label>
              <Select value={accForm.parent_id || "none"} onValueChange={(v) => setAccForm({ ...accForm, parent_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Ninguna (raíz) —</SelectItem>
                  {accounts.filter((a) => !a.is_postable && a.id !== editingAcc?.id).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Cuenta imputable</Label>
                <p className="text-[10px] text-muted-foreground">Si está desactivada será un grupo y no aceptará asientos directos</p>
              </div>
              <Switch checked={accForm.is_postable} onCheckedChange={(v) => setAccForm({ ...accForm, is_postable: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveAccount} className="gradient-brand text-primary-foreground">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Import Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Importar plan contable</DialogTitle>
            <DialogDescription>Carga una plantilla predefinida</DialogDescription>
          </DialogHeader>
          <Select value={templateChoice} onValueChange={setTemplateChoice}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cu_onat">Cuba - ONAT (MIPYMES / TCP)</SelectItem>
              <SelectItem value="es_pgc">España - PGC PYMES</SelectItem>
              <SelectItem value="mx_sat">México - SAT</SelectItem>
              <SelectItem value="niif_generic">NIIF (genérico LATAM)</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={importTemplate} className="gradient-brand text-primary-foreground">Importar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fiscal Year Dialog */}
      <Dialog open={fyDialogOpen} onOpenChange={setFyDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo ejercicio fiscal</DialogTitle>
            <DialogDescription>Se crearán 12 períodos mensuales</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Año</Label><Input type="number" value={fyForm.year} onChange={(e) => setFyForm({ ...fyForm, year: parseInt(e.target.value) })} /></div>
            <div><Label>Mes inicio</Label><Input type="number" min={1} max={12} value={fyForm.start_month} onChange={(e) => setFyForm({ ...fyForm, start_month: parseInt(e.target.value) })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFyDialogOpen(false)}>Cancelar</Button>
            <Button onClick={createFiscalYear} className="gradient-brand text-primary-foreground">Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Entry Dialog */}
      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Asiento Contable</DialogTitle>
            <DialogDescription>Partida doble: débitos = créditos</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Fecha</Label><Input type="date" value={entryForm.date} onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })} /></div>
              <div><Label>Serie</Label><Input value={entryForm.series} onChange={(e) => setEntryForm({ ...entryForm, series: e.target.value.toUpperCase() })} placeholder="GEN" /></div>
              <div><Label>Descripción</Label><Input value={entryForm.description} onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })} /></div>
            </div>
            {(() => {
              const p = periodForDate(entryForm.date);
              return p
                ? <p className="text-[10px] text-muted-foreground">Período: <strong>{p.name}</strong> ({p.status})</p>
                : <p className="text-[10px] text-destructive">⚠ Sin período para esta fecha</p>;
            })()}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-heading font-semibold">Líneas</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine} className="text-xs gap-1"><Plus className="h-3 w-3" /> Línea</Button>
              </div>

              {entryLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 bg-muted/40 rounded-lg p-2 items-end">
                  <div className="col-span-5">
                    <Label className="text-[10px]">Cuenta (imputable)</Label>
                    <Select value={line.account_id} onValueChange={(v) => updateLine(idx, "account_id", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                      <SelectContent>
                        {postableAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">Débito</Label>
                    <Input type="number" className="h-8 text-xs" value={line.debit} onChange={(e) => updateLine(idx, "debit", e.target.value)} placeholder="0" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">Crédito</Label>
                    <Input type="number" className="h-8 text-xs" value={line.credit} onChange={(e) => updateLine(idx, "credit", e.target.value)} placeholder="0" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">Nota</Label>
                    <Input className="h-8 text-xs" value={line.description} onChange={(e) => updateLine(idx, "description", e.target.value)} />
                  </div>
                  <div className="col-span-1">
                    {entryLines.length > 2 && (
                      <button onClick={() => removeLine(idx)} className="p-1 text-destructive hover:bg-destructive/10 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex justify-between items-center text-xs bg-muted/60 rounded-lg p-3">
                <span>Débitos: <strong>${totalDebits.toLocaleString()}</strong></span>
                <span>Créditos: <strong>${totalCredits.toLocaleString()}</strong></span>
                <Badge variant={isBalanced ? "default" : "destructive"} className="text-[10px]">{isBalanced ? "Balanceado ✓" : "No balanceado"}</Badge>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>Postear al guardar</Label>
                  <p className="text-[10px] text-muted-foreground">Si está apagado se guarda como borrador</p>
                </div>
                <Switch checked={entryForm.post} onCheckedChange={(v) => setEntryForm({ ...entryForm, post: v })} />
              </div>
            </div>

            <Button onClick={saveEntry} disabled={!isBalanced || totalDebits === 0} className="w-full gradient-brand text-primary-foreground font-heading font-semibold">
              {entryForm.post ? "Registrar y Postear" : "Guardar Borrador"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Entry Detail Dialog */}
      <Dialog open={!!detailEntry} onOpenChange={() => setDetailEntry(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Asiento {detailEntry?.entry_number}</DialogTitle>
            <DialogDescription>
              {detailEntry?.description || "Sin descripción"} · {detailEntry?.date && format(new Date(detailEntry.date), "dd/MM/yyyy")}
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Cuenta</TableHead>
                <TableHead className="text-xs text-right">Débito</TableHead>
                <TableHead className="text-xs text-right">Crédito</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailLines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs">{getAccountName(l.account_id)}</TableCell>
                  <TableCell className="text-xs text-right font-heading font-semibold">{l.debit > 0 ? `$${l.debit.toLocaleString()}` : ""}</TableCell>
                  <TableCell className="text-xs text-right font-heading font-semibold">{l.credit > 0 ? `$${l.credit.toLocaleString()}` : ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Contabilidad;
