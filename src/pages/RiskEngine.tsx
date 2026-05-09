import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Loader2, Shield, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export default function RiskEngine() {
  const { tenantId } = useTenantContext();
  const [items, setItems] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);

  const load = async () => {
    if (!tenantId) return;
    const { data } = await supabase.from("risk_alerts").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100);
    setItems(data ?? []);
  };
  useEffect(() => { load(); }, [tenantId]);

  const scan = async () => {
    if (!tenantId) return;
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("risk-scanner", { body: { tenant_id: tenantId } });
      if (error) throw error;
      toast.success(`Escaneo completado · ${data?.created ?? 0} alertas nuevas`);
      load();
    } catch (e: any) { toast.error(e?.message ?? "Error"); }
    finally { setScanning(false); }
  };

  const resolve = async (id: string) => {
    await supabase.from("risk_alerts").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id);
    load();
  };

  return (
    <AppLayout title="AI Risk Engine">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">Detección automática de fraude, pérdidas e inconsistencias.</p>
          <Button onClick={scan} disabled={scanning}>{scanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />} Escanear ahora</Button>
        </div>
        {items.length === 0 && <Card><CardContent className="py-12 text-center text-sm text-muted-foreground"><ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-50" />Sin alertas registradas.</CardContent></Card>}
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((a) => (
            <Card key={a.id} className="border-border/50">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><CardTitle className="text-sm">{a.title}</CardTitle></div>
                  <Badge variant={a.status === "open" ? "destructive" : "secondary"}>{a.status}</Badge>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <Badge variant="outline" className="text-[9px]">{a.severity}</Badge>
                  <span className="capitalize">{a.category}</span>
                  <span>· {formatDistanceToNow(new Date(a.created_at), { locale: es, addSuffix: true })}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">{a.description}</p>
                {a.status === "open" && <Button size="sm" variant="outline" onClick={() => resolve(a.id)}>Marcar resuelto</Button>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
