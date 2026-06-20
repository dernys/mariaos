import { useEffect, useState } from "react";
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

const fmt = (n: number) =>
  new Intl.NumberFormat("es-CU", { style: "currency", currency: "CUP", maximumFractionDigits: 2 }).format(n || 0);

export default function CuTaxDeclarationsTab() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState<string>("");
  const [declarationType, setDeclarationType] = useState<string>("utilidades");
  const [taxRate, setTaxRate] = useState<number>(35);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!tenantId) return;
    const { data: p } = await supabase
      .from("accounting_periods")
      .select("id,name,start_date,end_date,status")
      .eq("tenant_id", tenantId)
      .order("start_date", { ascending: false });
    setPeriods((p as Period[]) || []);
    if (p && p.length && !periodId) setPeriodId(p[0].id);

    const { data: d } = await supabase
      .from("cu_tax_declarations")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    setDeclarations((d as Declaration[]) || []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const compute = async () => {
    if (!tenantId || !periodId) return;
    setLoading(true);
    const { error } = await supabase.rpc("compute_cu_tax_declaration", {
      p_tenant: tenantId,
      p_period_id: periodId,
      p_declaration_type: declarationType,
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="h-4 w-4" /> Calcular declaración ONAT
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-4 gap-3 items-end">
            <div>
              <Label className="text-xs">Período</Label>
              <Select value={periodId} onValueChange={setPeriodId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={declarationType} onValueChange={setDeclarationType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="utilidades">Impuesto sobre Utilidades</SelectItem>
                  <SelectItem value="ventas">Impuesto sobre Ventas</SelectItem>
                  <SelectItem value="ssocial">Seguridad Social</SelectItem>
                  <SelectItem value="ftrabajo">Fuerza de Trabajo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tasa (%)</Label>
              <Input type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} />
            </div>
            <Button onClick={compute} disabled={loading || !periodId} className="gradient-brand text-primary-foreground">
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Calcular
            </Button>
          </div>
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
                  <TableCell>{d.declaration_type}</TableCell>
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
