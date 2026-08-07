import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Activity,
  AlertTriangle,
  Brain,
  Network,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDigitalTwin } from "@/modules/intelligence/ui/useDigitalTwin";
import type { Money } from "@/modules/shared/domain/money";

const RELATION_LABELS: Record<string, string> = {
  in_category: "pertenece a",
  bought: "compró",
  sold: "vendió",
  supplies: "suministra",
  operates: "opera",
};

const TYPE_LABELS: Record<string, string> = {
  product: "Productos",
  category: "Categorías",
  customer: "Clientes",
  supplier: "Proveedores",
  store: "Tiendas",
  employee: "Empleados",
};

export default function DigitalTwin() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [currency] = useState("CUP");
  const twin = useDigitalTwin(currency);
  const { baseline, simulation, scenario, patchScenario, resetScenario, stats, insights } = twin;

  const rebuild = async () => {
    try {
      const res = await twin.rebuild.mutateAsync();
      toast({
        title: "Grafo reconstruido",
        description: `${res.nodes} entidades y ${res.edges} relaciones derivadas de datos reales.`,
      });
    } catch (e) {
      toast({
        title: "No se pudo reconstruir el grafo",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  return (
    <AppLayout title={t("nav.items.digitalTwin")}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Fase 5: gemelo digital sobre datos reales. Importes tipados con <code>Money</code>, grafo de
            conocimiento y motor de simulación de escenarios.
            {baseline.staleWindow && baseline.windowTo && (
              <span className="block text-amber-500 mt-1">
                Sin ventas en los últimos {baseline.windowDays} días: se analiza la última ventana con
                actividad (hasta {new Date(baseline.windowTo).toLocaleDateString()}).
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => twin.refetch()} disabled={twin.loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${twin.loading ? "animate-spin" : ""}`} />
              Recargar
            </Button>
            <Button size="sm" onClick={rebuild} disabled={twin.rebuild.isPending}>
              <Network className={`h-4 w-4 mr-2 ${twin.rebuild.isPending ? "animate-pulse" : ""}`} />
              Reconstruir grafo
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Stat label={`Ingresos ${baseline.windowDays}d`} money={baseline.revenue} loading={twin.loading} />
          <Stat label="Ticket promedio" money={baseline.avgTicket} loading={twin.loading} />
          <Stat
            label="Margen bruto"
            text={`${baseline.grossMarginPct.toFixed(1)}%`}
            loading={twin.loading}
          />
          <Stat
            label="Runway de caja"
            text={twin.runwayDays === null ? "n/d" : `${twin.runwayDays} días`}
            loading={twin.loading}
          />
        </div>

        <Tabs defaultValue="simulacion">
          <TabsList>
            <TabsTrigger value="simulacion">Simulación</TabsTrigger>
            <TabsTrigger value="grafo">Grafo de conocimiento</TabsTrigger>
            <TabsTrigger value="senales">Señales</TabsTrigger>
          </TabsList>

          <TabsContent value="simulacion" className="mt-4">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" /> Variables del escenario
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <NumberField
                    label="Cambio de precio (%)"
                    value={scenario.priceChangePct}
                    onChange={(v) => patchScenario({ priceChangePct: v })}
                  />
                  <NumberField
                    label="Cambio de costo (%)"
                    value={scenario.costChangePct}
                    onChange={(v) => patchScenario({ costChangePct: v })}
                  />
                  <NumberField
                    label="Cambio de demanda (%)"
                    value={scenario.demandChangePct}
                    onChange={(v) => patchScenario({ demandChangePct: v })}
                  />
                  <NumberField
                    label="Cambio de gastos fijos (%)"
                    value={scenario.fixedCostChangePct}
                    onChange={(v) => patchScenario({ fixedCostChangePct: v })}
                  />
                  <NumberField
                    label="Horizonte (días)"
                    value={scenario.horizonDays}
                    onChange={(v) => patchScenario({ horizonDays: Math.max(1, v) })}
                  />
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-[11px] text-muted-foreground">
                      Base: {baseline.orders} tickets y {baseline.units} unidades reales en{" "}
                      {baseline.windowDays} días.
                    </p>
                    <Button size="sm" variant="ghost" onClick={resetScenario}>
                      Reiniciar
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-primary/10 via-card to-card border-primary/20">
                <CardHeader>
                  <CardTitle className="text-base">
                    Resultado proyectado · {simulation.horizonDays} días
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {twin.loading ? (
                    <Skeleton className="h-40 w-full" />
                  ) : (
                    <>
                      <Row label="Ingresos" base={simulation.baseRevenue} proj={simulation.projRevenue} />
                      <Row label="Costo de ventas" base={simulation.baseCogs} proj={simulation.projCogs} invert />
                      <Row
                        label="Gastos fijos"
                        base={simulation.baseFixedCosts}
                        proj={simulation.projFixedCosts}
                        invert
                      />
                      <div className="pt-3 border-t border-border/40 space-y-2">
                        <Row label="Utilidad" base={simulation.baseProfit} proj={simulation.projProfit} highlight />
                        <div
                          className={`inline-flex items-center gap-1 text-sm font-semibold ${
                            simulation.verdict === "worsens" ? "text-destructive" : "text-primary"
                          }`}
                        >
                          {simulation.verdict === "worsens" ? (
                            <TrendingDown className="h-4 w-4" />
                          ) : (
                            <TrendingUp className="h-4 w-4" />
                          )}
                          Δ {simulation.profitDelta.format()} ({simulation.profitDeltaPct.toFixed(1)}%)
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-1">
                          <span>Margen proyectado: {simulation.projMarginPct.toFixed(1)}%</span>
                          <span>Caja estimada: {simulation.projCash.format()}</span>
                          <span>
                            Equilibrio:{" "}
                            {simulation.breakevenDailyUnits === null
                              ? "n/d"
                              : `${simulation.breakevenDailyUnits} uds/día`}
                          </span>
                          <span>Concentración top 5: {twin.concentrationPct.toFixed(1)}%</span>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="grafo" className="mt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <Stat label="Entidades" text={String(stats.nodeCount)} loading={twin.loading} />
              <Stat label="Relaciones" text={String(stats.edgeCount)} loading={twin.loading} />
              <Stat label="Densidad" text={stats.density.toFixed(4)} loading={twin.loading} />
              <Stat label="Sin conexiones" text={String(stats.isolatedNodes)} loading={twin.loading} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Network className="h-4 w-4 text-primary" /> Composición del grafo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {stats.byType.length === 0 ? (
                      <span className="text-sm text-muted-foreground">
                        Grafo vacío. Pulsa «Reconstruir grafo».
                      </span>
                    ) : (
                      stats.byType.map((tp) => (
                        <Badge key={tp.type} variant="secondary">
                          {TYPE_LABELS[tp.type] ?? tp.type}: {tp.count}
                        </Badge>
                      ))
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {stats.byRelation.map((r) => (
                      <Badge key={r.relation} variant="outline">
                        {RELATION_LABELS[r.relation] ?? r.relation}: {r.count}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" /> Nodos más influyentes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Entidad</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="text-right">Grado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...twin.topProductsGraph, ...twin.topCustomersGraph].length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-sm text-muted-foreground">
                            Sin datos todavía.
                          </TableCell>
                        </TableRow>
                      ) : (
                        [...twin.topProductsGraph, ...twin.topCustomersGraph].map((n) => (
                          <TableRow key={n.id}>
                            <TableCell className="font-medium">{n.label}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {TYPE_LABELS[String(n.type)] ?? n.type}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {n.importance.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="senales" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary" /> Señales derivadas del grafo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {twin.loading ? (
                  <Skeleton className="h-24 w-full" />
                ) : insights.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Sin riesgos estructurales detectados en el grafo.
                  </p>
                ) : (
                  insights.map((i) => (
                    <div key={i.code} className="rounded-lg border border-border/60 p-3">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            i.severity === "critical"
                              ? "destructive"
                              : i.severity === "warning"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {i.code}
                        </Badge>
                        <span className="text-sm font-medium">{i.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{i.detail}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top productos por ingresos reales</CardTitle>
          </CardHeader>
          <CardContent>
            {twin.loading ? (
              <Skeleton className="h-24 w-full" />
            ) : baseline.topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin ventas en la ventana analizada.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Unidades</TableHead>
                    <TableHead className="text-right">Ingresos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {baseline.topProducts.map((p, idx) => (
                    <TableRow key={p.productId ?? idx}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right font-mono">{p.units}</TableCell>
                      <TableCell className="text-right font-mono">{p.revenue.format()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function Stat({
  label,
  money,
  text,
  loading,
}: {
  label: string;
  money?: Money;
  text?: string;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading ? (
          <Skeleton className="h-7 w-24 mt-1" />
        ) : (
          <p className="text-xl font-bold font-mono">{money ? money.format() : (text ?? "—")}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  base,
  proj,
  invert,
  highlight,
}: {
  label: string;
  base: Money;
  proj: Money;
  invert?: boolean;
  highlight?: boolean;
}) {
  const diff = proj.amount - base.amount;
  const good = invert ? diff <= 0 : diff >= 0;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={highlight ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <div className="flex items-center gap-3 font-mono">
        <span className="text-muted-foreground">{base.format()}</span>
        <span aria-hidden>→</span>
        <span className={good ? "text-primary font-semibold" : "text-destructive font-semibold"}>
          {proj.format()}
        </span>
      </div>
    </div>
  );
}
