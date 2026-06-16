import { AppLayout } from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { useAgent } from "@/hooks/useAgent";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, TrendingUp, AlertTriangle, ArrowRightLeft, Sparkles, Loader2, RefreshCw, Package } from "lucide-react";
import { motion } from "framer-motion";

interface Result {
  generated_at: string;
  counts: { products: number; stockout_risk: number; slow_movers: number; rebalance: number };
  abc: any[];
  stockout_risk: any[];
  slow_movers: any[];
  top_profit: any[];
  rebalance: any[];
  ai_summary: string | null;
}

export default function InventoryIntelligence() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data: res, error } = await supabase.functions.invoke("inventory-intelligence", {
      body: { tenant_id: tenantId, mode: "all" },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setData(res as Result);
  };

  useEffect(() => { if (tenantId) run(); }, [tenantId]);

  return (
    <AppLayout title="Inteligencia de Inventario">
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" /> Predicciones y análisis
            </h2>
            <p className="text-xs text-muted-foreground">Predicción de demanda, ABC, anomalías y rebalanceo entre ubicaciones</p>
          </div>
          <Button onClick={run} disabled={loading} size="sm" className="gap-1">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Recalcular
          </Button>
        </div>

        {data?.ai_summary && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-xl bg-gradient-to-br from-primary/10 via-accent/5 to-transparent border border-primary/20">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="text-xs leading-relaxed whitespace-pre-wrap">{data.ai_summary}</div>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPI icon={<Package className="h-4 w-4" />} label="Productos" value={data?.counts.products ?? 0} />
          <KPI icon={<AlertTriangle className="h-4 w-4 text-warning" />} label="Riesgo quiebre" value={data?.counts.stockout_risk ?? 0} variant="warn" />
          <KPI icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />} label="Baja rotación" value={data?.counts.slow_movers ?? 0} />
          <KPI icon={<ArrowRightLeft className="h-4 w-4 text-primary" />} label="Sugerencias rebalanceo" value={data?.counts.rebalance ?? 0} />
        </div>

        <Tabs defaultValue="risk">
          <TabsList className="grid grid-cols-4 w-full max-w-2xl">
            <TabsTrigger value="risk" className="text-xs">Riesgo quiebre</TabsTrigger>
            <TabsTrigger value="abc" className="text-xs">Análisis ABC</TabsTrigger>
            <TabsTrigger value="slow" className="text-xs">Baja rotación</TabsTrigger>
            <TabsTrigger value="rebalance" className="text-xs">Rebalanceo</TabsTrigger>
          </TabsList>

          <TabsContent value="risk">
            <DataList rows={(data?.stockout_risk || []).map((p) => ({
              title: p.name,
              subtitle: `Stock: ${p.stock} · Demanda diaria: ${p.daily_demand.toFixed(2)}`,
              right: <Badge variant="destructive" className="text-[10px]">{p.days_of_cover.toFixed(1)} días</Badge>,
            }))} empty="Sin productos en riesgo" />
          </TabsContent>

          <TabsContent value="abc">
            <DataList rows={(data?.abc || []).slice(0, 30).map((p) => ({
              title: p.name,
              subtitle: `Ingresos: $${p.revenue.toFixed(0)} · ${(p.revenue_share * 100).toFixed(1)}%`,
              right: <Badge className={`text-[10px] ${p.abc_class === 'A' ? 'bg-success/15 text-success border-success/20' : p.abc_class === 'B' ? 'bg-warning/15 text-warning border-warning/20' : 'bg-muted text-muted-foreground'}`}>{p.abc_class}</Badge>,
            }))} empty="Sin datos suficientes" />
          </TabsContent>

          <TabsContent value="slow">
            <DataList rows={(data?.slow_movers || []).map((p) => ({
              title: p.name,
              subtitle: `Sin ventas en 60 días`,
              right: <Badge variant="outline" className="text-[10px]">{p.stock} en stock</Badge>,
            }))} empty="Todo rotando bien" />
          </TabsContent>

          <TabsContent value="rebalance">
            <DataList rows={(data?.rebalance || []).map((r) => ({
              title: r.product_name,
              subtitle: `${r.from} → ${r.to}`,
              right: <Badge className="text-[10px] bg-primary/15 text-primary">Sugerir {r.suggested_qty}</Badge>,
            }))} empty="Distribución equilibrada" />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function KPI({ icon, label, value, variant }: any) {
  return (
    <Card className={`p-3 ${variant === 'warn' ? 'border-warning/30' : ''}`}>
      <div className="flex items-center gap-2 text-muted-foreground text-[11px]">{icon} {label}</div>
      <p className="font-heading text-2xl font-bold mt-1">{value}</p>
    </Card>
  );
}

function DataList({ rows, empty }: { rows: { title: string; subtitle: string; right: any }[]; empty: string }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground py-8 text-center">{empty}</p>;
  return (
    <div className="mt-3 divide-y border rounded-lg overflow-hidden bg-card">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between p-3 hover:bg-muted/30">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{r.title}</p>
            <p className="text-[11px] text-muted-foreground truncate">{r.subtitle}</p>
          </div>
          <div className="shrink-0">{r.right}</div>
        </div>
      ))}
    </div>
  );
}
