import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { AGENT_DEFINITIONS } from "@/lib/agents";
import { ArrowLeft, Bot, Loader2, PlayCircle, Brain, Activity, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import { useAgent } from "@/hooks/useAgent";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export default function AgentDetalle() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [agent, setAgent] = useState<any>(null);
  const [actions, setActions] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [running, setRunning] = useState(false);

  const def = AGENT_DEFINITIONS.find((d) => d.type === agent?.type);

  const load = async () => {
    if (!id) return;
    const [a, ac, dc] = await Promise.all([
      supabase.from("ai_agents").select("*").eq("id", id).maybeSingle(),
      supabase.from("agent_actions").select("*").eq("agent_id", id).order("created_at", { ascending: false }).limit(50),
      supabase.from("business_decisions").select("*").eq("agent_id", id).order("created_at", { ascending: false }).limit(20),
    ]);
    setAgent(a.data);
    setActions(ac.data ?? []);
    setDecisions(dc.data ?? []);
  };

  useEffect(() => { load(); }, [id]);

  const update = async (patch: any) => {
    if (!id) return;
    const { error } = await supabase.from("ai_agents").update(patch).eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  const { invoke } = useAgent();
  const run = async () => {
    setRunning(true);
    const { data, error, correlationId, validationOk } = await invoke("agent-runner", { agent_id: id }, { notify: false });
    setRunning(false);
    if (error) { toast.error(error); return; }
    toast.success(`Análisis completado · ${(data as any)?.recommendations?.length ?? 0} recomendaciones`, {
      description: `cid: ${correlationId.slice(0, 8)}${validationOk === false ? " · validación parcial" : ""}`,
    });
    load();
  };


  if (!agent) return <AppLayout title={t("nav.items.agents")}><div className="text-sm text-muted-foreground">{t("common.loading")}</div></AppLayout>;

  const Icon = def?.icon ?? Bot;
  const metrics = (agent.metrics ?? {}) as any;
  const executed = actions.filter((a) => a.status === "executed").length;
  const pending = actions.filter((a) => a.status === "pending").length;
  const failed = actions.filter((a) => a.status === "failed").length;

  return (
    <AppLayout title={agent.name}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/agents"><Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="h-4 w-4" /> Agentes</Button></Link>
        </div>

        <Card className="border-border/50 bg-card/60 backdrop-blur overflow-hidden">
          <div className={`h-1 bg-gradient-to-r ${def?.color ?? "from-primary to-primary"}`} />
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-4">
                <div className={`h-14 w-14 rounded-xl bg-gradient-to-br ${def?.color ?? "from-primary to-primary"} flex items-center justify-center shadow-lg`}>
                  <Icon className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-heading font-bold">{agent.name}</h2>
                  <p className="text-sm text-muted-foreground max-w-2xl">{def?.description ?? agent.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant={agent.status === "active" ? "default" : "secondary"}>{agent.status}</Badge>
                    <Badge variant="outline" className="capitalize">Autonomía: {agent.autonomy_level}</Badge>
                    {agent.last_run_at && <Badge variant="outline">Última: {formatDistanceToNow(new Date(agent.last_run_at), { locale: es, addSuffix: true })}</Badge>}
                  </div>
                </div>
              </div>
              <Button onClick={run} disabled={running}>
                {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
                Ejecutar análisis
              </Button>
            </div>

            <div className="grid gap-3 grid-cols-2 md:grid-cols-4 mt-6 pt-6 border-t border-border/40">
              <Stat icon={Activity} label="Ejecuciones" value={metrics.runs ?? 0} />
              <Stat icon={CheckCircle2} label="Acciones ejecutadas" value={executed} />
              <Stat icon={Clock} label="Pendientes" value={pending} />
              <Stat icon={AlertCircle} label="Fallidas" value={failed} />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-base">Configuración</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium">Activo</p><p className="text-xs text-muted-foreground">El agente puede ejecutar análisis y emitir recomendaciones</p></div>
              <Switch checked={agent.status === "active"} onCheckedChange={(v) => update({ status: v ? "active" : "paused" })} />
            </div>
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium">Nivel de autonomía</p><p className="text-xs text-muted-foreground">Manual: solo sugiere · Autónomo: ejecuta acciones</p></div>
              <Select value={agent.autonomy_level} onValueChange={(v) => update({ autonomy_level: v })}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="suggest">Sugerir</SelectItem>
                  <SelectItem value="auto_approve">Auto-aprobar</SelectItem>
                  <SelectItem value="autonomous">Autónomo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="actions">
          <TabsList>
            <TabsTrigger value="actions" className="gap-2"><Activity className="h-3.5 w-3.5" /> Acciones ({actions.length})</TabsTrigger>
            <TabsTrigger value="decisions" className="gap-2"><Brain className="h-3.5 w-3.5" /> Decisiones ({decisions.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="actions" className="space-y-2 mt-4">
            {actions.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">Sin acciones todavía. Ejecuta un análisis.</p>}
            {actions.map((a) => (
              <Card key={a.id} className="border-border/40">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-medium truncate">{a.action_type}</p>
                        <Badge variant={a.status === "executed" ? "default" : a.status === "failed" ? "destructive" : "secondary"} className="text-[10px]">{a.status}</Badge>
                        {a.requires_approval && <Badge variant="outline" className="text-[10px]">Requiere aprobación</Badge>}
                      </div>
                      {a.payload?.rationale && <p className="text-xs text-muted-foreground line-clamp-2">{a.payload.rationale}</p>}
                      <p className="text-[11px] text-muted-foreground mt-1">{formatDistanceToNow(new Date(a.created_at), { locale: es, addSuffix: true })}</p>
                    </div>
                    {a.payload?.priority && <Badge className={priorityColor(a.payload.priority)}>{a.payload.priority}</Badge>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="decisions" className="space-y-2 mt-4">
            {decisions.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">Sin decisiones todavía.</p>}
            {decisions.map((d) => (
              <Link key={d.id} to="/decisions" className="block">
                <Card className="border-border/40 hover:border-primary/40 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{d.title}</p>
                        {d.reasoning && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{d.reasoning}</p>}
                        <p className="text-[11px] text-muted-foreground mt-1">{formatDistanceToNow(new Date(d.created_at), { locale: es, addSuffix: true })}</p>
                      </div>
                      <Badge variant={d.status === "pending" ? "secondary" : "default"} className="capitalize">{d.status}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

function Stat({ icon: Icon, label, value }: any) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center"><Icon className="h-4 w-4 text-muted-foreground" /></div>
      <div><p className="text-lg font-bold">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div>
    </div>
  );
}

function priorityColor(p: string) {
  if (p === "critical") return "bg-red-500/20 text-red-400 border-red-500/30";
  if (p === "high") return "bg-orange-500/20 text-orange-400 border-orange-500/30";
  if (p === "medium") return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  return "bg-blue-500/20 text-blue-400 border-blue-500/30";
}
