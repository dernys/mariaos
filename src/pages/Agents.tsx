import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import { AGENT_DEFINITIONS } from "@/lib/agents";
import { Bot, Loader2, PlayCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export default function Agents() {
  const { tenantId } = useTenantContext();
  const [agents, setAgents] = useState<any[]>([]);
  const [running, setRunning] = useState<string | null>(null);

  const load = async () => {
    if (!tenantId) return;
    const { data } = await supabase.from("ai_agents").select("*").eq("tenant_id", tenantId);
    setAgents(data ?? []);
  };

  useEffect(() => { load(); }, [tenantId]);

  const provision = async (def: typeof AGENT_DEFINITIONS[number]) => {
    if (!tenantId) return;
    const { error } = await supabase.from("ai_agents").insert({
      tenant_id: tenantId, type: def.type, name: def.name, description: def.description,
    });
    if (error) toast.error(error.message); else { toast.success(`${def.name} provisionado`); load(); }
  };

  const updateAgent = async (id: string, patch: any) => {
    const { error } = await supabase.from("ai_agents").update(patch).eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  const runAgent = async (agent: any) => {
    setRunning(agent.id);
    try {
      const { error, data } = await supabase.functions.invoke("agent-runner", { body: { agent_id: agent.id } });
      if (error) throw error;
      toast.success(`Análisis completado · ${data?.recommendations?.length ?? 0} recomendaciones`);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Error ejecutando agente");
    } finally { setRunning(null); }
  };

  return (
    <AppLayout title="Agentes IA">
      <div className="space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
          <Sparkles className="h-3 w-3" /> 7 agentes especializados
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {AGENT_DEFINITIONS.map((def) => {
            const agent = agents.find((a) => a.type === def.type);
            const Icon = def.icon;
            return (
              <Card key={def.type} className="border-border/50 bg-card/60 backdrop-blur overflow-hidden">
                <div className={`h-1 bg-gradient-to-r ${def.color}`} />
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${def.color} flex items-center justify-center shrink-0 shadow-lg`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{def.name}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{def.description}</p>
                      </div>
                    </div>
                    {agent && <Badge variant={agent.status === "active" ? "default" : "secondary"}>{agent.status}</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {!agent ? (
                    <Button onClick={() => provision(def)} className="w-full" variant="outline"><Bot className="h-4 w-4 mr-2" /> Provisionar agente</Button>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Activo</span>
                        <Switch checked={agent.status === "active"} onCheckedChange={(v) => updateAgent(agent.id, { status: v ? "active" : "paused" })} />
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Autonomía</span>
                        <Select value={agent.autonomy_level} onValueChange={(v) => updateAgent(agent.id, { autonomy_level: v })}>
                          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manual">Manual</SelectItem>
                            <SelectItem value="suggest">Sugerir</SelectItem>
                            <SelectItem value="auto_approve">Auto-aprobar</SelectItem>
                            <SelectItem value="autonomous">Autónomo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border/40">
                        <div><p className="text-muted-foreground text-[10px]">Análisis</p><p className="font-semibold">{(agent.metrics as any)?.runs ?? 0}</p></div>
                        <div><p className="text-muted-foreground text-[10px]">Última</p><p className="font-semibold text-[11px]">{agent.last_run_at ? formatDistanceToNow(new Date(agent.last_run_at), { locale: es, addSuffix: true }) : "—"}</p></div>
                      </div>
                      <Button onClick={() => runAgent(agent)} disabled={running === agent.id} className="w-full" size="sm">
                        {running === agent.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
                        Ejecutar análisis ahora
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
