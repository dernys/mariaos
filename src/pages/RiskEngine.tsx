import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle, Boxes, CheckCircle2, DollarSign, Loader2, RotateCcw, Shield,
  ShieldAlert, ShieldCheck, Sparkles, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useAgent } from "@/hooks/useAgent";

type RiskAlert = {
  id: string;
  severity: "low" | "medium" | "high" | "critical" | string;
  category: string;
  title: string;
  description: string | null;
  status: string;
  metadata: Record<string, any> | null;
  created_at: string;
  resolved_at: string | null;
};

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/40",
  high: "bg-amber-500/15 text-amber-600 border-amber-500/40 dark:text-amber-400",
  medium: "bg-primary/15 text-primary border-primary/40",
  low: "bg-muted text-muted-foreground border-border",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Crítico", high: "Alto", medium: "Medio", low: "Bajo",
};

const CATEGORY_META: Record<string, { label: string; icon: typeof DollarSign }> = {
  financial: { label: "Financiero", icon: DollarSign },
  fraud: { label: "Fraude / Caja", icon: ShieldAlert },
  loss: { label: "Pérdidas", icon: Boxes },
  operational: { label: "Operaciones", icon: TrendingUp },
  compliance: { label: "Cumplimiento", icon: ShieldCheck },
};

export default function RiskEngine() {
  const { t } = useTranslation();
  const { tenantId } = useTenantContext();
  const [items, setItems] = useState<RiskAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [severity, setSeverity] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("open");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const { invoke, isRunning } = useAgent();
  const scanning = isRunning("risk-scanner");

  const load = async () => {
    if (!tenantId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("risk_alerts")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setItems(((data ?? []) as unknown) as RiskAlert[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);

  // Realtime: las alertas creadas por el escáner aparecen al instante
  useEffect(() => {
    if (!tenantId) return;
    const channel = supabase
      .channel(`risk-alerts-${tenantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "risk_alerts", filter: `tenant_id=eq.${tenantId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId]);

  const scan = async () => {
    if (!tenantId) return;
    const { data, error } = await invoke<any>("risk-scanner", { tenant_id: tenantId, ai: true });
    if (error) return;
    setAiSummary(data?.ai_summary ?? null);
    setLastScan(data?.scanned_at ?? new Date().toISOString());
    const parts = [
      `${data?.detected ?? 0} riesgos detectados`,
      `${data?.created ?? 0} nuevos`,
      `${data?.updated ?? 0} actualizados`,
    ];
    if ((data?.auto_resolved ?? 0) > 0) parts.push(`${data.auto_resolved} resueltos automáticamente`);
    toast.success(parts.join(" · "));
    if (data?.ai_enabled === false) toast.info("Análisis de IA no disponible: se mostraron reglas deterministas.");
    await load();
  };

  const setAlertStatus = async (id: string, next: "open" | "resolved") => {
    const { error } = await supabase
      .from("risk_alerts")
      .update({ status: next, resolved_at: next === "resolved" ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(next === "resolved" ? "Riesgo marcado como resuelto" : "Riesgo reabierto");
    load();
  };

  const filtered = useMemo(() => {
    return items
      .filter((a) => (status === "all" ? true : a.status === status))
      .filter((a) => (severity === "all" ? true : a.severity === severity))
      .filter((a) => (category === "all" ? true : a.category === category))
      .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
  }, [items, status, severity, category]);

  const open = items.filter((a) => a.status === "open");
  const counts = {
    critical: open.filter((a) => a.severity === "critical").length,
    high: open.filter((a) => a.severity === "high").length,
    medium: open.filter((a) => a.severity === "medium").length,
    resolved: items.filter((a) => a.status === "resolved").length,
  };
  const categories = Array.from(new Set(items.map((a) => a.category)));

  const riskScore = Math.max(
    0,
    100 - (counts.critical * 25 + counts.high * 12 + counts.medium * 5),
  );

  return (
    <AppLayout title={t("nav.items.risks")}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">
            Motor de riesgo sobre datos reales de la empresa: caja, inventario, crédito, contabilidad y cumplimiento.
          </p>
          <Button onClick={scan} disabled={scanning || !tenantId}>
            {scanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Shield className="h-4 w-4 mr-2" />}
            {scanning ? "Analizando con IA…" : "Escanear ahora"}
          </Button>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Índice de riesgo</p><p className="text-2xl font-bold">{riskScore}<span className="text-sm text-muted-foreground">/100</span></p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Críticos abiertos</p><p className="text-2xl font-bold text-destructive">{counts.critical}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Altos abiertos</p><p className="text-2xl font-bold text-amber-500">{counts.high}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Medios abiertos</p><p className="text-2xl font-bold">{counts.medium}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Resueltos</p><p className="text-2xl font-bold text-emerald-500">{counts.resolved}</p></CardContent></Card>
        </div>

        {aiSummary && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Diagnóstico de la IA
                {lastScan && <span className="text-[10px] font-normal text-muted-foreground">· {formatDistanceToNow(new Date(lastScan), { locale: es, addSuffix: true })}</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-line text-muted-foreground">{aiSummary}</CardContent>
          </Card>
        )}

        <div className="flex flex-wrap gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Abiertos</SelectItem>
              <SelectItem value="resolved">Resueltos</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Severidad" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda severidad</SelectItem>
              {["critical", "high", "medium", "low"].map((s) => (
                <SelectItem key={s} value={s}>{SEVERITY_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Categoría" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las áreas</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{CATEGORY_META[c]?.label ?? c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading && (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />Cargando alertas…
          </CardContent></Card>
        )}

        {!loading && filtered.length === 0 && (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
            {open.length === 0 && items.length > 0
              ? <><CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />Sin riesgos abiertos con estos filtros.</>
              : <><ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-50" />Sin alertas. Ejecuta un escaneo para analizar los datos reales de la empresa.</>}
          </CardContent></Card>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((a) => {
            const meta = CATEGORY_META[a.category] ?? { label: a.category, icon: AlertTriangle };
            const Icon = meta.icon;
            const actions: string[] = Array.isArray(a.metadata?.ai_actions) ? a.metadata!.ai_actions : [];
            const evidence = Object.entries(a.metadata ?? {}).filter(([k]) =>
              !["signature", "ai_actions", "scanned_at", "items", "shifts", "lots", "top", "entries"].includes(k));
            return (
              <Card key={a.id} className={a.status === "open" && a.severity === "critical" ? "border-destructive/40" : "border-border/50"}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <CardTitle className="text-sm leading-snug">{a.title}</CardTitle>
                    </div>
                    <Badge variant="outline" className={SEVERITY_STYLES[a.severity] ?? ""}>
                      {SEVERITY_LABEL[a.severity] ?? a.severity}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Badge variant="secondary" className="text-[9px]">{meta.label}</Badge>
                    <Badge variant={a.status === "open" ? "destructive" : "secondary"} className="text-[9px]">
                      {a.status === "open" ? "Abierto" : "Resuelto"}
                    </Badge>
                    <span>· {formatDistanceToNow(new Date(a.created_at), { locale: es, addSuffix: true })}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">{a.description}</p>

                  {evidence.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {evidence.slice(0, 5).map(([k, v]) => (
                        <span key={k} className="rounded-md border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                          {k.replace(/_/g, " ")}: <strong className="text-foreground">
                            {typeof v === "number" ? Math.round(v * 100) / 100 : String(v).slice(0, 24)}
                          </strong>
                        </span>
                      ))}
                    </div>
                  )}

                  {actions.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-primary flex items-center gap-1">
                          <Sparkles className="h-3 w-3" /> Acciones recomendadas por la IA
                        </p>
                        <ul className="space-y-1">
                          {actions.map((act, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex gap-1.5">
                              <span className="text-primary">•</span><span>{act}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </>
                  )}

                  <div className="flex gap-2">
                    {a.status === "open" ? (
                      <Button size="sm" variant="outline" onClick={() => setAlertStatus(a.id, "resolved")}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Marcar resuelto
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setAlertStatus(a.id, "open")}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Reabrir
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
