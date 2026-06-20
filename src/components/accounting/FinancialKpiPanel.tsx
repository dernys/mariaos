import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Wallet, Landmark, ArrowDownCircle, ArrowUpCircle } from "lucide-react";

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

const fmt = (n: number) =>
  `$${(n || 0).toLocaleString("es-CU", { maximumFractionDigits: 2 })}`;

export function FinancialKpiPanel() {
  const tenantId = useTenant();
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    supabase
      .rpc("get_financial_kpis", { p_tenant: tenantId, p_period_id: null })
      .then(({ data }) => {
        setKpis((data as unknown as Kpis) ?? null);
        setLoading(false);
      });
  }, [tenantId]);

  if (loading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-32 w-full" />
      </Card>
    );
  }

  if (!kpis || !kpis.period_id) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Aún no hay períodos contables configurados.
      </Card>
    );
  }

  const tiles = [
    { label: "Ingresos", value: fmt(kpis.revenue), icon: TrendingUp, tone: "text-emerald-500" },
    { label: "Gastos", value: fmt(kpis.expense), icon: TrendingDown, tone: "text-rose-500" },
    { label: "Utilidad neta", value: fmt(kpis.net_income), icon: Wallet, tone: kpis.net_income >= 0 ? "text-emerald-500" : "text-rose-500" },
    { label: "Margen", value: `${kpis.margin_pct}%`, icon: TrendingUp, tone: "text-cyan-500" },
    { label: "Efectivo", value: fmt(kpis.cash), icon: Landmark, tone: "text-amber-500" },
    { label: "CxC", value: fmt(kpis.accounts_receivable), icon: ArrowDownCircle, tone: "text-blue-500" },
    { label: "CxP", value: fmt(kpis.accounts_payable), icon: ArrowUpCircle, tone: "text-orange-500" },
    { label: "Patrimonio", value: fmt(kpis.equity), icon: Wallet, tone: "text-violet-500" },
  ];

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">KPIs Financieros (Libro Mayor)</h3>
          <p className="text-xs text-muted-foreground">
            Período: <span className="font-medium">{kpis.period_name ?? "—"}</span>
          </p>
        </div>
        <Badge variant={kpis.period_status === "open" ? "default" : "secondary"}>
          {kpis.period_status ?? "—"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border bg-card/50 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <t.icon className={`h-3.5 w-3.5 ${t.tone}`} />
              {t.label}
            </div>
            <div className="mt-1 text-lg font-semibold">{t.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
