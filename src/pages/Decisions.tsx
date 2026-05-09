import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Brain, Check, X } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export default function Decisions() {
  const { tenantId } = useTenantContext();
  const [items, setItems] = useState<any[]>([]);
  const load = async () => {
    if (!tenantId) return;
    const { data } = await supabase.from("business_decisions").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100);
    setItems(data ?? []);
  };
  useEffect(() => { load(); }, [tenantId]);

  const setStatus = async (id: string, status: "approved" | "rejected" | "executed" | "pending" | "failed") => {
    const { error } = await supabase.from("business_decisions").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Decisión actualizada"); load(); }
  };

  return (
    <AppLayout title="Motor de decisiones">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Recomendaciones generadas por agentes. Aprueba, rechaza o revisa.</p>
        {items.length === 0 && <Card><CardContent className="py-12 text-center text-sm text-muted-foreground"><Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />Sin decisiones aún.</CardContent></Card>}
        {items.map((d) => {
          const rec = d.recommendation as any;
          return (
            <Card key={d.id} className="border-border/50">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base">{d.title}</CardTitle>
                  <Badge variant={d.status === "pending" ? "secondary" : d.status === "executed" || d.status === "approved" ? "default" : "destructive"}>{d.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(d.created_at), { locale: es, addSuffix: true })}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {rec?.insights && (
                  <div><p className="text-xs font-semibold mb-1 text-muted-foreground">Insights</p><ul className="text-sm space-y-1 list-disc list-inside">{rec.insights.map((i: string, k: number) => <li key={k}>{i}</li>)}</ul></div>
                )}
                {rec?.recommendations && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">Recomendaciones</p>
                    {rec.recommendations.map((r: any, k: number) => (
                      <div key={k} className="p-3 rounded-lg border border-border/50 bg-card/40">
                        <div className="flex items-center gap-2 mb-1"><Badge className="text-[9px]">{r.priority}</Badge><p className="text-sm font-medium">{r.title}</p></div>
                        <p className="text-xs text-muted-foreground">{r.rationale}</p>
                      </div>
                    ))}
                  </div>
                )}
                {d.status === "pending" && (
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={() => setStatus(d.id, "approved")} className="gap-1"><Check className="h-3.5 w-3.5" /> Aprobar</Button>
                    <Button size="sm" variant="outline" onClick={() => setStatus(d.id, "rejected")} className="gap-1"><X className="h-3.5 w-3.5" /> Rechazar</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppLayout>
  );
}
