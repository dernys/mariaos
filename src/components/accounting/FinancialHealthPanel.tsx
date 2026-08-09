import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface HealthRow {
  area: string;
  check_name: string;
  status: "PASS" | "WARNING" | "CRITICAL" | string;
  metric: number | null;
  detail: string;
}

const AREA_LABELS: Record<string, string> = {
  chart_of_accounts: "Maestro de Cuentas",
  accounting: "Motor de partida doble",
  ledger: "Libro Mayor",
  sales: "Ventas",
  purchases: "Compras",
  payroll: "Nómina",
  accounts_payable: "Cuentas por pagar",
  accounts_receivable: "Cuentas por cobrar",
  inventory: "Inventario",
  tax: "Fiscalidad",
  multicurrency: "Multimoneda",
  security: "Aislamiento multiempresa",
  mapping: "Mapeo contable",
};

const CHECK_LABELS: Record<string, string> = {
  accounts_active: "Cuentas activas",
  hierarchy_orphans: "Jerarquía sin huérfanos",
  duplicate_codes: "Códigos únicos por empresa",
  postings_on_invalid_accounts: "Asientos sobre cuentas imputables",
  double_entry: "Debe = Haber por asiento",
  orphan_lines: "Líneas con asiento válido",
  balance_equation: "Activo = Pasivo + Patrimonio + Resultado",
  projection_rows: "Proyección del mayor",
  sales_posted: "Ventas contabilizadas",
  purchases_posted: "Compras contabilizadas",
  payroll_posted: "Nóminas contabilizadas",
  overpaid_bills: "Pagos no superiores al importe",
  negative_customer_balance: "Saldos de clientes",
  negative_stock: "Existencias no negativas",
  fiscal_rules_configured: "Perfil fiscal configurado",
  sales_fx_defined: "Moneda y tipo de cambio en ventas",
  entries_without_tenant: "Asientos con empresa asignada",
  cross_tenant_lines: "Sin cuentas de otra empresa",
  mappings_defined: "Mapeos contables definidos",
};

const statusIcon = (s: string) =>
  s === "PASS" ? <CheckCircle2 className="h-4 w-4 text-success" />
  : s === "CRITICAL" ? <XCircle className="h-4 w-4 text-destructive" />
  : <AlertTriangle className="h-4 w-4 text-warning" />;

export function FinancialHealthPanel() {
  const { tenantId } = useTenantContext();
  const [rows, setRows] = useState<HealthRow[]>([]);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!tenantId) return;
    setRunning(true);
    const { data, error } = await (supabase.rpc as any)("financial_health_check", { p_tenant: tenantId });
    setRunning(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const list = (data ?? []) as HealthRow[];
    setRows(list);
    const critical = list.filter((r) => r.status === "CRITICAL").length;
    const warning = list.filter((r) => r.status === "WARNING").length;
    if (critical > 0) toast.error(`Salud financiera CRITICAL · ${critical} incidencia(s)`);
    else if (warning > 0) toast.warning(`Salud financiera con ${warning} advertencia(s)`);
    else toast.success("Salud financiera: PASS");
  };

  const critical = rows.filter((r) => r.status === "CRITICAL").length;
  const warning = rows.filter((r) => r.status === "WARNING").length;
  const verdict = rows.length === 0 ? null : critical > 0 ? "CRITICAL" : warning > 0 ? "WARNING" : "PASS";

  const areas = Array.from(new Set(rows.map((r) => r.area)));

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Centro de Control Financiero
          </h3>
          <p className="text-xs text-muted-foreground">
            Diagnóstico transversal: plan de cuentas, partida doble, mayor, módulos operativos, fiscalidad,
            multimoneda y aislamiento por empresa
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {verdict && (
            <Badge variant={verdict === "PASS" ? "default" : verdict === "CRITICAL" ? "destructive" : "secondary"}>
              {verdict}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={run} disabled={running || !tenantId}>
            {running ? "Analizando…" : "Ejecutar diagnóstico"}
          </Button>
        </div>
      </div>

      {rows.length === 0 && !running && (
        <p className="text-sm text-muted-foreground">
          Ejecuta el diagnóstico para evaluar el núcleo financiero con los datos reales de la empresa activa.
        </p>
      )}

      {areas.map((area) => (
        <div key={area} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {AREA_LABELS[area] ?? area}
          </p>
          <div className="space-y-1.5">
            {rows.filter((r) => r.area === area).map((r) => (
              <div key={`${r.area}-${r.check_name}`} className="rounded-md border p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {statusIcon(r.status)}
                    <span className="truncate">{CHECK_LABELS[r.check_name] ?? r.check_name}</span>
                  </div>
                  <Badge
                    variant={r.status === "PASS" ? "default" : r.status === "CRITICAL" ? "destructive" : "secondary"}
                  >
                    {r.status}
                  </Badge>
                </div>
                <p className="pl-6 text-xs text-muted-foreground">{r.detail}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </Card>
  );
}
