import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  TrendingUp, TrendingDown, Wallet, Landmark, ArrowDownCircle, ArrowUpCircle,
  ChevronDown, RefreshCw,
} from "lucide-react";

interface Kpis {
  period_id: string | null;
  period_name: string | null;
  period_status: string | null;
  revenue: number;
  expense: number;
  net_income: number;
  assets: number;
  liabilities: number;
  equity: number;
  cash: number;
  accounts_receivable: number;
  accounts_payable: number;
  margin_pct: number;
}

interface BreakdownRow {
  bucket: string;
  account_code: string;
  account_name: string;
  account_type: string;
  debit_total: number;
  credit_total: number;
  closing_balance: number;
}

interface PeriodOption {
  id: string;
  name: string;
  status: string | null;
  entries: number;
}

export function FinancialKpiPanel() {
  const { t, i18n } = useTranslation();
  const tenantId = useTenant();
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<PeriodOption[]>([]);
  const [periodId, setPeriodId] = useState<string | null>(null);

  const tr = (key: string, fallback: string) =>
    t(`finance.kpi.${key}`, { defaultValue: fallback }) as string;

  const fmt = useMemo(
    () => (n: number) =>
      new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(Number(n || 0)),
    [i18n.language],
  );

  // Los períodos se listan con su número de asientos contabilizados para que el
  // contador no vea "0" simplemente porque el mes en curso aún no tiene actividad.
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      const [{ data: periodRows }, { data: entryRows }] = await Promise.all([
        supabase
          .from("accounting_periods")
          .select("id, name, status, start_date")
          .eq("tenant_id", tenantId)
          .order("start_date", { ascending: false })
          .limit(36),
        supabase
          .from("journal_entries")
          .select("period_id")
          .eq("tenant_id", tenantId)
          .eq("status", "posted")
          .limit(5000),
      ]);
      if (cancelled) return;
      const counts = new Map<string, number>();
      for (const row of (entryRows ?? []) as { period_id: string | null }[]) {
        if (row.period_id) counts.set(row.period_id, (counts.get(row.period_id) ?? 0) + 1);
      }
      const opts: PeriodOption[] = ((periodRows ?? []) as any[]).map((p) => ({
        id: p.id as string,
        name: (p.name as string) ?? "—",
        status: (p.status as string) ?? null,
        entries: counts.get(p.id as string) ?? 0,
      }));
      setPeriods(opts);
      setPeriodId((prev) => prev ?? (opts.find((o) => o.entries > 0)?.id ?? opts[0]?.id ?? null));
    })();
    return () => { cancelled = true; };
  }, [tenantId]);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [kpiRes, bdRes] = await Promise.all([
      (supabase as any).rpc("get_financial_kpis", { p_tenant: tenantId, p_period_id: periodId }),
      (supabase as any).rpc("financial_kpi_breakdown", { p_tenant: tenantId, p_period_id: periodId }),
    ]);
    setKpis((kpiRes.data as unknown as Kpis) ?? null);
    setBreakdown(((bdRes.data ?? []) as BreakdownRow[]) || []);
    setLoading(false);
  }, [tenantId, periodId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <Card className="p-6"><Skeleton className="h-32 w-full" /></Card>;
  }

  if (!kpis || !kpis.period_id) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        {tr("noPeriod", "Aún no hay períodos contables configurados.")}
      </Card>
    );
  }

  const activePeriod = periods.find((p) => p.id === (periodId ?? kpis.period_id));


  const tiles = [
    {
      key: "revenue", bucket: "revenue", label: tr("revenue", "Ingresos"), value: fmt(kpis.revenue),
      icon: TrendingUp, tone: "text-success",
      hint: tr("revenueHint", "Suma del haber de las cuentas de ingreso del período (libro mayor)."),
    },
    {
      key: "expense", bucket: "expense", label: tr("expense", "Gastos y costos"), value: fmt(kpis.expense),
      icon: TrendingDown, tone: "text-destructive",
      hint: tr("expenseHint", "Suma del debe de gastos y costo de ventas del período."),
    },
    {
      key: "net_income", bucket: "revenue", label: tr("netIncome", "Utilidad neta"), value: fmt(kpis.net_income),
      icon: Wallet, tone: kpis.net_income >= 0 ? "text-success" : "text-destructive",
      hint: tr("netIncomeHint", "Ingresos − (gastos + costos). Es el resultado del ejercicio del período."),
    },
    {
      key: "margin", bucket: "revenue", label: tr("margin", "Margen"), value: `${kpis.margin_pct}%`,
      icon: TrendingUp, tone: "text-primary",
      hint: tr("marginHint", "Utilidad neta ÷ ingresos × 100."),
    },
    {
      key: "cash", bucket: "cash", label: tr("cash", "Efectivo y bancos"), value: fmt(kpis.cash),
      icon: Landmark, tone: "text-warning",
      hint: tr("cashHint", "Saldo de cierre de las cuentas de control caja y banco."),
    },
    {
      key: "receivable", bucket: "receivable", label: tr("receivable", "Cuentas por cobrar"), value: fmt(kpis.accounts_receivable),
      icon: ArrowDownCircle, tone: "text-primary",
      hint: tr("receivableHint", "Pendiente de cobro a clientes según el mayor, no según el saldo del cliente."),
    },
    {
      key: "payable", bucket: "payable", label: tr("payable", "Cuentas por pagar"), value: fmt(kpis.accounts_payable),
      icon: ArrowUpCircle, tone: "text-warning",
      hint: tr("payableHint", "Deuda con proveedores registrada en el mayor."),
    },
    {
      key: "equity", bucket: "equity", label: tr("equity", "Patrimonio"), value: fmt(kpis.equity),
      icon: Wallet, tone: "text-muted-foreground",
      hint: tr("equityHint", "Activo − pasivo. Debe cuadrar con la ecuación patrimonial."),
    },
  ];

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-base font-semibold">{tr("title", "KPIs Financieros (Libro Mayor)")}</h3>
          <p className="text-xs text-muted-foreground">
            {tr("period", "Período")}: <span className="font-medium">{kpis.period_name ?? "—"}</span> ·{" "}
            {tr("sourceNote", "calculado exclusivamente desde asientos contabilizados")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={kpis.period_status === "open" ? "default" : "secondary"}>
            {kpis.period_status ?? "—"}
          </Badge>
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map((tile) => {
          const rows = breakdown.filter((b) => b.bucket === tile.bucket);
          return (
            <Collapsible key={tile.key}>
              <div className="rounded-lg border bg-card/50 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <tile.icon className={`h-3.5 w-3.5 ${tile.tone}`} />
                  {tile.label}
                </div>
                <div className="mt-1 text-lg font-semibold">{tile.value}</div>
                <p className="mt-1 text-[10px] text-muted-foreground leading-snug">{tile.hint}</p>
                {rows.length > 0 && (
                  <>
                    <CollapsibleTrigger className="mt-1 flex items-center gap-1 text-[10px] text-primary hover:underline">
                      {tr("detail", "Ver cuentas")} ({rows.length})
                      <ChevronDown className="h-3 w-3" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-1.5 space-y-0.5 max-h-40 overflow-y-auto">
                      {rows.map((r) => (
                        <div key={r.account_code} className="flex justify-between gap-2 text-[10px] font-mono">
                          <span className="truncate">{r.account_code} {r.account_name}</span>
                          <span>{fmt(r.closing_balance)}</span>
                        </div>
                      ))}
                    </CollapsibleContent>
                  </>
                )}
              </div>
            </Collapsible>
          );
        })}
      </div>
    </Card>
  );
}
