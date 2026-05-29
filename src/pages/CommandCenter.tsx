import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import { AGENT_DEFINITIONS } from "@/lib/agents";
import { Activity, AlertTriangle, Bot, Brain, ChevronRight, Sparkles, TrendingUp, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export default function CommandCenter() {
  const { tenantId } = useTenantContext();
  const [agents, setAgents] = useState<any[]>([]);
  const [decisions, setDecisions] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [stats, setStats] = useState({ revenue: 0, sales: 0, lowStock: 0, openShifts: 0 });

  useEffect(() => {
    if (!tenantId) return;
    const load = async () => {
      const [a, d, r, e] = await Promise.all([
        supabase.from("ai_agents").select("*").eq("tenant_id", tenantId).order("created_at"),
        supabase.from("business_decisions").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(10),
        supabase.from("risk_alerts").select("*").eq("tenant_id", tenantId).eq("status", "open").order("created_at", { ascending: false }).limit(10),
        supabase.from("business_events").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(20),
      ]);
      setAgents(a.data ?? []);
      setDecisions(d.data ?? []);
      setAlerts(r.data ?? []);
      setEvents(e.data ?? []);

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: sales } = await supabase.from("sales").select("total, status").eq("tenant_id", tenantId).gte("created_at", since);
      const revenue = sales?.filter((s: any) => s.status !== "cancelled").reduce((sum: number, s: any) => sum + Number(s.total || 0), 0) ?? 0;
      const { count: openShifts } = await supabase.from("sales_shifts").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "open");
      setStats({ revenue, sales: sales?.length ?? 0, lowStock: 0, openShifts: openShifts ?? 0 });
    };
    load();

    const ch = supabase
      .channel("os-command-center")
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_actions", filter: `tenant_id=eq.${tenantId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "risk_alerts", filter: `tenant_id=eq.${tenantId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "business_events", filter: `tenant_id=eq.${tenantId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "business_decisions", filter: `tenant_id=eq.${tenantId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tenantId]);

  const activeAgents = agents.filter((a) => a.status === "active").length;
  const pendingDecisions = decisions.filter((d) => d.status === "pending").length;
  const criticalAlerts = alerts.filter((a) => a.severity === "critical" || a.severity === "high").length;

  return (
    <AppLayout title="AI Command Center">
      <div className="space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-2">
              <Sparkles className="h-3 w-3" /> MarIA OS · Centro de mando autónomo
            </div>
            <h2 className="text-2xl font-heading font-bold tracking-tight">Sistema nervioso empresarial</h2>
            <p className="text-sm text-muted-foreground">Agentes, decisiones, riesgos y eventos en tiempo real.</p>
          </div>
          <Link to="/agents"><Button variant="outline" className="gap-2"><Bot className="h-4 w-4" /> Gestionar agentes</Button></Link>
        </div>

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={Bot} label="Agentes activos" value={`${activeAgents}/${agents.length}`} accent="from-emerald-500/20 to-emerald-500/5" />
          <KpiCard icon={Brain} label="Decisiones pendientes" value={pendingDecisions} accent="from-violet-500/20 to-violet-500/5" />
          <KpiCard icon={AlertTriangle} label="Alertas críticas" value={criticalAlerts} accent="from-amber-500/20 to-amber-500/5" />
          <KpiCard icon={TrendingUp} label="Ingresos 24h" value={`$${stats.revenue.toFixed(0)}`} sub={`${stats.sales} ventas · ${stats.openShifts} turnos`} accent="from-cyan-500/20 to-cyan-500/5" />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 border-border/50 bg-card/60 backdrop-blur">
            <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base flex items-center gap-2"><Brain className="h-4 w-4 text-primary" /> Decisiones recientes</CardTitle><Link to="/decisions" className="text-xs text-primary hover:underline">Ver todo</Link></CardHeader>
            <CardContent className="space-y-2">
              {decisions.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">Aún no hay decisiones. Activa un agente.</p>}
              {decisions.slice(0, 6).map((d) => (
                <Link key={d.id} to="/decisions" className="block p-3 rounded-lg border border-border/40 hover:border-primary/40 hover:bg-accent/40 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{d.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(d.created_at), { addSuffix: true, locale: es })}</p>
                    </div>
                    <Badge variant={d.status === "pending" ? "secondary" : "default"} className="capitalize text-[10px]">{d.status}</Badge>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/60 backdrop-blur">
            <CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Riesgos activos</CardTitle><Link to="/risk" className="text-xs text-primary hover:underline">Ver todo</Link></CardHeader>
            <CardContent className="space-y-2">
              {alerts.length === 0 && <p className="text-sm text-muted-foreground py-8 text-center">Sin alertas abiertas.</p>}
              {alerts.slice(0, 6).map((a) => (
                <div key={a.id} className="p-2.5 rounded-lg border border-border/40">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={severityColor(a.severity)}>{a.severity}</Badge>
                    <span className="text-[10px] text-muted-foreground capitalize">{a.category}</span>
                  </div>
                  <p className="text-xs font-medium leading-tight">{a.title}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/50 bg-card/60 backdrop-blur">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Feed de actividad empresarial</CardTitle></CardHeader>
          <CardContent>
            {events.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Aún no hay eventos.</p>}
            <div className="space-y-1.5">
              {events.slice(0, 12).map((e) => (
                <div key={e.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-border/30 last:border-0">
                  <Zap className="h-3 w-3 text-primary shrink-0" />
                  <span className="font-mono text-muted-foreground shrink-0">{new Date(e.created_at).toLocaleTimeString()}</span>
                  <Badge variant="outline" className="text-[9px]">{e.source}</Badge>
                  <span className="font-medium truncate">{e.event_type}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-gradient-to-br from-primary/5 via-card to-card backdrop-blur">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /> Agentes en operación</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {AGENT_DEFINITIONS.map((def) => {
                const a = agents.find((x) => x.type === def.type);
                const Icon = def.icon;
                return (
                  <Link key={def.type} to="/agents" className="group p-4 rounded-xl border border-border/50 hover:border-primary/40 transition-all bg-card/40 hover:bg-card/80">
                    <div className="flex items-start justify-between mb-2">
                      <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${def.color} flex items-center justify-center shadow-lg`}><Icon className="h-4 w-4 text-white" /></div>
                      <Badge variant={a?.status === "active" ? "default" : "secondary"} className="text-[9px]">{a?.status ?? "no provisto"}</Badge>
                    </div>
                    <p className="text-sm font-semibold">{def.name}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{def.description}</p>
                    <div className="flex items-center gap-1 text-[10px] text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Configurar <ChevronRight className="h-3 w-3" /></div>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

function KpiCard({ icon: Icon, label, value, sub, accent }: any) {
  return (
    <Card className={`border-border/50 bg-gradient-to-br ${accent} backdrop-blur`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <Icon className="h-4 w-4 text-foreground/70" />
        </div>
        <p className="text-2xl font-heading font-bold tracking-tight">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function severityColor(s: string) {
  if (s === "critical") return "bg-red-500/20 text-red-400 border-red-500/30";
  if (s === "high") return "bg-orange-500/20 text-orange-400 border-orange-500/30";
  if (s === "medium") return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  return "bg-blue-500/20 text-blue-400 border-blue-500/30";
}
