import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FileType, BookOpen, Scale, TrendingUp, Loader2, Lock, BookText, Eye } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/data/TablePagination";
import { useBaseCurrency } from "@/hooks/useFiscalRules";


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
  income: "Ingreso", expense: "Gasto", cost: "Costo",
};

type ReportKey = "income" | "balance" | "trial" | "journal" | "ledger";

interface Preview {
  key: ReportKey;
  title: string;
  subtitle: string;
  head: string[];
  /** rows already formatted for display; numeric columns as strings */
  rows: (string | { text: string; bold?: boolean; span?: number })[][];
  rightAligned: number[];
  landscape?: boolean;
  balanced?: boolean;
}

function pdfHeader(doc: jsPDF, title: string, subtitle: string, tenantName?: string) {
  doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text(title, 14, 16);
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(tenantName || "Empresa", 14, 22);
  doc.setTextColor(120); doc.text(subtitle, 14, 27);
  doc.setTextColor(0);
}

export function AccountingReports({ accounts, tenantName }: Props) {
  const tenantId = useTenant();
  const { toast } = useToast();
  const { symbol } = useBaseCurrency();
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState<string | null>(null);
  const [periods, setPeriods] = useState<Array<{ id: string; name: string; status: string; start_date: string; end_date: string }>>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [preview, setPreview] = useState<Preview | null>(null);

  const money = useMemo(
    () => (n: number) => `${symbol || "$"}${(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    [symbol],
  );

  useEffect(() => {
    if (!tenantId) return;
    supabase.from("accounting_periods")
      .select("id,name,status,start_date,end_date")
      .eq("tenant_id", tenantId)
      .order("start_date", { ascending: false })
      .then(({ data }) => {
        setPeriods(data ?? []);
        const openOne = (data ?? []).find(p => p.status === "open");
        if (openOne && !selectedPeriod) setSelectedPeriod(openOne.id);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function closeMonth() {
    if (!selectedPeriod) { toast({ title: "Selecciona un período", variant: "destructive" }); return; }
    if (!confirm("¿Cerrar este período contable? No podrás registrar nuevos asientos en él.")) return;
    setLoading("close");
    try {
      const { data, error } = await supabase.rpc("close_accounting_period", { p_period: selectedPeriod });
      if (error) throw error;
      toast({ title: "Período cerrado", description: `Filas en libro mayor: ${(data as any)?.gl_rows ?? 0}` });
      const { data: pdata } = await supabase.from("accounting_periods")
        .select("id,name,status,start_date,end_date").eq("tenant_id", tenantId!).order("start_date", { ascending: false });
      setPeriods(pdata ?? []);
    } catch (e: any) {
      toast({ title: "Error al cerrar", description: e.message, variant: "destructive" });
    } finally { setLoading(null); }
  }

  const bold = (text: string, span?: number) => ({ text, bold: true, span });

  async function build(key: ReportKey): Promise<Preview> {
    const range = `${from} a ${to}`;
    if (key === "income") {
      const { data, error } = await supabase.rpc("report_income_statement", { p_tenant: tenantId!, p_from: from, p_to: to });
      if (error) throw error;
      const rows: Preview["rows"] = [];
      let inc = 0, exp = 0;
      (data ?? []).filter((r: any) => r.section === "income").forEach((r: any) => {
        inc += Number(r.amount); rows.push([r.code, r.name, money(Number(r.amount))]);
      });
      rows.push([bold("", 1), bold("TOTAL INGRESOS"), bold(money(inc))]);
      (data ?? []).filter((r: any) => r.section === "expense").forEach((r: any) => {
        exp += Number(r.amount); rows.push([r.code, r.name, money(Number(r.amount))]);
      });
      rows.push([bold(""), bold("TOTAL GASTOS Y COSTOS"), bold(money(exp))]);
      rows.push([bold(""), bold("RESULTADO NETO"), bold(money(inc - exp))]);
      return { key, title: "Estado de Resultados", subtitle: `Período: ${range}`, head: ["Cuenta", "Descripción", "Importe"], rows, rightAligned: [2] };
    }

    if (key === "balance") {
      const { data, error } = await supabase.rpc("report_balance_sheet", { p_tenant: tenantId!, p_to: to });
      if (error) throw error;
      const rows: Preview["rows"] = [];
      const totals: Record<string, number> = { asset: 0, liability: 0, equity: 0 };
      (["asset", "liability", "equity"] as const).forEach(t => {
        const section = (data ?? []).filter((r: any) => r.section === t);
        rows.push([bold(TYPE_LABEL[t].toUpperCase(), 3)]);
        section.forEach((r: any) => { totals[t] += Number(r.amount); rows.push([r.code, r.name, money(Number(r.amount))]); });
        rows.push([bold(""), bold(`TOTAL ${TYPE_LABEL[t].toUpperCase()}`), bold(money(totals[t]))]);
      });
      rows.push([bold(""), bold("TOTAL PASIVO + CAPITAL"), bold(money(totals.liability + totals.equity))]);
      const balanced = Math.abs(totals.asset - (totals.liability + totals.equity)) < 0.01;
      return { key, title: "Balance General", subtitle: `Al ${to}`, head: ["Cuenta", "Descripción", "Saldo"], rows, rightAligned: [2], balanced };
    }

    if (key === "trial") {
      const { data, error } = await supabase.rpc("report_trial_balance", { p_tenant: tenantId!, p_from: from, p_to: to });
      if (error) throw error;
      let d = 0, c = 0;
      const rows: Preview["rows"] = (data ?? []).map((r: any) => {
        d += Number(r.debit); c += Number(r.credit);
        return [r.code, r.name, TYPE_LABEL[r.type] ?? r.type, money(Number(r.debit)), money(Number(r.credit)), money(Number(r.balance))];
      });
      rows.push([bold("TOTALES", 3), bold(""), bold(money(d)), bold(money(c)), bold("")]);
      return {
        key, title: "Balance de Comprobación", subtitle: range,
        head: ["Código", "Cuenta", "Tipo", "Débito", "Crédito", "Saldo"],
        rows, rightAligned: [3, 4, 5], balanced: Math.abs(d - c) < 0.01,
      };
    }

    if (key === "journal") {
      const { data, error } = await supabase.rpc("report_journal", { p_tenant: tenantId!, p_from: from, p_to: to });
      if (error) throw error;
      const rows: Preview["rows"] = [];
      let d = 0, c = 0, current = "";
      (data ?? []).forEach((r: any) => {
        if (r.entry_id !== current) {
          current = r.entry_id;
          rows.push([bold(`${format(new Date(r.entry_date), "dd/MM/yyyy")} · ${r.entry_number} · ${r.entry_description ?? ""}`, 4)]);
        }
        d += Number(r.debit); c += Number(r.credit);
        rows.push([r.code, r.name, Number(r.debit) > 0 ? money(Number(r.debit)) : "", Number(r.credit) > 0 ? money(Number(r.credit)) : ""]);
      });
      rows.push([bold("TOTALES", 2), bold(""), bold(money(d)), bold(money(c))]);
      return {
        key, title: "Libro Diario", subtitle: range, head: ["Código", "Cuenta", "Débito", "Crédito"],
        rows, rightAligned: [2, 3], landscape: true, balanced: Math.abs(d - c) < 0.01,
      };
    }

    const { data, error } = await supabase.rpc("report_general_ledger", { p_tenant: tenantId!, p_from: from, p_to: to });
    if (error) throw error;
    const rows: Preview["rows"] = [];
    let current = "";
    (data ?? []).forEach((r: any) => {
      if (r.code !== current) { current = r.code; rows.push([bold(`${r.code} · ${r.name}`, 6)]); }
      rows.push([
        format(new Date(r.entry_date), "dd/MM/yyyy"), r.entry_number, r.description ?? "",
        Number(r.debit) > 0 ? money(Number(r.debit)) : "",
        Number(r.credit) > 0 ? money(Number(r.credit)) : "",
        money(Number(r.running_balance)),
      ]);
    });
    return {
      key, title: "Libro Mayor", subtitle: range,
      head: ["Fecha", "Asiento", "Concepto", "Débito", "Crédito", "Saldo"],
      rows, rightAligned: [3, 4, 5], landscape: true,
    };
  }

  async function show(key: ReportKey) {
    if (!tenantId) return;
    setLoading(key);
    try {
      const p = await build(key);
      setPreview(p);
      if (p.rows.length === 0) toast({ title: "Sin movimientos contabilizados en el rango seleccionado" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(null); }
  }

  function exportPdf(p: Preview) {
    const doc = new jsPDF(p.landscape ? { orientation: "landscape" } : undefined);
    pdfHeader(doc, p.title, p.subtitle, tenantName);
    const body = p.rows.map(row =>
      row.map(cell => typeof cell === "string"
        ? cell
        : { content: cell.text, colSpan: cell.span ?? 1, styles: { fontStyle: cell.bold ? "bold" as const : "normal" as const } }),
    );
    autoTable(doc, {
      startY: 34,
      head: [p.head],
      body: body as any,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [16, 185, 129] },
      columnStyles: Object.fromEntries(p.rightAligned.map(i => [i, { halign: "right" as const }])),
    });
    doc.save(`${p.title.toLowerCase().replace(/\s+/g, "_")}_${from}_${to}.pdf`);
  }

  const reportCard = (key: ReportKey, title: string, desc: string, icon: any) => {
    const Icon = icon;
    const active = preview?.key === key;
    return (
      <Card className={`transition-shadow hover:shadow-card ${active ? "ring-1 ring-primary" : ""}`}>
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
          <Button size="sm" variant={active ? "default" : "outline"} className="w-full gap-2" onClick={() => show(key)} disabled={loading !== null}>
            {loading === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
            Ver reporte
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
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <Label className="text-xs">Cierre de período</Label>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger><SelectValue placeholder="Selecciona un período" /></SelectTrigger>
              <SelectContent>
                {periods.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.status === "closed" ? "Cerrado" : p.status === "locked" ? "Bloqueado" : "Abierto"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={closeMonth} disabled={loading !== null || !selectedPeriod} className="gap-2">
            {loading === "close" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Cerrar mes
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {reportCard("income", "Estado de Resultados", "Ingresos, costos y gastos", TrendingUp)}
        {reportCard("balance", "Balance General", "Activos, pasivos y capital", Scale)}
        {reportCard("trial", "Balance Comprobación", "Sumas y saldos por cuenta", BookOpen)}
        {reportCard("journal", "Libro Diario", "Asientos detallados", BookOpen)}
        {reportCard("ledger", "Libro Mayor", "Movimientos y saldo por cuenta", BookText)}
      </div>

      {preview && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-heading font-semibold">{preview.title}</p>
                <p className="text-xs text-muted-foreground">{tenantName} · {preview.subtitle}</p>
              </div>
              <div className="flex items-center gap-2">
                {preview.balanced !== undefined && (
                  <Badge variant={preview.balanced ? "default" : "destructive"}>
                    {preview.balanced ? "Cuadrado" : "Descuadre"}
                  </Badge>
                )}
                <Button size="sm" variant="outline" className="gap-2" onClick={() => exportPdf(preview)} disabled={preview.rows.length === 0}>
                  <FileType className="h-3.5 w-3.5" /> Exportar PDF
                </Button>
              </div>
            </div>

            {preview.rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No hay asientos contabilizados en este rango de fechas.
              </p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <div className="max-h-[520px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted/60 backdrop-blur">
                      <TableRow>
                        {preview.head.map((h, i) => (
                          <TableHead key={h} className={`text-xs ${preview.rightAligned.includes(i) ? "text-right" : ""}`}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedRows.map((row, ri) => (
                        <TableRow key={ri} className="text-xs">
                          {row.map((cell, ci) => {
                            const text = typeof cell === "string" ? cell : cell.text;
                            const isBold = typeof cell !== "string" && cell.bold;
                            const span = typeof cell === "string" ? 1 : cell.span ?? 1;
                            return (
                              <TableCell
                                key={ci}
                                colSpan={span}
                                className={[
                                  isBold ? "font-semibold" : "",
                                  preview.rightAligned.includes(ci) ? "text-right tabular-nums" : "",
                                ].join(" ")}
                              >
                                {text}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <TablePagination
                  page={page}
                  pageSize={pageSize}
                  total={preview.rows.length}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
              </div>
            )}

          </CardContent>
        </Card>
      )}
    </div>
  );
}
