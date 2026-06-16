import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingDown, TrendingUp, RefreshCw, Brain, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { useAgent } from "@/hooks/useAgent";


interface Baseline {
  revenue30d: number;
  cogs30d: number;
  salesCount: number;
  avgTicket: number;
}

interface Intelligence {
  abc?: { a: number; b: number; c: number };
  anomalies?: any[];
  predictions?: any[];
}

export default function DigitalTwin() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [intel, setIntel] = useState<Intelligence | null>(null);
  const [priceChange, setPriceChange] = useState(0);
  const [costChange, setCostChange] = useState(0);
  const [demandChange, setDemandChange] = useState(0);

  const loadBaseline = async () => {
    if (!tenantId) return;
    const since = new Date(Date.now() - 30 * 86400000).toISOString();

    const [salesRes, itemsRes] = await Promise.all([
      supabase
        .from("sales")
        .select("id, total, status, created_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", since)
        .in("status", ["paid", "partial"]),
      supabase
        .from("sale_items")
        .select("qty, product_id, products!inner(cost, tenant_id), sales!inner(tenant_id, status, created_at)")
        .gte("created_at", since)
        .limit(5000),
    ]);

    const sales = salesRes.data ?? [];
    const revenue30d = sales.reduce((s, x: any) => s + Number(x.total || 0), 0);
    const salesCount = sales.length;
    const items = (itemsRes.data ?? []).filter(
      (i: any) => i.sales?.tenant_id === tenantId && ["paid", "partial"].includes(i.sales?.status),
    );
    const cogs30d = items.reduce(
      (s, i: any) => s + Number(i.qty || 0) * Number(i.products?.cost || 0),
      0,
    );
    setBaseline({
      revenue30d,
      cogs30d,
      salesCount,
      avgTicket: salesCount > 0 ? revenue30d / salesCount : 0,
    });
  };

  const loadIntelligence = async () => {
    if (!tenantId) return;
    try {
      const { data, error } = await supabase.functions.invoke("inventory-intelligence", {
        body: { tenant_id: tenantId, mode: "all" },
      });
      if (error) throw error;
      setIntel(data ?? null);
    } catch (e: any) {
      console.warn("inventory-intelligence error", e);
    }
  };

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    Promise.all([loadBaseline(), loadIntelligence()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([loadBaseline(), loadIntelligence()]);
    setRefreshing(false);
    toast({ title: "Gemelo actualizado", description: "Datos reales recargados" });
  };

  const sim = useMemo(() => {
    if (!baseline) return null;
    const projRevenue = baseline.revenue30d * (1 + priceChange / 100) * (1 + demandChange / 100);
    const projCost = baseline.cogs30d * (1 + costChange / 100) * (1 + demandChange / 100);
    const baseProfit = baseline.revenue30d - baseline.cogs30d;
    const projProfit = projRevenue - projCost;
    return { projRevenue, projCost, baseProfit, projProfit, delta: projProfit - baseProfit };
  }, [baseline, priceChange, costChange, demandChange]);

  return (
    <AppLayout title="Digital Twin">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Gemelo digital del tenant: usa ventas reales de los últimos 30 días e inteligencia de inventario para simular escenarios.
          </p>
          <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Recargar datos
          </Button>
        </div>

        {/* Baseline */}
        <div className="grid gap-4 md:grid-cols-4">
          <Stat label="Ingresos 30d" value={baseline?.revenue30d} loading={loading} />
          <Stat label="COGS 30d" value={baseline?.cogs30d} loading={loading} />
          <Stat label="Tickets" value={baseline?.salesCount} loading={loading} integer />
          <Stat label="Ticket promedio" value={baseline?.avgTicket} loading={loading} />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Variables de simulación
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs">Cambio de precio (%)</Label>
                <Input type="number" value={priceChange} onChange={(e) => setPriceChange(+e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Cambio de costo (%)</Label>
                <Input type="number" value={costChange} onChange={(e) => setCostChange(+e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Cambio de demanda (%)</Label>
                <Input type="number" value={demandChange} onChange={(e) => setDemandChange(+e.target.value)} />
              </div>
              <p className="text-[11px] text-muted-foreground pt-2">
                Base = últimos 30 días reales (sin demo). Modifica las variables para proyectar el siguiente período.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-primary/10 via-card to-card border-primary/20">
            <CardHeader>
              <CardTitle className="text-base">Resultado proyectado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading || !sim || !baseline ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <>
                  <Row label="Ingresos" base={baseline.revenue30d} proj={sim.projRevenue} />
                  <Row label="Costos" base={baseline.cogs30d} proj={sim.projCost} invert />
                  <div className="pt-3 border-t border-border/40">
                    <Row label="Utilidad" base={sim.baseProfit} proj={sim.projProfit} highlight />
                    <div
                      className={`mt-2 inline-flex items-center gap-1 text-sm font-semibold ${
                        sim.delta >= 0 ? "text-emerald-500" : "text-red-500"
                      }`}
                    >
                      {sim.delta >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                      Δ ${sim.delta.toFixed(2)} (
                      {((sim.delta / Math.abs(sim.baseProfit || 1)) * 100).toFixed(1)}%)
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Intelligence */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" /> Inteligencia de inventario
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : !intel ? (
              <p className="text-sm text-muted-foreground">Sin datos disponibles.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Clasificación ABC</p>
                  <div className="flex gap-2">
                    <Badge variant="secondary">A: {intel.abc?.a ?? 0}</Badge>
                    <Badge variant="secondary">B: {intel.abc?.b ?? 0}</Badge>
                    <Badge variant="secondary">C: {intel.abc?.c ?? 0}</Badge>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Anomalías detectadas</p>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-semibold">{intel.anomalies?.length ?? 0}</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Predicciones generadas</p>
                  <span className="text-sm font-semibold">{intel.predictions?.length ?? 0}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function Stat({ label, value, loading, integer }: { label: string; value?: number; loading: boolean; integer?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading || value === undefined ? (
          <Skeleton className="h-7 w-24 mt-1" />
        ) : (
          <p className="text-xl font-bold font-mono">
            {integer ? Math.round(value) : `$${value.toFixed(2)}`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, base, proj, invert, highlight }: any) {
  const positive = invert ? proj < base : proj > base;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="text-right">
        <p
          className={`font-mono ${highlight ? "text-base font-bold" : ""} ${
            positive ? "text-emerald-500" : "text-red-500"
          }`}
        >
          ${proj.toFixed(2)}
        </p>
        <p className="text-[10px] text-muted-foreground">base ${base.toFixed(2)}</p>
      </div>
    </div>
  );
}
