import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle, Info, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface CertRow {
  check_name: string;
  status: string;
  expected: number | null;
  actual: number | null;
  detail: string;
}

const LABELS: Record<string, string> = {
  double_entry_global: "Partida doble (global)",
  double_entry_per_entry: "Partida doble (por asiento)",
  balance_equation: "Activo = Pasivo + Patrimonio + Resultado",
  net_income: "Resultado del ejercicio",
  journal_tenant_scope: "Aislamiento multi-empresa de asientos",
  sales_posted: "Ventas contabilizadas",
  purchases_posted: "Compras contabilizadas",
  sale_totals: "Cuadre de totales de venta",
  sale_lines_match: "Cuadre de líneas de venta",
  accounts_payable_consistency: "Coherencia de cuentas por pagar",
  fx_consistency: "Coherencia multimoneda",
  inventory_continuity: "Continuidad de inventario",
};

const icon = (s: string) =>
  s === "pass" ? <CheckCircle2 className="h-4 w-4 text-success" />
  : s === "fail" ? <XCircle className="h-4 w-4 text-destructive" />
  : s === "info" ? <Info className="h-4 w-4 text-muted-foreground" />
  : <AlertTriangle className="h-4 w-4 text-warning" />;

const fmt = (n: number | null) =>
  n === null || n === undefined ? "—" : new Intl.NumberFormat("es-CU", { maximumFractionDigits: 2 }).format(Number(n));

export function FinancialCertificationPanel() {
  const { tenantId } = useTenantContext();
  const [rows, setRows] = useState<CertRow[]>([]);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!tenantId) return;
    setRunning(true);
    const { data, error } = await (supabase.rpc as any)("certify_financial_integrity", { p_tenant: tenantId });
    setRunning(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const list = (data ?? []) as CertRow[];
    setRows(list);
    const failed = list.filter((r) => r.status === "fail").length;
    const warned = list.filter((r) => r.status === "warn").length;
    if (failed === 0 && warned === 0) toast.success("Certificación financiera: PASS");
    else if (failed === 0) toast.warning(`Certificación con ${warned} advertencia(s)`);
    else toast.error(`Certificación FAIL · ${failed} invariante(s) incumplida(s)`);
  };

  const failed = rows.filter((r) => r.status === "fail").length;
  const verdict = rows.length === 0 ? null : failed === 0 ? "PASS" : "FAIL";

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Certificación de Integridad Financiera
          </h3>
          <p className="text-xs text-muted-foreground">
            Valida partida doble, ecuación patrimonial, trazabilidad de ventas y compras, multimoneda e inventario
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {verdict && (
            <Badge variant={verdict === "PASS" ? "default" : "destructive"}>{verdict}</Badge>
          )}
          <Button size="sm" onClick={run} disabled={running || !tenantId}>
            {running ? "Certificando…" : "Certificar"}
          </Button>
        </div>
      </div>

      {rows.length === 0 && !running && (
        <p className="text-sm text-muted-foreground">
          Ejecuta la certificación para validar el motor financiero con los datos reales de la empresa activa.
        </p>
      )}

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.check_name} className="rounded-md border p-2.5 text-sm space-y-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {icon(r.status)}
                  <span className="truncate">{LABELS[r.check_name] ?? r.check_name}</span>
                </div>
                <Badge
                  variant={r.status === "pass" ? "default" : r.status === "fail" ? "destructive" : "secondary"}
                >
                  {r.status}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-6 text-xs text-muted-foreground">
                <span>{r.detail}</span>
                <span>esperado: <span className="font-mono">{fmt(r.expected)}</span></span>
                <span>real: <span className="font-mono">{fmt(r.actual)}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
