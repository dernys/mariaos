import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FileType, BookOpen, Scale, TrendingUp, Loader2, Lock, BookText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  nature: string;
  parent_id: string | null;
}

interface Props {
  accounts: Account[];
  tenantName?: string;
}

const TYPE_LABEL: Record<string, string> = {
  asset: "Activo", liability: "Pasivo", equity: "Capital",
  income: "Ingreso", expense: "Gasto",
};

function pdfHeader(doc: jsPDF, title: string, subtitle: string, tenantName?: string) {
  doc.setFontSize(16); doc.setFont("helvetica","bold");
  doc.text(title, 14, 16);
  doc.setFontSize(10); doc.setFont("helvetica","normal");
  doc.text(tenantName || "Empresa", 14, 22);
  doc.setTextColor(120); doc.text(subtitle, 14, 27);
  doc.setTextColor(0);
}

function money(n: number) {
  return `$${(n||0).toLocaleString("es-CU",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}

export function AccountingReports({ accounts, tenantName }: Props) {
  const tenantId = useTenant();
  const { toast } = useToast();
  const [from, setFrom] = useState(() => { const d=new Date(); d.setDate(1); return d.toISOString().slice(0,10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0,10));
  const [loading, setLoading] = useState<string | null>(null);

  const accountMap = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);

  async function fetchEntryLines() {
    const { data: ents, error: e1 } = await supabase.from("journal_entries")
      .select("id,date,entry_number,description")
      .eq("tenant_id", tenantId!).eq("status","posted")
      .gte("date", from).lte("date", to).order("date");
    if (e1) throw e1;
    const ids = (ents ?? []).map(e => e.id);
    if (ids.length === 0) return { entries: [], lines: [] as any[] };
    const { data: lines, error: e2 } = await supabase.from("journal_entry_lines")
      .select("entry_id,account_id,debit,credit,description").in("entry_id", ids);
    if (e2) throw e2;
    return { entries: ents ?? [], lines: lines ?? [] };
  }

  function balancesByAccount(lines: any[]) {
    const m = new Map<string, { debit: number; credit: number }>();
    lines.forEach(l => {
      const cur = m.get(l.account_id) || { debit: 0, credit: 0 };
      cur.debit += Number(l.debit||0); cur.credit += Number(l.credit||0);
      m.set(l.account_id, cur);
    });
    return m;
  }

  function signedBalance(acc: Account, debit: number, credit: number) {
    return acc.nature === "debit" ? debit - credit : credit - debit;
  }

  async function generateIncomeStatement() {
    if (!tenantId) return;
    setLoading("income");
    try {
      const { lines } = await fetchEntryLines();
      const bal = balancesByAccount(lines);
      const rows: any[] = [];
      let totalIncome = 0, totalExpense = 0;
      accounts.filter(a => a.type === "income").forEach(a => {
        const b = bal.get(a.id); if (!b) return;
        const v = signedBalance(a, b.debit, b.credit);
        if (v !== 0) { rows.push([a.code, a.name, money(v)]); totalIncome += v; }
      });
      rows.push(["", "TOTAL INGRESOS", money(totalIncome)]);
      rows.push(["", "", ""]);
      accounts.filter(a => a.type === "expense").forEach(a => {
        const b = bal.get(a.id); if (!b) return;
        const v = signedBalance(a, b.debit, b.credit);
        if (v !== 0) { rows.push([a.code, a.name, money(v)]); totalExpense += v; }
      });
      rows.push(["", "TOTAL GASTOS", money(totalExpense)]);
      rows.push(["", "RESULTADO NETO", money(totalIncome - totalExpense)]);

      const doc = new jsPDF();
      pdfHeader(doc, "Estado de Resultados", `Período: ${from} a ${to}`, tenantName);
      autoTable(doc, {
        startY: 34,
        head: [["Cuenta", "Descripción", "Importe"]],
        body: rows,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [16, 185, 129] },
        columnStyles: { 2: { halign: "right" } },
      });
      doc.save(`estado_resultados_${from}_${to}.pdf`);
      toast({ title: "PDF generado" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(null); }
  }

  async function generateBalanceSheet() {
    if (!tenantId) return;
    setLoading("balance");
    try {
      const { lines } = await fetchEntryLines();
      const bal = balancesByAccount(lines);
      const sections: Record<string, any[]> = { asset: [], liability: [], equity: [] };
      const totals = { asset: 0, liability: 0, equity: 0 };
      (["asset","liability","equity"] as const).forEach(t => {
        accounts.filter(a => a.type === t).forEach(a => {
          const b = bal.get(a.id); if (!b) return;
          const v = signedBalance(a, b.debit, b.credit);
          if (v !== 0) { sections[t].push([a.code, a.name, money(v)]); totals[t] += v; }
        });
      });
      const rows: any[] = [];
      rows.push([{ content: "ACTIVOS", colSpan: 3, styles: { fontStyle: "bold", fillColor: [240,253,250] } }]);
      rows.push(...sections.asset);
      rows.push(["", "TOTAL ACTIVOS", money(totals.asset)]);
      rows.push([{ content: "PASIVOS", colSpan: 3, styles: { fontStyle: "bold", fillColor: [254,242,242] } }]);
      rows.push(...sections.liability);
      rows.push(["", "TOTAL PASIVOS", money(totals.liability)]);
      rows.push([{ content: "CAPITAL", colSpan: 3, styles: { fontStyle: "bold", fillColor: [243,244,246] } }]);
      rows.push(...sections.equity);
      rows.push(["", "TOTAL CAPITAL", money(totals.equity)]);
      rows.push(["", "TOTAL PASIVOS + CAPITAL", money(totals.liability + totals.equity)]);

      const doc = new jsPDF();
      pdfHeader(doc, "Balance General", `Al ${to}`, tenantName);
      autoTable(doc, {
        startY: 34,
        head: [["Cuenta", "Descripción", "Saldo"]],
        body: rows,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [16, 185, 129] },
        columnStyles: { 2: { halign: "right" } },
      });
      doc.save(`balance_general_${to}.pdf`);
      toast({ title: "PDF generado" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(null); }
  }

  async function generateJournal() {
    if (!tenantId) return;
    setLoading("journal");
    try {
      const { entries, lines } = await fetchEntryLines();
      const linesByEntry = new Map<string, any[]>();
      lines.forEach(l => {
        const arr = linesByEntry.get(l.entry_id) || [];
        arr.push(l); linesByEntry.set(l.entry_id, arr);
      });
      const rows: any[] = [];
      let totalD = 0, totalC = 0;
      entries.forEach(e => {
        const ls = linesByEntry.get(e.id) || [];
        rows.push([{
          content: `${format(new Date(e.date),"dd/MM/yyyy")} · ${e.entry_number} · ${e.description || ""}`,
          colSpan: 4, styles: { fontStyle: "bold", fillColor: [243,244,246] }
        }]);
        ls.forEach(l => {
          const a = accountMap.get(l.account_id);
          totalD += Number(l.debit||0); totalC += Number(l.credit||0);
          rows.push([
            a?.code || "", a?.name || "—",
            Number(l.debit) > 0 ? money(Number(l.debit)) : "",
            Number(l.credit) > 0 ? money(Number(l.credit)) : "",
          ]);
        });
      });
      rows.push([{ content: "TOTALES", colSpan: 2, styles: { fontStyle: "bold" } }, money(totalD), money(totalC)]);

      const doc = new jsPDF({ orientation: "landscape" });
      pdfHeader(doc, "Libro Diario", `${from} a ${to}`, tenantName);
      autoTable(doc, {
        startY: 34,
        head: [["Código", "Cuenta", "Débito", "Crédito"]],
        body: rows,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [16, 185, 129] },
        columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
      });
      doc.save(`libro_diario_${from}_${to}.pdf`);
      toast({ title: "PDF generado" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(null); }
  }

  async function generateTrialBalance() {
    if (!tenantId) return;
    setLoading("trial");
    try {
      const { lines } = await fetchEntryLines();
      const bal = balancesByAccount(lines);
      const rows: any[] = [];
      let totD = 0, totC = 0;
      accounts.filter(a => bal.has(a.id)).sort((a,b)=>a.code.localeCompare(b.code)).forEach(a => {
        const b = bal.get(a.id)!;
        totD += b.debit; totC += b.credit;
        rows.push([a.code, a.name, TYPE_LABEL[a.type]||a.type, money(b.debit), money(b.credit)]);
      });
      rows.push([{ content: "TOTALES", colSpan: 3, styles: { fontStyle: "bold" } }, money(totD), money(totC)]);

      const doc = new jsPDF();
      pdfHeader(doc, "Balance de Comprobación", `${from} a ${to}`, tenantName);
      autoTable(doc, {
        startY: 34,
        head: [["Código","Cuenta","Tipo","Débito","Crédito"]],
        body: rows,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [16,185,129] },
        columnStyles: { 3:{halign:"right"}, 4:{halign:"right"} },
      });
      doc.save(`balance_comprobacion_${from}_${to}.pdf`);
      toast({ title: "PDF generado" });
    } catch (e:any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(null); }
  }

  const reportCard = (key: string, title: string, desc: string, icon: any, fn: () => void) => {
    const Icon = icon;
    return (
      <Card className="hover:shadow-card transition-shadow">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-heading font-semibold text-sm">{title}</p>
              <p className="text-[11px] text-muted-foreground">{desc}</p>
            </div>
          </div>
          <Button size="sm" className="w-full gap-2" onClick={fn} disabled={loading !== null}>
            {loading === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileType className="h-3.5 w-3.5" />}
            Generar PDF
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={to} onChange={(e)=>setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {reportCard("income", "Estado de Resultados", "Ingresos y gastos del período", TrendingUp, generateIncomeStatement)}
        {reportCard("balance", "Balance General", "Activos, pasivos y capital", Scale, generateBalanceSheet)}
        {reportCard("trial", "Balance Comprobación", "Sumas y saldos por cuenta", BookOpen, generateTrialBalance)}
        {reportCard("journal", "Libro Diario", "Asientos detallados del período", BookOpen, generateJournal)}
      </div>
    </div>
  );
}
