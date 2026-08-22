import { AppLayout } from "@/components/AppLayout";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableToolbar } from "@/components/data/TableToolbar";
import { TablePagination } from "@/components/data/TablePagination";
import { useTableState } from "@/hooks/useTableState";
import {
  Plus, Edit2, Trash2, BookOpen, ArrowUpDown, TrendingUp, TrendingDown, DollarSign,
  Lock, Unlock, Download, Undo2, FolderTree, CalendarClock, FileType, Building2,
  Wallet, ListTree, ClipboardList, BarChart3, Landmark, FileSpreadsheet,
} from "lucide-react";
import { format } from "date-fns";
import { AccountingReports } from "@/components/accounting/AccountingReports";
import { CostCentersTab } from "@/components/accounting/CostCentersTab";
import { BudgetsTab } from "@/components/accounting/BudgetsTab";
import CuTaxDeclarationsTab from "@/components/accounting/CuTaxDeclarationsTab";
import CuCostSheetsTab from "@/components/accounting/CuCostSheetsTab";
import { FinancialKpiPanel } from "@/components/accounting/FinancialKpiPanel";
import { AccountingAuditPanel } from "@/components/accounting/AccountingAuditPanel";
import { HistoricalCostsPanel } from "@/components/accounting/HistoricalCostsPanel";
import { FinancialExceptionsPanel } from "@/components/accounting/FinancialExceptionsPanel";
import { FinancialEngineConsole } from "@/components/accounting/FinancialEngineConsole";
import { AccountMappingTab } from "@/components/accounting/AccountMappingTab";
import { OperationReconciliationPanel } from "@/components/accounting/OperationReconciliationPanel";




interface Account {
  id: string; code: string; name: string; type: string; nature: string;
  balance: number; is_active: boolean; is_postable: boolean;
  parent_id: string | null; level: number;
}
interface JournalEntry {
  id: string; entry_number: string; date: string; description: string | null;
  status: string; series: string | null; period_id: string | null;
  reversed_by: string | null; reverses: string | null;
}
interface EntryLine { id: string; account_id: string; debit: number; credit: number; description: string | null; }
interface FiscalYear { id: string; year: number; name: string; start_date: string; end_date: string; status: string; is_current: boolean; }
interface Period { id: string; fiscal_year_id: string; period_number: number; name: string; start_date: string; end_date: string; status: string; }

const ACCOUNT_TYPE_VALUES = ["asset", "liability", "equity", "income", "expense"] as const;
const TYPE_COLOR: Record<string, string> = {
  asset: "text-primary",
  liability: "text-destructive",
  equity: "text-muted-foreground",
  income: "text-success",
  expense: "text-warning",
};

const SECTION_VALUES = [
  { value: "plan", icon: ListTree, subs: ["accounts", "mappings", "periods"] },
  { value: "operacion", icon: ClipboardList, subs: ["entries", "cost_centers", "budgets"] },
  { value: "analisis", icon: BarChart3, subs: ["reports"] },
  { value: "fiscal", icon: Landmark, subs: ["onat", "costos"] },
];

const Contabilidad = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const tenantId = useTenant();
  const { toast } = useToast();
  const { section: sectionParam } = useParams<{ section?: string }>();
  const navigate = useNavigate();

  const typeLabel = (type: string) => t(`modules.accounting.types.${type}`, { defaultValue: type });
  const sectionLabel = (v: string) => {
    if (v === "plan") return t("modules.accounting.sections.plan");
    if (v === "operacion") return t("modules.accounting.sections.operation");
    if (v === "analisis") return t("modules.accounting.sections.analysis");
    if (v === "fiscal") return "Fiscal";
    return v;
  };
  const periodStatusLabel = (s: string) => {
    const k = `modules.accounting.periods.statuses.${s}`;
    const v = t(k);
    return v === k ? s : v;
  };
  const entryStatusLabel = (s: string) => {
    const k = `modules.accounting.entries.statuses.${s}`;
    const v = t(k);
    return v === k ? s : v;
  };

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [fiscalYears, setFiscalYears] = useState<FiscalYear[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);

  const validSection = SECTION_VALUES.find((s) => s.value === sectionParam)?.value || "plan";
  const section = validSection;
  const setSection = (v: string) => navigate(`/contabilidad/${v}`);
  const [subTab, setSubTab] = useState(SECTION_VALUES.find((s) => s.value === validSection)!.subs[0]);

  const [accDialogOpen, setAccDialogOpen] = useState(false);
  const [editingAcc, setEditingAcc] = useState<Account | null>(null);
  const [accForm, setAccForm] = useState({ code: "", name: "", type: "asset", nature: "debit", is_postable: true, parent_id: "" as string });

  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryForm, setEntryForm] = useState({ description: "", date: new Date().toISOString().slice(0, 10), series: "GEN", post: true });
  const [entryLines, setEntryLines] = useState<{ account_id: string; debit: string; credit: string; description: string }[]>([
    { account_id: "", debit: "", credit: "", description: "" },
    { account_id: "", debit: "", credit: "", description: "" },
  ]);

  const [detailEntry, setDetailEntry] = useState<JournalEntry | null>(null);
  const [detailLines, setDetailLines] = useState<EntryLine[]>([]);
  const [fyDialogOpen, setFyDialogOpen] = useState(false);
  const [fyForm, setFyForm] = useState({ year: new Date().getFullYear(), start_month: 1 });
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateChoice, setTemplateChoice] = useState("cu_onat");

  const fetchData = async () => {
    if (!tenantId) return;
    const [accRes, entRes, fyRes, pRes] = await Promise.all([
      supabase.from("accounting_accounts").select("*").eq("tenant_id", tenantId).order("code"),
      supabase.from("journal_entries").select("*").eq("tenant_id", tenantId).order("date", { ascending: false }).limit(500),
      supabase.from("fiscal_years").select("*").eq("tenant_id", tenantId).order("year", { ascending: false }),
      supabase.from("accounting_periods").select("*").eq("tenant_id", tenantId).order("start_date"),
    ]);
    if (accRes.data) setAccounts(accRes.data as Account[]);
    if (entRes.data) setEntries(entRes.data as JournalEntry[]);
    if (fyRes.data) setFiscalYears(fyRes.data as FiscalYear[]);
    if (pRes.data) setPeriods(pRes.data as Period[]);
  };
  useEffect(() => { fetchData(); }, [tenantId]);

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

  const accountsTable = useTableState<Account>({
    data: accounts,
    searchKeys: ["code", "name"],
    initialPageSize: 25,
    filterFns: {
      type: (a, v) => a.type === v,
      postable: (a, v) => (v === "yes" ? a.is_postable : !a.is_postable),
      active: (a, v) => (v === "yes" ? a.is_active : !a.is_active),
    },

  });
  const accountsFiltered = !!accountsTable.search.trim() || Object.values(accountsTable.filters).some((v) => v && v !== "__all__");

  const [entryFrom, setEntryFrom] = useState("");
  const [entryTo, setEntryTo] = useState("");

  const entriesInRange = useMemo(
    () =>
      entries.filter((e) => {
        const d = (e.date || "").slice(0, 10);
        if (entryFrom && d < entryFrom) return false;
        if (entryTo && d > entryTo) return false;
        return true;
      }),
    [entries, entryFrom, entryTo],
  );

  const entriesTable = useTableState<JournalEntry>({
    data: entriesInRange,
    searchKeys: ["entry_number", "description", "series"],
    initialPageSize: 25,
    filterFns: {
      status: (e, v) => e.status === v,
      series: (e, v) => (e.series || "") === v,
      period: (e, v) => e.period_id === v,
    },
  });

  const entrySeriesOptions = useMemo(() => {
    const set = new Set(entries.map((e) => e.series).filter((s): s is string => !!s));
    return Array.from(set).sort().map((s) => ({ value: s, label: s }));
  }, [entries]);


  const openNewAcc = (parent?: Account) => {
    setEditingAcc(null);
    setAccForm({
      code: parent ? parent.code : "",
      name: "", type: parent?.type || "asset",
      nature: parent?.nature || "debit",
      is_postable: true, parent_id: parent?.id || "",
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
      toast({ title: t("common.error"), description: t("modules.accounting.toasts.codeNameRequired"), variant: "destructive" }); return;
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
    if (error) { toast({ title: t("common.error"), description: error.message, variant: "destructive" }); return; }
    toast({ title: editingAcc ? t("modules.accounting.toasts.accountUpdated") : t("modules.accounting.toasts.accountCreated") });
    setAccDialogOpen(false);
    fetchData();
  };

  const deleteAccount = async (id: string) => {
    const { error } = await supabase.from("accounting_accounts").delete().eq("id", id);
    if (error) { toast({ title: t("modules.accounting.toasts.deleteError"), description: error.message, variant: "destructive" }); return; }
    toast({ title: t("modules.accounting.toasts.accountDeleted") });
    fetchData();
  };

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

  const saveEntry = async () => {
    if (!isBalanced || totalDebits === 0) {
      toast({ title: t("common.error"), description: t("modules.accounting.toasts.balanceError"), variant: "destructive" }); return;
    }
    const period = periodForDate(entryForm.date);
    if (!period) {
      toast({ title: t("modules.accounting.toasts.noPeriodTitle"), description: t("modules.accounting.toasts.noPeriodDesc"), variant: "destructive" }); return;
    }
    if (period.status !== "open") {
      toast({ title: t("modules.accounting.toasts.periodClosedTitle"), description: t("modules.accounting.toasts.periodClosedDesc", { name: period.name, status: periodStatusLabel(period.status) }), variant: "destructive" }); return;
    }
    const entryNumber = `${entryForm.series}-${Date.now().toString(36).toUpperCase()}`;
    const { data: entry, error } = await supabase.from("journal_entries").insert({
      entry_number: entryNumber, date: entryForm.date,
      description: entryForm.description || null, status: "draft",
      series: entryForm.series, period_id: period.id,
      fiscal_year_id: period.fiscal_year_id, tenant_id: tenantId,
      created_by: user?.id,
    } as any).select("id").single();
    if (error || !entry) { toast({ title: t("common.error"), description: error?.message || t("modules.accounting.toasts.entryCreateError"), variant: "destructive" }); return; }
    const lines = entryLines
      .filter((l) => l.account_id && ((parseFloat(l.debit) || 0) > 0 || (parseFloat(l.credit) || 0) > 0))
      .map((l) => ({
        entry_id: entry.id, account_id: l.account_id,
        debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0,
        description: l.description || null,
      }));
    const { error: linesErr } = await supabase.from("journal_entry_lines").insert(lines);
    if (linesErr) { toast({ title: t("modules.accounting.toasts.lineError"), description: linesErr.message, variant: "destructive" }); return; }
    if (entryForm.post) {
      const { error: postErr } = await supabase.rpc("post_journal_entry", { p_entry_id: entry.id });
      if (postErr) toast({ title: t("modules.accounting.toasts.postedFail"), description: postErr.message, variant: "destructive" });
      else {
        for (const l of lines) {
          const acc = accounts.find((a) => a.id === l.account_id);
          if (acc) {
            const isDebitNature = (acc.nature || (acc.type === "asset" || acc.type === "expense" ? "debit" : "credit")) === "debit";
            const delta = isDebitNature ? l.debit - l.credit : l.credit - l.debit;
            await supabase.from("accounting_accounts").update({ balance: acc.balance + delta }).eq("id", acc.id);
          }
        }
        toast({ title: t("modules.accounting.toasts.entryRegistered") });
      }
    } else toast({ title: t("modules.accounting.toasts.entrySavedDraft") });
    setEntryDialogOpen(false);
    fetchData();
  };

  const postDraft = async (id: string) => {
    const { error } = await supabase.rpc("post_journal_entry", { p_entry_id: id });
    if (error) { toast({ title: t("modules.accounting.toasts.postedFail"), description: error.message, variant: "destructive" }); return; }
    toast({ title: t("modules.accounting.toasts.entryPosted") });
    fetchData();
  };
  const reverseEntry = async (id: string) => {
    const reason = prompt(t("modules.accounting.toasts.reverseReasonPrompt"));
    if (!reason || reason.trim().length < 3) return;
    const { error } = await supabase.rpc("reverse_journal_entry", { p_entry_id: id, p_reason: reason });
    if (error) { toast({ title: t("common.error"), description: error.message, variant: "destructive" }); return; }
    toast({ title: t("modules.accounting.toasts.reversed") });
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

  const createFiscalYear = async () => {
    const { error } = await supabase.rpc("create_fiscal_year", {
      p_tenant_id: tenantId, p_year: fyForm.year, p_start_month: fyForm.start_month,
    });
    if (error) { toast({ title: t("common.error"), description: error.message, variant: "destructive" }); return; }
    toast({ title: t("modules.accounting.toasts.fyCreated", { year: fyForm.year }) });
    setFyDialogOpen(false);
    fetchData();
  };
  const togglePeriod = async (p: Period) => {
    let error: { message: string } | null = null;
    if (p.status === "open") {
      ({ error } = await supabase.rpc("close_accounting_period", { p_period: p.id }));
    } else {
      const reason = window.prompt("Motivo de la reapertura excepcional del período (queda auditado):");
      if (!reason || !reason.trim()) return;
      ({ error } = await (supabase.rpc as any)("reopen_accounting_period", { p_period_id: p.id, p_reason: reason.trim() }));
    }
    if (error) { toast({ title: t("common.error"), description: error.message, variant: "destructive" }); return; }
    toast({ title: p.status === "open" ? t("modules.accounting.toasts.periodClosed") : t("modules.accounting.toasts.periodOpened") });
    fetchData();
  };

  const importTemplate = async () => {
    const { data, error } = await supabase.rpc("import_chart_template", { p_tenant_id: tenantId, p_template: templateChoice });
    if (error) { toast({ title: t("common.error"), description: error.message, variant: "destructive" }); return; }
    await supabase.rpc("relink_chart_parents", { p_tenant_id: tenantId });
    toast({ title: t("modules.accounting.toasts.templateImported"), description: t("modules.accounting.toasts.templateImportedCount", { count: data as any }) });
    setTemplateDialogOpen(false);
    fetchData();
  };

  const totalAssets = accounts.filter((a) => a.type === "asset" && a.is_postable).reduce((s, a) => s + Number(a.balance || 0), 0);
  const totalLiabilities = accounts.filter((a) => a.type === "liability" && a.is_postable).reduce((s, a) => s + Number(a.balance || 0), 0);
  const totalIncome = accounts.filter((a) => a.type === "income" && a.is_postable).reduce((s, a) => s + Number(a.balance || 0), 0);
  const totalExpenses = accounts.filter((a) => a.type === "expense" && a.is_postable).reduce((s, a) => s + Number(a.balance || 0), 0);

  const renderAccountRow = (a: Account, depth: number): JSX.Element[] => {
    const children = accountsByParent.get(a.id) || [];
    const rows: JSX.Element[] = [
      <TableRow key={a.id}>
        <TableCell className="text-xs font-heading font-semibold" style={{ paddingLeft: `${depth * 16 + 12}px` }}>
          {!a.is_postable && <FolderTree className="inline h-3 w-3 mr-1 text-muted-foreground" />}
          {a.code}
        </TableCell>
        <TableCell className="text-xs font-medium">{a.name}</TableCell>
        <TableCell><Badge variant="outline" className={`text-[10px] ${TYPE_COLOR[a.type] || ""}`}>{typeLabel(a.type)}</Badge></TableCell>
        <TableCell>
          <Badge variant={a.is_postable ? "default" : "secondary"} className="text-[10px]">
            {a.is_postable ? t("modules.accounting.accounts.imputable") : t("modules.accounting.accounts.group")}
          </Badge>
        </TableCell>
        <TableCell className="text-xs font-heading font-bold">{a.is_postable ? `$${Number(a.balance || 0).toLocaleString()}` : "—"}</TableCell>
        <TableCell>
          <div className="flex gap-1">
            {!a.is_postable && (
              <button onClick={() => openNewAcc(a)} className="p-1.5 rounded hover:bg-muted" title={t("modules.accounting.accounts.subAccount")}><Plus className="h-3.5 w-3.5" /></button>
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

  useEffect(() => {
    const sec = SECTION_VALUES.find((s) => s.value === section);
    if (sec && !sec.subs.includes(subTab)) setSubTab(sec.subs[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  return (
    <AppLayout title={t("nav.items.accounting")}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><DollarSign className="h-5 w-5 text-primary" /></div>
            <div><p className="text-[10px] text-muted-foreground">{t("modules.accounting.summary.assets")}</p><p className="font-heading font-bold text-lg">${totalAssets.toLocaleString()}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center"><ArrowUpDown className="h-5 w-5 text-destructive" /></div>
            <div><p className="text-[10px] text-muted-foreground">{t("modules.accounting.summary.liabilities")}</p><p className="font-heading font-bold text-lg">${totalLiabilities.toLocaleString()}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-success" /></div>
            <div><p className="text-[10px] text-muted-foreground">{t("modules.accounting.summary.income")}</p><p className="font-heading font-bold text-lg">${totalIncome.toLocaleString()}</p></div>
          </CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center"><TrendingDown className="h-5 w-5 text-warning" /></div>
            <div><p className="text-[10px] text-muted-foreground">{t("modules.accounting.summary.expenses")}</p><p className="font-heading font-bold text-lg">${totalExpenses.toLocaleString()}</p></div>
          </CardContent></Card>
        </div>

        <div className="flex gap-2 flex-wrap p-1 bg-muted/40 rounded-xl w-fit">
          {SECTION_VALUES.map((s) => {
            const Icon = s.icon;
            const active = section === s.value;
            return (
              <button
                key={s.value}
                onClick={() => setSection(s.value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-heading font-semibold transition-all ${
                  active ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {sectionLabel(s.value)}
              </button>
            );
          })}
        </div>

        {section === "plan" && (
          <Tabs value={subTab} onValueChange={setSubTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="accounts"><ListTree className="h-3.5 w-3.5 mr-1" />{t("modules.accounting.tabs.accounts")}</TabsTrigger>
              <TabsTrigger value="mappings"><Landmark className="h-3.5 w-3.5 mr-1" />{t("finance.mapping.tab", { defaultValue: "Maestro de Cuentas" })}</TabsTrigger>
              <TabsTrigger value="periods"><CalendarClock className="h-3.5 w-3.5 mr-1" />{t("modules.accounting.tabs.periods")}</TabsTrigger>
            </TabsList>

            <TabsContent value="accounts" className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-muted-foreground">{t("modules.accounting.accounts.countLabel", { total: accounts.length, postable: postableAccounts.length })}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setTemplateDialogOpen(true)} className="gap-1 text-xs">
                    <Download className="h-3.5 w-3.5" /> {t("modules.accounting.accounts.importTemplate")}
                  </Button>
                  <Button size="sm" onClick={() => openNewAcc()} className="gap-1 text-xs gradient-brand text-primary-foreground">
                    <Plus className="h-3.5 w-3.5" /> {t("modules.accounting.accounts.newAccount")}
                  </Button>
                </div>
              </div>

              <TableToolbar
                search={accountsTable.search}
                onSearchChange={accountsTable.setSearch}
                searchPlaceholder={t("modules.accounting.accounts.searchPlaceholder")}
                filters={[
                  {
                    key: "type",
                    label: t("modules.accounting.accounts.filters.type"),
                    value: accountsTable.filters.type || "__all__",
                    onChange: (v) => accountsTable.setFilter("type", v),
                    options: ACCOUNT_TYPE_VALUES.map((v) => ({ value: v, label: typeLabel(v) })),
                  },
                  {
                    key: "postable",
                    label: t("modules.accounting.accounts.filters.nature"),
                    value: accountsTable.filters.postable || "__all__",
                    onChange: (v) => accountsTable.setFilter("postable", v),
                    options: [
                      { value: "yes", label: t("modules.accounting.accounts.filters.postable") },
                      { value: "no", label: t("modules.accounting.accounts.filters.group") },
                    ],
                  },
                  {
                    key: "active",
                    label: "Estado",
                    value: accountsTable.filters.active || "__all__",
                    onChange: (v) => accountsTable.setFilter("active", v),
                    options: [
                      { value: "yes", label: "Activas" },
                      { value: "no", label: "Inactivas" },
                    ],
                  },
                ]}

              />

              <div className="bg-card rounded-xl shadow-card border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{t("modules.accounting.accounts.header.code")}</TableHead>
                      <TableHead className="text-xs">{t("modules.accounting.accounts.header.name")}</TableHead>
                      <TableHead className="text-xs">{t("modules.accounting.accounts.header.type")}</TableHead>
                      <TableHead className="text-xs">{t("modules.accounting.accounts.header.nature")}</TableHead>
                      <TableHead className="text-xs">{t("modules.accounting.accounts.header.balance")}</TableHead>
                      <TableHead className="text-xs w-28">{t("modules.accounting.accounts.header.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-xs">
                        <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        {t("modules.accounting.accounts.empty")}
                      </TableCell></TableRow>
                    ) : accountsFiltered ? (
                      accountsTable.paged.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="text-xs font-heading font-semibold">{a.code}</TableCell>
                          <TableCell className="text-xs font-medium">{a.name}</TableCell>
                          <TableCell><Badge variant="outline" className={`text-[10px] ${TYPE_COLOR[a.type] || ""}`}>{typeLabel(a.type)}</Badge></TableCell>
                          <TableCell>
                            <Badge variant={a.is_postable ? "default" : "secondary"} className="text-[10px]">
                              {a.is_postable ? t("modules.accounting.accounts.imputable") : t("modules.accounting.accounts.group")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-heading font-bold">{a.is_postable ? `$${Number(a.balance || 0).toLocaleString()}` : "—"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <button onClick={() => openEditAcc(a)} className="p-1.5 rounded hover:bg-muted"><Edit2 className="h-3.5 w-3.5" /></button>
                              <button onClick={() => deleteAccount(a.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      rootAccounts.flatMap((a) => renderAccountRow(a, 0))
                    )}
                  </TableBody>
                </Table>
                {accountsFiltered && (
                  <TablePagination
                    page={accountsTable.page}
                    pageSize={accountsTable.pageSize}
                    total={accountsTable.total}
                    onPageChange={accountsTable.setPage}
                    onPageSizeChange={accountsTable.setPageSize}
                  />
                )}
              </div>
            </TabsContent>

            <TabsContent value="mappings" className="space-y-4">
              <AccountMappingTab />
            </TabsContent>



            <TabsContent value="periods" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{t("modules.accounting.periods.countLabel", { years: fiscalYears.length, periods: periods.length })}</p>
                <Button size="sm" onClick={() => setFyDialogOpen(true)} className="gap-1 text-xs gradient-brand text-primary-foreground">
                  <Plus className="h-3.5 w-3.5" /> {t("modules.accounting.periods.newFy")}
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
                          {fy.is_current && <Badge className="text-[10px]">{t("modules.accounting.periods.current")}</Badge>}
                          <Badge variant={fy.status === "open" ? "default" : "secondary"} className="text-[10px]">{periodStatusLabel(fy.status)}</Badge>
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
                            <button onClick={() => togglePeriod(p)} className="p-1.5 rounded hover:bg-muted" title={p.status === "open" ? t("modules.accounting.periods.closeTitle") : t("modules.accounting.periods.reopenTitle")}>
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
                  {t("modules.accounting.periods.empty")}
                </CardContent></Card>
              )}
            </TabsContent>
          </Tabs>
        )}

        {section === "operacion" && (
          <Tabs value={subTab} onValueChange={setSubTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="entries"><ClipboardList className="h-3.5 w-3.5 mr-1" />{t("modules.accounting.tabs.entries")}</TabsTrigger>
              <TabsTrigger value="cost_centers"><Building2 className="h-3.5 w-3.5 mr-1" />{t("modules.accounting.tabs.costCenters")}</TabsTrigger>
              <TabsTrigger value="budgets"><Wallet className="h-3.5 w-3.5 mr-1" />{t("modules.accounting.tabs.budgets")}</TabsTrigger>
            </TabsList>

            <TabsContent value="entries" className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm text-muted-foreground">{t("modules.accounting.entries.countLabel", { count: entries.length })}</p>
                <Button size="sm" onClick={openNewEntry} disabled={postableAccounts.length === 0 || periods.length === 0} className="gap-1 text-xs gradient-brand text-primary-foreground">
                  <Plus className="h-3.5 w-3.5" /> {t("modules.accounting.entries.newEntry")}
                </Button>
              </div>
              {periods.length === 0 && (
                <Card className="border-warning/30 bg-warning/5"><CardContent className="p-3 text-xs">
                  {t("modules.accounting.entries.needFy")}
                </CardContent></Card>
              )}

              <TableToolbar
                search={entriesTable.search}
                onSearchChange={entriesTable.setSearch}
                searchPlaceholder={t("modules.accounting.entries.searchPlaceholder")}
                filters={[
                  {
                    key: "status",
                    label: t("modules.accounting.entries.filterStatus"),
                    value: entriesTable.filters.status || "__all__",
                    onChange: (v) => entriesTable.setFilter("status", v),
                    options: [
                      { value: "draft", label: t("modules.accounting.entries.statuses.draft") },
                      { value: "posted", label: t("modules.accounting.entries.statuses.posted") },
                      { value: "reversed", label: t("modules.accounting.entries.statuses.reversed") },
                    ],
                  },
                  {
                    key: "series",
                    label: "Serie",
                    value: entriesTable.filters.series || "__all__",
                    onChange: (v) => entriesTable.setFilter("series", v),
                    options: entrySeriesOptions,
                  },
                  {
                    key: "period",
                    label: "Período",
                    value: entriesTable.filters.period || "__all__",
                    onChange: (v) => entriesTable.setFilter("period", v),
                    options: periods.map((p) => ({ value: p.id, label: p.name })),
                  },
                ]}
                rightSlot={
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex flex-col gap-1">
                      <Label className="text-[10px] text-muted-foreground">Desde</Label>
                      <Input type="date" value={entryFrom} onChange={(e) => setEntryFrom(e.target.value)} className="h-9 text-xs w-[140px]" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-[10px] text-muted-foreground">Hasta</Label>
                      <Input type="date" value={entryTo} onChange={(e) => setEntryTo(e.target.value)} className="h-9 text-xs w-[140px]" />
                    </div>
                    {(entryFrom || entryTo || entriesTable.search || Object.values(entriesTable.filters).some((v) => v && v !== "__all__")) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9 text-xs"
                        onClick={() => {
                          setEntryFrom("");
                          setEntryTo("");
                          entriesTable.setSearch("");
                          entriesTable.setFilter("status", "__all__");
                          entriesTable.setFilter("series", "__all__");
                          entriesTable.setFilter("period", "__all__");
                        }}
                      >
                        Limpiar
                      </Button>
                    )}
                  </div>
                }
              />


              <div className="bg-card rounded-xl shadow-card border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{t("modules.accounting.entries.header.number")}</TableHead>
                      <TableHead className="text-xs">{t("modules.accounting.entries.header.date")}</TableHead>
                      <TableHead className="text-xs">{t("modules.accounting.entries.header.description")}</TableHead>
                      <TableHead className="text-xs">{t("modules.accounting.entries.header.status")}</TableHead>
                      <TableHead className="text-xs w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entriesTable.paged.map((e) => (
                      <TableRow key={e.id} className="cursor-pointer hover:bg-muted/20">
                        <TableCell className="text-xs font-heading font-semibold" onClick={() => openEntryDetail(e)}>{e.entry_number}</TableCell>
                        <TableCell className="text-xs text-muted-foreground" onClick={() => openEntryDetail(e)}>{format(new Date(e.date), "dd/MM/yyyy")}</TableCell>
                        <TableCell className="text-xs" onClick={() => openEntryDetail(e)}>
                          {e.description || "—"}
                          {e.reverses && <Badge variant="outline" className="ml-2 text-[9px]">{t("modules.accounting.entries.reversalBadge")}</Badge>}
                          {e.reversed_by && <Badge variant="destructive" className="ml-2 text-[9px]">{t("modules.accounting.entries.reversedBadge")}</Badge>}
                        </TableCell>
                        <TableCell onClick={() => openEntryDetail(e)}>
                          <Badge variant={e.status === "posted" ? "default" : "secondary"} className="text-[10px]">
                            {entryStatusLabel(e.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {e.status === "draft" && (
                              <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1" onClick={() => postDraft(e.id)}>{t("modules.accounting.entries.post")}</Button>
                            )}
                            {e.status === "posted" && !e.reversed_by && !e.reverses && (
                              <button onClick={() => reverseEntry(e.id)} className="p-1.5 rounded hover:bg-destructive/10 text-destructive" title={t("modules.accounting.entries.reverse")}>
                                <Undo2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {entriesTable.total === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-xs">{t("modules.accounting.entries.empty")}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
                <TablePagination
                  page={entriesTable.page}
                  pageSize={entriesTable.pageSize}
                  total={entriesTable.total}
                  onPageChange={entriesTable.setPage}
                  onPageSizeChange={entriesTable.setPageSize}
                />
              </div>
            </TabsContent>

            <TabsContent value="cost_centers" className="space-y-4">
              <CostCentersTab />
            </TabsContent>

            <TabsContent value="budgets" className="space-y-4">
              <BudgetsTab />
            </TabsContent>
          </Tabs>
        )}

        {section === "analisis" && (
          <Tabs value={subTab} onValueChange={setSubTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="reports"><FileType className="h-3.5 w-3.5 mr-1" />{t("modules.accounting.tabs.reports")}</TabsTrigger>
            </TabsList>
            <TabsContent value="reports" className="space-y-4">
              <FinancialKpiPanel />
              <FinancialExceptionsPanel />
              <AccountingAuditPanel />
              <HistoricalCostsPanel />
              <OperationReconciliationPanel />
              <FinancialEngineConsole />

              <AccountingReports accounts={accounts as any} />
            </TabsContent>

          </Tabs>
        )}

        {section === "fiscal" && (
          <Tabs value={subTab} onValueChange={setSubTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="onat"><Landmark className="h-3.5 w-3.5 mr-1" />Declaraciones fiscales</TabsTrigger>
              <TabsTrigger value="costos"><FileSpreadsheet className="h-3.5 w-3.5 mr-1" />Plantillas de Costos</TabsTrigger>
            </TabsList>
            <TabsContent value="onat" className="space-y-4">
              <CuTaxDeclarationsTab />
            </TabsContent>
            <TabsContent value="costos" className="space-y-4">
              <CuCostSheetsTab />
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* Account Dialog */}
      <Dialog open={accDialogOpen} onOpenChange={setAccDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAcc ? t("modules.accounting.accountDialog.titleEdit") : t("modules.accounting.accountDialog.titleNew")}</DialogTitle>
            <DialogDescription>{t("modules.accounting.accountDialog.desc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("modules.accounting.accountDialog.code")}</Label><Input value={accForm.code} onChange={(e) => setAccForm({ ...accForm, code: e.target.value })} placeholder="1100" /></div>
              <div>
                <Label>{t("modules.accounting.accountDialog.type")}</Label>
                <Select value={accForm.type} onValueChange={(v) => setAccForm({ ...accForm, type: v, nature: (v === "asset" || v === "expense") ? "debit" : "credit" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ACCOUNT_TYPE_VALUES.map((v) => <SelectItem key={v} value={v}>{typeLabel(v)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>{t("modules.accounting.accountDialog.name")}</Label><Input value={accForm.name} onChange={(e) => setAccForm({ ...accForm, name: e.target.value })} /></div>
            <div>
              <Label>{t("modules.accounting.accountDialog.parent")}</Label>
              <Select value={accForm.parent_id || "none"} onValueChange={(v) => setAccForm({ ...accForm, parent_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("modules.accounting.accountDialog.noneRoot")}</SelectItem>
                  {accounts.filter((a) => !a.is_postable && a.id !== editingAcc?.id).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>{t("modules.accounting.accountDialog.postable")}</Label>
                <p className="text-[10px] text-muted-foreground">{t("modules.accounting.accountDialog.postableHint")}</p>
              </div>
              <Switch checked={accForm.is_postable} onCheckedChange={(v) => setAccForm({ ...accForm, is_postable: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={saveAccount} className="gradient-brand text-primary-foreground">{t("common.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Import */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("modules.accounting.templateDialog.title")}</DialogTitle>
            <DialogDescription>{t("modules.accounting.templateDialog.desc")}</DialogDescription>
          </DialogHeader>
          <Select value={templateChoice} onValueChange={setTemplateChoice}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["cu_onat","es_pgc","mx_sat","niif_generic"].map(k =>
                <SelectItem key={k} value={k}>{t(`modules.accounting.templateDialog.options.${k}`)}</SelectItem>
              )}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={importTemplate} className="gradient-brand text-primary-foreground">{t("modules.accounting.templateDialog.import")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fiscal Year */}
      <Dialog open={fyDialogOpen} onOpenChange={setFyDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("modules.accounting.fyDialog.title")}</DialogTitle>
            <DialogDescription>{t("modules.accounting.fyDialog.desc")}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>{t("modules.accounting.fyDialog.year")}</Label><Input type="number" value={fyForm.year} onChange={(e) => setFyForm({ ...fyForm, year: parseInt(e.target.value) })} /></div>
            <div><Label>{t("modules.accounting.fyDialog.startMonth")}</Label><Input type="number" min={1} max={12} value={fyForm.start_month} onChange={(e) => setFyForm({ ...fyForm, start_month: parseInt(e.target.value) })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFyDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={createFiscalYear} className="gradient-brand text-primary-foreground">{t("modules.accounting.fyDialog.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Entry */}
      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("modules.accounting.entryDialog.title")}</DialogTitle>
            <DialogDescription>{t("modules.accounting.entryDialog.desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div><Label>{t("modules.accounting.entryDialog.date")}</Label><Input type="date" value={entryForm.date} onChange={(e) => setEntryForm({ ...entryForm, date: e.target.value })} /></div>
              <div><Label>{t("modules.accounting.entryDialog.series")}</Label><Input value={entryForm.series} onChange={(e) => setEntryForm({ ...entryForm, series: e.target.value.toUpperCase() })} placeholder="GEN" /></div>
              <div><Label>{t("modules.accounting.entryDialog.description")}</Label><Input value={entryForm.description} onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })} /></div>
            </div>
            {(() => {
              const p = periodForDate(entryForm.date);
              return p
                ? <p className="text-[10px] text-muted-foreground">{t("modules.accounting.entryDialog.period")}: <strong>{p.name}</strong> ({periodStatusLabel(p.status)})</p>
                : <p className="text-[10px] text-destructive">{t("modules.accounting.entryDialog.noPeriod")}</p>;
            })()}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-heading font-semibold">{t("modules.accounting.entryDialog.lines")}</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine} className="text-xs gap-1"><Plus className="h-3 w-3" /> {t("modules.accounting.entryDialog.addLine")}</Button>
              </div>
              {entryLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 bg-muted/40 rounded-lg p-2 items-end">
                  <div className="col-span-5">
                    <Label className="text-[10px]">{t("modules.accounting.entryDialog.account")}</Label>
                    <Select value={line.account_id} onValueChange={(v) => updateLine(idx, "account_id", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t("modules.accounting.entryDialog.selectAccount")} /></SelectTrigger>
                      <SelectContent>
                        {postableAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">{t("modules.accounting.entryDialog.debit")}</Label>
                    <Input type="number" className="h-8 text-xs" value={line.debit} onChange={(e) => updateLine(idx, "debit", e.target.value)} placeholder="0" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">{t("modules.accounting.entryDialog.credit")}</Label>
                    <Input type="number" className="h-8 text-xs" value={line.credit} onChange={(e) => updateLine(idx, "credit", e.target.value)} placeholder="0" />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">{t("modules.accounting.entryDialog.note")}</Label>
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
                <span>{t("modules.accounting.entryDialog.debits")}: <strong>${totalDebits.toLocaleString()}</strong></span>
                <span>{t("modules.accounting.entryDialog.credits")}: <strong>${totalCredits.toLocaleString()}</strong></span>
                <Badge variant={isBalanced ? "default" : "destructive"} className="text-[10px]">{isBalanced ? t("modules.accounting.entryDialog.balanced") : t("modules.accounting.entryDialog.notBalanced")}</Badge>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>{t("modules.accounting.entryDialog.postOnSave")}</Label>
                  <p className="text-[10px] text-muted-foreground">{t("modules.accounting.entryDialog.postOnSaveHint")}</p>
                </div>
                <Switch checked={entryForm.post} onCheckedChange={(v) => setEntryForm({ ...entryForm, post: v })} />
              </div>
            </div>
            <Button onClick={saveEntry} disabled={!isBalanced || totalDebits === 0} className="w-full gradient-brand text-primary-foreground font-heading font-semibold">
              {entryForm.post ? t("modules.accounting.entryDialog.registerAndPost") : t("modules.accounting.entryDialog.saveDraft")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Entry Detail */}
      <Dialog open={!!detailEntry} onOpenChange={() => setDetailEntry(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("modules.accounting.entryDetail.title", { number: detailEntry?.entry_number })}</DialogTitle>
            <DialogDescription>
              {detailEntry?.description || t("modules.accounting.entryDetail.noDescription")} · {detailEntry?.date && format(new Date(detailEntry.date), "dd/MM/yyyy")}
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t("modules.accounting.entryDetail.account")}</TableHead>
                <TableHead className="text-xs text-right">{t("modules.accounting.entryDetail.debit")}</TableHead>
                <TableHead className="text-xs text-right">{t("modules.accounting.entryDetail.credit")}</TableHead>
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
