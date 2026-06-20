import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, AlertTriangle, PlayCircle } from "lucide-react";
import { toast } from "sonner";

interface Row { check_name: string; status: string; detail: string; }

const icon = (s: string) =>
  s === "pass" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
  : s === "fail" ? <XCircle className="h-4 w-4 text-rose-500" />
  : <AlertTriangle className="h-4 w-4 text-amber-500" />;

const labels: Record<string, string> = {
  accounting_profile: "Perfil contable",
  chart_of_accounts: "Plan de cuentas",
  fiscal_periods: "Períodos fiscales",
  posting_rules: "Reglas de posteo",
  ledger_balance: "Cuadre del libro mayor",
  operational_triggers: "Triggers operativos",
  financial_events: "Eventos financieros",
};

export function SmokeTestPanel() {
  const tenantId = useTenant();
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!tenantId) return;
    setRunning(true);
    const { data, error } = await supabase.rpc("smoke_test_financial_core", { p_tenant: tenantId });
    setRunning(false);
    if (error) { toast.error(error.message); return; }
    setRows((data as Row[]) ?? []);
    const failed = (data as Row[])?.filter(r => r.status === "fail").length ?? 0;
    if (failed === 0) toast.success("Financial Core OK"); else toast.warning(`${failed} validaciones fallaron`);
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Smoke Test · Motor Financiero</h3>
          <p className="text-xs text-muted-foreground">Validación end-to-end del Financial Core</p>
        </div>
        <Button size="sm" onClick={run} disabled={running}>
          <PlayCircle className="h-4 w-4 mr-1" />
          {running ? "Ejecutando…" : "Ejecutar"}
        </Button>
      </div>
      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.check_name} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <div className="flex items-center gap-2">
                {icon(r.status)}
                <span>{labels[r.check_name] ?? r.check_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{r.detail}</span>
                <Badge variant={r.status === "pass" ? "default" : r.status === "fail" ? "destructive" : "secondary"}>
                  {r.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
