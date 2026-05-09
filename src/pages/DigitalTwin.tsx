import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, TrendingDown, TrendingUp } from "lucide-react";

export default function DigitalTwin() {
  const [inputs, setInputs] = useState({ priceChange: 0, costChange: 0, demandChange: 0, baseRevenue: 10000, baseCost: 6000 });
  const projRevenue = inputs.baseRevenue * (1 + inputs.priceChange / 100) * (1 + inputs.demandChange / 100);
  const projCost = inputs.baseCost * (1 + inputs.costChange / 100) * (1 + inputs.demandChange / 100);
  const projProfit = projRevenue - projCost;
  const baseProfit = inputs.baseRevenue - inputs.baseCost;
  const delta = projProfit - baseProfit;

  return (
    <AppLayout title="Digital Twin">
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Gemelo digital empresarial: simula escenarios y predice impacto financiero.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Variables de simulación</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label className="text-xs">Ingresos base ($)</Label><Input type="number" value={inputs.baseRevenue} onChange={(e) => setInputs({ ...inputs, baseRevenue: +e.target.value })} /></div>
              <div><Label className="text-xs">Costos base ($)</Label><Input type="number" value={inputs.baseCost} onChange={(e) => setInputs({ ...inputs, baseCost: +e.target.value })} /></div>
              <div><Label className="text-xs">Cambio de precio (%)</Label><Input type="number" value={inputs.priceChange} onChange={(e) => setInputs({ ...inputs, priceChange: +e.target.value })} /></div>
              <div><Label className="text-xs">Cambio de costo (%)</Label><Input type="number" value={inputs.costChange} onChange={(e) => setInputs({ ...inputs, costChange: +e.target.value })} /></div>
              <div><Label className="text-xs">Cambio de demanda (%)</Label><Input type="number" value={inputs.demandChange} onChange={(e) => setInputs({ ...inputs, demandChange: +e.target.value })} /></div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-primary/10 via-card to-card border-primary/20">
            <CardHeader><CardTitle className="text-base">Resultado proyectado</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Row label="Ingresos" base={inputs.baseRevenue} proj={projRevenue} />
              <Row label="Costos" base={inputs.baseCost} proj={projCost} invert />
              <div className="pt-3 border-t border-border/40">
                <Row label="Utilidad" base={baseProfit} proj={projProfit} highlight />
                <div className={`mt-2 inline-flex items-center gap-1 text-sm font-semibold ${delta >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {delta >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  Δ ${delta.toFixed(2)} ({((delta / Math.abs(baseProfit || 1)) * 100).toFixed(1)}%)
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}

function Row({ label, base, proj, invert, highlight }: any) {
  const positive = invert ? proj < base : proj > base;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="text-right">
        <p className={`font-mono ${highlight ? "text-base font-bold" : ""} ${positive ? "text-emerald-500" : "text-red-500"}`}>${proj.toFixed(2)}</p>
        <p className="text-[10px] text-muted-foreground">base ${base.toFixed(2)}</p>
      </div>
    </div>
  );
}
