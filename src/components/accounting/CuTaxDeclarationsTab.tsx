import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calculator, Send, RefreshCw } from "lucide-react";
import { useFiscalRules, RULE_TYPE_LABELS, useBaseCurrency } from "@/hooks/useFiscalRules";

type Period = { id: string; name: string; start_date: string; end_date: string; status: string };
type Declaration = {
  id: string;
  declaration_type: string;
  period_label: string;
  total_income: number;
  total_expenses: number;
  deductible_expenses: number;
  taxable_base: number;
  tax_rate: number;
  tax_due: number;
  status: string;
  submitted_at: string | null;
};

const COUNTRY_LABELS: Record<string, string> = {
  CU: "Cuba", ES: "España", MX: "México", CO: "Colombia",
  PE: "Perú", BR: "Brasil", AR: "Argentina", US: "Estados Unidos",
};

/** Declaraciones fiscales genéricas: el catálogo aplicable depende del país del tenant. */
export default function TaxDeclarationsTab() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const { code: currency } = useBaseCurrency();
  const { data: rules = [] } = useFiscalRules();
  const [country, setCountry] = useState<string>("");
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState<string>("");
  const [ruleCode, setRuleCode] = useState<string>("");
  const [taxRate, setTaxRate] = useState<number>(0);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [loading, setLoading] = useState(false);

  const fmt = useMemo(
    () => (n: number) =>
      new Intl.NumberFormat("es-ES", {
        style: currency ? "currency" : "decimal",
        currency: currency || undefined,
        maximumFractionDigits: 2,
      }).format(n || 0),
    [currency],
  );

  /** Solo tributos declarables (no retenciones a terceros). */
  const declarable = useMemo(
    () => rules.filter((r) => ["income_tax", "sales_tax", "turnover", "social_security", "vat"].includes(r.rule_type)),
    [rules],
  );

  const load = async () => {
    if (!tenantId) return;
    const [{ data: t }, { data: p }, { data: d }] = await Promise.all([
      supabase.from("tenants").select("country_code").eq("id", tenantId).maybeSingle(),
      supabase.from("accounting_periods").select("id,name,start_date,end_date,status")
        .eq("tenant_id", tenantId).order("start_date", { ascending: false }),
      supabase.from("cu_tax_declarations").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    ]);
    setCountry(t?.country_code ?? "");
    setPeriods((p as Period[]) || []);
    if (p && p.length && !periodId) setPeriodId(p[0].id);
    setDeclarations((d as Declaration[]) || []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // Preselecciona el primer tributo del país y su tasa oficial
  useEffect(() => {
    if (!declarable.length) return;
    const current = declarable.find((r) => r.code === ruleCode) ?? declarable[0];
    if (current.code !== ruleCode) setRuleCode(current.code);
    setTaxRate(Math.abs(Number(current.rate)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [declarable, ruleCode]);

  const compute = async () => {
    if (!tenantId || !periodId || !ruleCode) return;
    const rule = declarable.find((r) => r.code === ruleCode);
    setLoading(true);
    const { error } = await supabase.rpc("compute_tax_declaration", {
      p_tenant: tenantId,
      p_period_id: periodId,
      p_declaration_type: rule?.rule_type ?? "income_tax",
      p_tax_rate: taxRate,
    });
    setLoading(false);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Declaración calculada desde el libro mayor" });
      load();
    }
  };

  const submit = async (id: string) => {
    const { data, error } = await supabase.rpc("submit_cu_tax_declaration", { p_declaration_id: id });
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Declaración presentada", description: (data as any)?.msg || "Asiento contable generado" });
      load();
    }
  };

  const countryLabel = COUNTRY_LABELS[country] ?? country ?? "—";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Calculator className="h-4 w-4" /> Calcular declaración fiscal
            <Badge variant="secondary" className="text-[10px]">Régimen: {countryLabel}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="grid sm:grid-cols-4 gap-3 items-end">
            <div>
              <Label className="text-xs">Período</Label>
              <Select value={periodId} onValueChange={setPeriodId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} ({p.status})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tributo</Label>
              <Select value={ruleCode} onValueChange={setRuleCode}>
                <SelectTrigger><SelectValue placeholder="Sin reglas fiscales" /></SelectTrigger>
                <SelectContent>
                  {declarable.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.name} · {RULE_TYPE_LABELS[r.rule_type] ?? r.rule_type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tasa (%)</Label>
              <Input type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} />
            </div>
            <Button onClick={compute} disabled={loading || !periodId || !ruleCode} className="gradient-brand text-primary-foreground">
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Calcular
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Las tasas provienen del catálogo fiscal de {countryLabel} y de los ajustes propios de la empresa; puedes sobreescribirlas aquí.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Declaraciones registradas</CardTitle></CardHeader>
        <CardContent className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Período</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Ingresos</TableHead>
                <TableHead className="text-right">Gastos deducibles</TableHead>
                <TableHead className="text-right">Base imponible</TableHead>
                <TableHead className="text-right">Tasa</TableHead>
                <TableHead className="text-right">Impuesto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {declarations.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Sin declaraciones</TableCell></TableRow>
              )}
              {declarations.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{d.period_label}</TableCell>
                  <TableCell>{RULE_TYPE_LABELS[d.declaration_type] ?? d.declaration_type}</TableCell>
                  <TableCell className="text-right">{fmt(d.total_income)}</TableCell>
                  <TableCell className="text-right">{fmt(d.deductible_expenses)}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(d.taxable_base)}</TableCell>
                  <TableCell className="text-right">{d.tax_rate}%</TableCell>
                  <TableCell className="text-right font-bold text-primary">{fmt(d.tax_due)}</TableCell>
                  <TableCell><Badge variant={d.status === "submitted" ? "default" : "secondary"}>{d.status}</Badge></TableCell>
                  <TableCell>
                    {d.status !== "submitted" && (
                      <Button size="sm" variant="outline" onClick={() => submit(d.id)}>
                        <Send className="h-3 w-3 mr-1" /> Presentar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
