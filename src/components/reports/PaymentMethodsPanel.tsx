import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { KpiGrid, KpiTile } from "@/components/analytics/KpiTile";
import { methodLabel, PAYMENT_STATUS_LABEL, statusTone, type PaymentStatus } from "@/lib/finance/paymentMethods";
import { Banknote, Landmark, Smartphone, Clock } from "lucide-react";

interface Row {
  source: string;
  method: string;
  class: string;
  status: string;
  payments: number;
  total_base: number | string;
}

const toneClass: Record<string, string> = {
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  destructive: "bg-destructive/10 text-destructive border-destructive/30",
  muted: "bg-muted text-muted-foreground",
};

/** Reporte de medios de pago (ventas + cobros de deuda), tenant-scoped en servidor. */
export function PaymentMethodsPanel({ from, to }: { from?: string; to?: string }) {
  const { tenantId } = useTenantContext();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)("report_payments_by_method", {
      p_tenant: tenantId,
      p_from: from || null,
      p_to: to || null,
    });
    if (!error) setRows(((data || []) as Row[]).map((r) => ({ ...r, total_base: Number(r.total_base) })));
    setLoading(false);
  }, [tenantId, from, to]);

  useEffect(() => { load(); }, [load]);

  const sum = (f: (r: Row) => boolean) => rows.filter(f).reduce((s, r) => s + Number(r.total_base || 0), 0);
  const paid = (r: Row) => r.status.toUpperCase() === "PAID";
  const pendingStatus = (r: Row) => ["PENDING", "CREATED"].includes(r.status.toUpperCase());

  const cash = sum((r) => paid(r) && r.class === "cash");
  const bank = sum((r) => paid(r) && r.class === "bank");
  const digital = sum((r) => paid(r) && r.class === "digital");
  const pending = sum(pendingStatus);
  const salesTotal = sum((r) => paid(r) && r.source === "sale");
  const collectionsTotal = sum((r) => paid(r) && r.source === "collection");

  const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <KpiGrid>
        <KpiTile label="Efectivo cobrado" value={money(cash)} icon={Banknote} />
        <KpiTile label="Banco / tarjeta" value={money(bank)} icon={Landmark} />
        <KpiTile label="Digital confirmado" value={money(digital)} icon={Smartphone} />
        <KpiTile label="Digital por confirmar" value={money(pending)} icon={Clock} />
      </KpiGrid>


      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cobros de ventas</p>
          <p className="font-heading text-lg font-bold">{money(salesTotal)}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cobros de deuda (CxC)</p>
          <p className="font-heading text-lg font-bold">{money(collectionsTotal)}</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-xs">Origen</TableHead>
            <TableHead className="text-xs">Medio</TableHead>
            <TableHead className="text-xs">Naturaleza</TableHead>
            <TableHead className="text-xs">Estado</TableHead>
            <TableHead className="text-xs text-right">Pagos</TableHead>
            <TableHead className="text-xs text-right">Total base</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows
              .slice()
              .sort((a, b) => Number(b.total_base) - Number(a.total_base))
              .map((r, i) => (
                <TableRow key={`${r.source}-${r.method}-${r.status}-${i}`}>
                  <TableCell className="text-xs">{r.source === "sale" ? "Venta" : "Cobro CxC"}</TableCell>
                  <TableCell className="text-xs font-medium">{methodLabel(r.method)}</TableCell>
                  <TableCell className="text-xs capitalize text-muted-foreground">
                    {r.class === "cash" ? "Efectivo" : r.class === "digital" ? "Digital" : r.class === "bank" ? "Bancario" : r.class}
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className={`text-[10px] ${toneClass[statusTone(r.status)]}`}>
                      {PAYMENT_STATUS_LABEL[r.status.toUpperCase() as PaymentStatus] ?? r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-right">{r.payments}</TableCell>
                  <TableCell className="text-xs text-right font-bold">{money(Number(r.total_base))}</TableCell>
                </TableRow>
              ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                {loading ? "Cargando…" : "Sin pagos en el período"}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
