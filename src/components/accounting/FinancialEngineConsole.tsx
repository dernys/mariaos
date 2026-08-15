import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Activity, AlertTriangle, CheckCircle2, ChevronDown, Download, Info,
  Play, ShieldCheck, Stethoscope, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { exportCsv } from "@/lib/exportData";

type Status = "pass" | "warn" | "fail" | "info";
type Source = "diagnostics" | "health" | "certification" | "smoke" | "mapping" | "reconciliation";

interface EngineRow {
  source: Source;
  area: string;
  code: string;
  status: Status;
  severity: string;
  metric: number | null;
  expected: number | null;
  detail: string;
  remediation: string;
}

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v);

const normalizeStatus = (raw: string): Status => {
  const s = (raw ?? "").toString().toLowerCase();
  if (s === "pass" || s === "ok") return "pass";
  if (s === "critical" || s === "fail" || s === "failed") return "fail";
  if (s === "info") return "info";
  return "warn";
};

const severityFromStatus = (s: Status) =>
  s === "fail" ? "critical" : s === "warn" ? "medium" : "info";

const statusIcon = (s: Status) =>
  s === "pass" ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
  : s === "fail" ? <XCircle className="h-4 w-4 text-destructive shrink-0" />
  : s === "info" ? <Info className="h-4 w-4 text-muted-foreground shrink-0" />
  : <AlertTriangle className="h-4 w-4 text-warning shrink-0" />;

const badgeVariant = (s: Status): "default" | "destructive" | "secondary" | "outline" =>
  s === "pass" ? "default" : s === "fail" ? "destructive" : s === "info" ? "outline" : "secondary";

export function FinancialEngineConsole() {
  const { t, i18n } = useTranslation();
  const { tenantId } = useTenantContext();
  const [rows, setRows] = useState<EngineRow[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [tab, setTab] = useState<Source>("diagnostics");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "issues" | "critical">("all");

  const fmtNum = useCallback(
    (n: number | null) =>
      n === null ? "—" : new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(n),
    [i18n.language],
  );

  const label = (kind: "areas" | "checks" | "remediation", key: string) => {
    const full = `finance.${kind}.${key}`;
    const translated = t(full);
    return translated === full ? key : translated;
  };

  const run = useCallback(async () => {
    if (!tenantId) return;
    setRunning(true);
    try {
      const call = (fn: string) => (supabase as any).rpc(fn, { p_tenant: tenantId });
      const [diag, health, cert, smoke, mapping, recon] = await Promise.all([
        call("financial_engine_diagnostics"),
        call("financial_health_check"),
        call("certify_financial_integrity"),
        call("smoke_test_financial_core"),
        call("accounting_mapping_status"),
        (supabase as any).rpc("accounting_operation_reconciliation", {
          p_tenant: tenantId, p_from: null, p_to: null,
        }),
      ]);

      const firstError = [diag, health, cert, smoke, mapping, recon].find((r) => r?.error)?.error;
      if (firstError) toast.error(firstError.message);

      const out: EngineRow[] = [];

      for (const r of (diag?.data ?? []) as any[]) {
        out.push({
          source: "diagnostics",
          area: r.area,
          code: r.check_code,
          status: normalizeStatus(r.status),
          severity: r.severity ?? "medium",
          metric: num(r.metric),
          expected: num(r.expected),
          detail: r.detail ?? "",
          remediation: r.remediation ?? "none",
        });
      }
      for (const r of (health?.data ?? []) as any[]) {
        const st = normalizeStatus(r.status);
        out.push({
          source: "health",
          area: r.area,
          code: r.check_name,
          status: st,
          severity: severityFromStatus(st),
          metric: num(r.metric),
          expected: null,
          detail: r.detail ?? "",
          remediation: "none",
        });
      }
      for (const r of (cert?.data ?? []) as any[]) {
        const st = normalizeStatus(r.status);
        out.push({
          source: "certification",
          area: "double_entry",
          code: r.check_name,
          status: st,
          severity: severityFromStatus(st),
          metric: num(r.actual),
          expected: num(r.expected),
          detail: r.detail ?? "",
          remediation: "none",
        });
      }
      for (const r of (smoke?.data ?? []) as any[]) {
        const st = normalizeStatus(r.status);
        out.push({
          source: "smoke",
          area: "structure",
          code: r.check_name,
          status: st,
          severity: severityFromStatus(st),
          metric: null,
          expected: null,
          detail: r.detail ?? "",
          remediation: "none",
        });
      }
      for (const r of (mapping?.data ?? []) as any[]) {
        const st: Status = r.source === "unresolved" ? "fail" : r.source === "fallback" || !r.type_ok ? "warn" : "pass";
        out.push({
          source: "mapping",
          area: r.module,
          code: r.mapping_key,
          status: st,
          severity: st === "fail" ? "critical" : st === "warn" ? "medium" : "info",
          metric: num(r.lines_count),
          expected: null,
          detail: `${r.account_code ? `${r.account_code} · ${r.account_name} — ` : ""}${r.detail ?? ""}`,
          remediation: r.remediation ?? "none",
        });
      }
      for (const r of (recon?.data ?? []) as any[]) {
        const st = normalizeStatus(r.status);
        out.push({
          source: "reconciliation",
          area: r.module,
          code: `${r.module}_posting_coverage`,
          status: st,
          severity: r.severity ?? severityFromStatus(st),
          metric: num(r.documents_unposted),
          expected: 0,
          detail: `${r.detail ?? ""} · ${r.explanation ?? ""}`,
          remediation: r.remediation ?? "none",
        });
      }



      setRows(out);
      setLastRun(new Date());

      const failed = out.filter((r) => r.status === "fail").length;
      const warned = out.filter((r) => r.status === "warn").length;
      if (failed > 0) toast.error(t("finance.engine.toast.fail", { count: failed }));
      else if (warned > 0) toast.warning(t("finance.engine.toast.warn", { count: warned }));
      else if (out.length > 0) toast.success(t("finance.engine.toast.pass"));
    } finally {
      setRunning(false);
    }
  }, [tenantId, t]);

  const scoped = useMemo(() => rows.filter((r) => r.source === tab), [rows, tab]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter((r) => {
      if (filter === "issues" && (r.status === "pass" || r.status === "info")) return false;
      if (filter === "critical" && !(r.status === "fail" || r.severity === "critical")) return false;
      if (!q) return true;
      const hay = [
        label("areas", r.area),
        label("checks", r.code),
        label("remediation", r.remediation),
        r.code,
        r.detail,
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [scoped, query, filter, i18n.language]);

  const stats = useMemo(() => {
    const total = rows.length;
    const evaluated = rows.filter((r) => r.status !== "info");
    const passed = rows.filter((r) => r.status === "pass").length;
    const warnings = rows.filter((r) => r.status === "warn").length;
    const failed = rows.filter((r) => r.status === "fail").length;
    const critical = rows.filter((r) => r.status === "fail" && r.severity === "critical").length;
    const score = evaluated.length === 0
      ? 0
      : Math.max(0, Math.round(((passed + warnings * 0.5) / evaluated.length) * 100));
    return { total, passed, warnings, failed, critical, score };
  }, [rows]);

  const verdict = rows.length === 0 ? null : stats.failed > 0 ? "fail" : stats.warnings > 0 ? "warn" : "pass";

  const grouped = useMemo(() => {
    const map = new Map<string, EngineRow[]>();
    visible.forEach((r) => {
      const list = map.get(r.area) ?? [];
      list.push(r);
      map.set(r.area, list);
    });
    return Array.from(map.entries());
  }, [visible]);

  const doExport = () => {
    if (visible.length === 0) return;
    exportCsv(
      visible,
      [
        { key: "area", label: t("finance.engine.summary.checks"), format: (r) => label("areas", r.area) },
        { key: "code", label: "check", format: (r) => label("checks", r.code) },
        { key: "status", label: "status", format: (r) => t(`finance.status.${r.status}`) },
        { key: "severity", label: "severity", format: (r) => t(`finance.severity.${r.severity}`) },
        { key: "metric", label: t("finance.engine.metric"), format: (r) => (r.metric ?? "") as any },
        { key: "expected", label: t("finance.engine.expected"), format: (r) => (r.expected ?? "") as any },
        { key: "detail", label: "detail" },
        { key: "remediation", label: t("finance.engine.remediation"), format: (r) => label("remediation", r.remediation) },
      ],
      `financial-engine-${tab}`,
    );
  };

  const tabIcon: Record<Source, JSX.Element> = {
    diagnostics: <Stethoscope className="h-3.5 w-3.5 mr-1" />,
    health: <Activity className="h-3.5 w-3.5 mr-1" />,
    certification: <ShieldCheck className="h-3.5 w-3.5 mr-1" />,
    smoke: <Play className="h-3.5 w-3.5 mr-1" />,
    mapping: <BookOpen className="h-3.5 w-3.5 mr-1" />,
    reconciliation: <Scale className="h-3.5 w-3.5 mr-1" />,
  };

  const subtitleKey: Record<Source, string> = {
    diagnostics: "finance.engine.diagnosticsSubtitle",
    health: "finance.engine.healthSubtitle",
    certification: "finance.engine.certSubtitle",
    smoke: "finance.engine.smokeSubtitle",
    mapping: "finance.engine.mappingSubtitle",
    reconciliation: "finance.engine.reconSubtitle",
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {t("finance.engine.title")}
          </h3>
          <p className="text-xs text-muted-foreground max-w-2xl">{t("finance.engine.subtitle")}</p>
          {lastRun && (
            <p className="text-xs text-muted-foreground">
              {t("finance.engine.lastRun", { time: lastRun.toLocaleString(i18n.language) })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {verdict && (
            <Badge variant={verdict === "pass" ? "default" : verdict === "fail" ? "destructive" : "secondary"}>
              {t(`finance.engine.verdict.${verdict}`)}
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={doExport} disabled={visible.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" />
            {t("finance.engine.export")}
          </Button>
          <Button size="sm" onClick={run} disabled={running || !tenantId}>
            {running ? t("finance.engine.running") : t("finance.engine.runAll")}
          </Button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {([
              ["checks", stats.total, "text-foreground"],
              ["passed", stats.passed, "text-success"],
              ["warnings", stats.warnings, "text-warning"],
              ["failed", stats.failed, "text-destructive"],
              ["critical", stats.critical, "text-destructive"],
            ] as const).map(([key, value, cls]) => (
              <div key={key} className="rounded-md border p-2.5">
                <p className="text-xs text-muted-foreground">{t(`finance.engine.summary.${key}`)}</p>
                <p className={`text-lg font-semibold ${cls}`}>{value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("finance.engine.score")}</span>
              <span className="font-mono">{stats.score}%</span>
            </div>
            <Progress value={stats.score} />
          </div>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Source)} className="space-y-3">
        <TabsList className="flex-wrap h-auto">
          {(["diagnostics", "health", "certification", "smoke"] as Source[]).map((s) => (
            <TabsTrigger key={s} value={s}>
              {tabIcon[s]}
              {t(`finance.engine.tabs.${s}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        {(["diagnostics", "health", "certification", "smoke"] as Source[]).map((s) => (
          <TabsContent key={s} value={s} className="space-y-3">
            <p className="text-xs text-muted-foreground">{t(subtitleKey[s])}</p>

            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("finance.engine.empty")}</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("finance.engine.search")}
                    className="h-8 max-w-xs"
                  />
                  <div className="flex items-center gap-1">
                    {(["all", "issues", "critical"] as const).map((f) => (
                      <Button
                        key={f}
                        size="sm"
                        variant={filter === f ? "default" : "outline"}
                        className="h-8"
                        onClick={() => setFilter(f)}
                      >
                        {t(f === "all" ? "finance.engine.filterAll" : f === "issues" ? "finance.engine.filterIssues" : "finance.engine.filterCritical")}
                      </Button>
                    ))}
                  </div>
                </div>

                {grouped.length === 0 && (
                  <p className="text-sm text-muted-foreground">{t("finance.engine.noResults")}</p>
                )}

                {grouped.map(([area, list]) => (
                  <div key={area} className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {label("areas", area)}
                    </p>
                    {list.map((r) => (
                      <Collapsible key={`${r.source}-${r.area}-${r.code}`}>
                        <div className="rounded-md border">
                          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 p-2.5 text-left text-sm hover:bg-muted/40">
                            <div className="flex items-center gap-2 min-w-0">
                              {statusIcon(r.status)}
                              <span className="truncate">{label("checks", r.code)}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="hidden sm:inline text-xs text-muted-foreground font-mono">
                                {r.detail || fmtNum(r.metric)}
                              </span>
                              <Badge variant={badgeVariant(r.status)}>{t(`finance.status.${r.status}`)}</Badge>
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="space-y-1.5 border-t p-2.5 text-xs text-muted-foreground">
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                <span>
                                  {t("finance.engine.metric")}: <span className="font-mono">{fmtNum(r.metric)}</span>
                                </span>
                                <span>
                                  {t("finance.engine.expected")}: <span className="font-mono">{fmtNum(r.expected)}</span>
                                </span>
                                <span>
                                  {t("finance.severity." + r.severity, { defaultValue: r.severity })}
                                </span>
                                <span className="font-mono">{r.code}</span>
                              </div>
                              {r.detail && <p className="font-mono">{r.detail}</p>}
                              {r.status !== "pass" && r.remediation !== "none" && (
                                <p className="text-foreground">
                                  <span className="font-medium">{t("finance.engine.remediation")}: </span>
                                  {label("remediation", r.remediation)}
                                </p>
                              )}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    ))}
                  </div>
                ))}
              </>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}
