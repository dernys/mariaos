// Sprint D — Inteligencia predictiva: pronóstico de tesorería por semanas.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useBaseCurrency } from "@/hooks/useFiscalRules";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { format, parseISO } from "date-fns";

interface Row {
  week_start: string;
  inflow: number;
  outflow: number;
  net: number;
  running_balance: number;
  is_shortfall: boolean;
}

export function CashflowForecastPanel({ weeks = 8 }: { weeks?: number }) {
  const tenantId = useTenant();
  const { code } = useBaseCurrency();

  const query = useQuery({
    queryKey: ["forecast-cashflow", tenantId, weeks],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.rpc("forecast_cashflow", { p_tenant: tenantId!, p_weeks: weeks });
      if (error) throw new Error(error.message);
      return (data ?? []) as Row[];
    },
  });

  const rows = query.data ?? [];
  const shortfall = rows.find((r) => r.is_shortfall);
  const fmt = (n: number) => `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${code}`;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Pronóstico de tesorería · {weeks} semanas</h3>
            <p className="text-xs text-muted-foreground">
              Saldo bancario actual proyectado con cobros de facturas, pagos a proveedores y previsiones.
            </p>
          </div>
        </div>
        {shortfall && (
          <Badge variant="destructive" className="gap-1 text-[10px]">
            <AlertTriangle className="h-3 w-3" />
            Descubierto previsto el {format(parseISO(shortfall.week_start), "dd/MM")}
          </Badge>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Semana</TableHead>
              <TableHead className="text-right">Cobros</TableHead>
              <TableHead className="text-right">Pagos</TableHead>
              <TableHead className="text-right">Neto</TableHead>
              <TableHead className="text-right">Saldo proyectado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.week_start} className={r.is_shortfall ? "bg-destructive/5" : undefined}>
                <TableCell className="text-xs font-medium">{format(parseISO(r.week_start), "dd/MM/yyyy")}</TableCell>
                <TableCell className="text-right text-xs text-emerald-500">{fmt(r.inflow)}</TableCell>
                <TableCell className="text-right text-xs text-destructive">{fmt(r.outflow)}</TableCell>
                <TableCell className={`text-right text-xs ${Number(r.net) < 0 ? "text-destructive" : ""}`}>{fmt(r.net)}</TableCell>
                <TableCell className={`text-right text-xs font-semibold ${r.is_shortfall ? "text-destructive" : ""}`}>
                  {fmt(r.running_balance)}
                </TableCell>
              </TableRow>
            ))}
            {query.isLoading && (
              <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Calculando…</TableCell></TableRow>
            )}
            {!query.isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Sin datos suficientes para proyectar.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
