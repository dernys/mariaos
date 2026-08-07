// Sprint D — Inteligencia predictiva: pronóstico de demanda y reposición.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PackageSearch } from "lucide-react";

interface Row {
  product_id: string;
  product_name: string;
  sku: string | null;
  stock: number;
  min_stock: number;
  avg_daily: number;
  projected_demand: number;
  days_of_stock: number | null;
  suggested_reorder: number;
}

export function DemandForecastPanel() {
  const tenantId = useTenant();
  const [horizon, setHorizon] = useState("30");

  const query = useQuery({
    queryKey: ["forecast-demand", tenantId, horizon],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.rpc("forecast_demand", {
        p_tenant: tenantId!,
        p_window: 30,
        p_horizon: Number(horizon),
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as Row[];
    },
  });

  const rows = (query.data ?? []).filter((r) => r.avg_daily > 0 || r.suggested_reorder > 0).slice(0, 50);
  const urgent = rows.filter((r) => r.days_of_stock !== null && r.days_of_stock < 7).length;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <PackageSearch className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Pronóstico de demanda</h3>
            <p className="text-xs text-muted-foreground">
              Venta media de los últimos 30 días proyectada al horizonte elegido, con sugerencia de reposición.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {urgent > 0 && <Badge variant="destructive" className="text-[10px]">{urgent} con menos de 7 días</Badge>}
          <Select value={horizon} onValueChange={setHorizon}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 días</SelectItem>
              <SelectItem value="14">14 días</SelectItem>
              <SelectItem value="30">30 días</SelectItem>
              <SelectItem value="60">60 días</SelectItem>
              <SelectItem value="90">90 días</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right hidden sm:table-cell">Venta/día</TableHead>
              <TableHead className="text-right">Demanda {horizon}d</TableHead>
              <TableHead className="text-right hidden md:table-cell">Cobertura</TableHead>
              <TableHead className="text-right">Reponer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const critical = r.days_of_stock !== null && r.days_of_stock < 7;
              return (
                <TableRow key={r.product_id} className={critical ? "bg-destructive/5" : undefined}>
                  <TableCell className="text-xs">
                    <span className="font-medium">{r.product_name}</span>
                    {r.sku && <span className="text-muted-foreground ml-1">· {r.sku}</span>}
                  </TableCell>
                  <TableCell className="text-right text-xs">{Number(r.stock).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-xs hidden sm:table-cell">{Number(r.avg_daily).toFixed(2)}</TableCell>
                  <TableCell className="text-right text-xs">{Number(r.projected_demand).toLocaleString()}</TableCell>
                  <TableCell className={`text-right text-xs hidden md:table-cell ${critical ? "text-destructive font-semibold" : ""}`}>
                    {r.days_of_stock === null ? "—" : `${r.days_of_stock} d`}
                  </TableCell>
                  <TableCell className="text-right text-xs font-semibold">
                    {Number(r.suggested_reorder) > 0 ? Number(r.suggested_reorder).toLocaleString() : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
            {query.isLoading && (
              <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Calculando…</TableCell></TableRow>
            )}
            {!query.isLoading && rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Sin ventas recientes para proyectar demanda.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
