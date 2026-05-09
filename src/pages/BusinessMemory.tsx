import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Brain } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export default function BusinessMemory() {
  const { tenantId } = useTenantContext();
  const [decisions, setDecisions] = useState<any[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!tenantId) return;
    supabase.from("business_decisions").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200).then(({ data }) => setDecisions(data ?? []));
  }, [tenantId]);

  const filtered = decisions.filter((d) => !q || d.title?.toLowerCase().includes(q.toLowerCase()) || JSON.stringify(d.recommendation).toLowerCase().includes(q.toLowerCase()));

  return (
    <AppLayout title="Memoria empresarial">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Aprendizaje organizacional acumulado a partir de decisiones, resultados y eventos.</p>
        <Input placeholder="Buscar en la memoria..." value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
        {filtered.length === 0 && <Card><CardContent className="py-12 text-center text-sm text-muted-foreground"><Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />Sin recuerdos aún.</CardContent></Card>}
        <div className="space-y-3">
          {filtered.map((d) => (
            <Card key={d.id} className="border-border/50">
              <CardHeader>
                <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /><CardTitle className="text-sm">{d.title}</CardTitle></div>
                <p className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(d.created_at), { locale: es, addSuffix: true })} · estado: {d.status}</p>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground line-clamp-3">{d.reasoning ?? JSON.stringify(d.recommendation)?.slice(0, 240)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
