import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";

interface Audit {
  sales_unposted: number;
  purchases_unposted: number;
  returns_unposted: number;
  payrolls_unposted: number;
  payments_unposted: number;
  unbalanced_entries: number;
  total_entries: number;
  total_debit: number;
  total_credit: number;
}

const fmt = (n: number) => `$${(n || 0).toLocaleString("es-CU", { maximumFractionDigits: 2 })}`;

export function AccountingAuditPanel() {
  const tenantId = useTenant();
  const [data, setData] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await supabase
      .rpc("accounting_audit_summary", { p_tenant_id: tenantId })
      .single();
    setData((data as unknown as Audit) ?? null);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) {
    return <Card className="p-5"><Skeleton className="h-28 w-full" /></Card>;
  }

  const issues =
    data.sales_unposted + data.purchases_unposted + data.returns_unposted +
    data.payrolls_unposted + data.payments_unposted + data.unbalanced_entries;
  const diff = Number(data.total_debit) - Number(data.total_credit);

  const rows = [
    { label: "Ventas sin asiento", value: data.sales_unposted },
    { label: "Compras sin asiento", value: data.purchases_unposted },
    { label: "Devoluciones sin asiento", value: data.returns_unposted },
    { label: "Nóminas sin asiento", value: data.payrolls_unposted },
    { label: "Pagos sin asiento", value: data.payments_unposted },
    { label: "Asientos descuadrados", value: data.unbalanced_entries },
  ];

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Auditoría Contable</h3>
          <p className="text-xs text-muted-foreground">
            Trazabilidad de comprobantes y cuadre del libro mayor
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={issues === 0 ? "default" : "destructive"} className="gap-1">
            {issues === 0
              ? <><CheckCircle2 className="h-3.5 w-3.5" /> Sin gaps</>
              : <><AlertTriangle className="h-3.5 w-3.5" /> {issues} pendientes</>}
          </Badge>
          <Button size="sm" variant="outline" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg border bg-card/50 p-3">
            <div className="text-xs text-muted-foreground">{r.label}</div>
            <div className={`mt-1 text-lg font-semibold ${r.value > 0 ? "text-rose-500" : "text-emerald-500"}`}>
              {r.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 pt-2 border-t">
        <div>
          <div className="text-xs text-muted-foreground">Asientos totales</div>
          <div className="text-base font-semibold">{data.total_entries}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Total Debe</div>
          <div className="text-base font-semibold">{fmt(Number(data.total_debit))}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Total Haber</div>
          <div className="text-base font-semibold">{fmt(Number(data.total_credit))}</div>
        </div>
      </div>

      <div className={`text-xs rounded-md p-2 ${Math.abs(diff) < 0.01 ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>
        {Math.abs(diff) < 0.01
          ? "✔ Doble partida cuadrada: Debe = Haber"
          : `⚠ Diferencia Debe-Haber: ${fmt(diff)}`}
      </div>
    </Card>
  );
}
