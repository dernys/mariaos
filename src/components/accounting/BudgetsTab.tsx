import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, Edit2, Trash2, ListChecks, Wallet } from "lucide-react";

interface Budget {
  id: string;
  name: string;
  year: number;
  period_type: string;
  status: string;
  notes: string | null;
}
interface BudgetLine {
  id: string;
  budget_id: string;
  account_id: string;
  cost_center_id: string | null;
  period_month: number;
  amount: number;
  notes: string | null;
}
interface Account { id: string; code: string; name: string; type: string; is_postable: boolean; }
interface CostCenter { id: string; code: string; name: string; is_active: boolean; }
interface ExecutionRow {
  account_code: string;
  account_name: string;
  period_month: number;
  cost_center_code: string | null;
  budgeted: number;
  actual: number;
  variance: number;
}

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const fmt = (n: number) => n.toLocaleString("es-CU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BudgetsTab() {
  const tenantId = useTenant();
  const { toast } = useToast();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<string | null>(null);
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [execution, setExecution] = useState<ExecutionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Budget dialog
  const [budOpen, setBudOpen] = useState(false);
  const [editingBud, setEditingBud] = useState<Budget | null>(null);
  const [budForm, setBudForm] = useState({ name: "", year: new Date().getFullYear(), period_type: "monthly", notes: "" });

  // Line dialog
  const [lineOpen, setLineOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<BudgetLine | null>(null);
  const [lineForm, setLineForm] = useState({ account_id: "", cost_center_id: "", period_month: 1, amount: "0", notes: "" });

  const loadAll = async () => {
    if (!tenantId) return;
    setLoading(true);
    const [bRes, aRes, ccRes] = await Promise.all([
      (supabase as any).from("budgets").select("*").eq("tenant_id", tenantId).order("year", { ascending: false }),
      supabase.from("accounting_accounts").select("id, code, name, type, is_postable").eq("tenant_id", tenantId).eq("is_postable", true).order("code"),
      (supabase as any).from("cost_centers").select("id, code, name, is_active").eq("tenant_id", tenantId).eq("is_active", true).order("code"),
    ]);
    const buds = (bRes.data as Budget[]) || [];
    setBudgets(buds);
    setAccounts((aRes.data as Account[]) || []);
    setCostCenters((ccRes.data as CostCenter[]) || []);
    if (!selectedBudget && buds.length > 0) setSelectedBudget(buds[0].id);
    setLoading(false);
  };

  const loadDetail = async () => {
    if (!selectedBudget) { setLines([]); setExecution([]); return; }
    const [lRes, eRes] = await Promise.all([
      (supabase as any).from("budget_lines").select("*").eq("budget_id", selectedBudget).order("period_month"),
      (supabase as any).from("budget_execution_view").select("*").eq("budget_id", selectedBudget).order("account_code").order("period_month"),
    ]);
    setLines((lRes.data as BudgetLine[]) || []);
    setExecution((eRes.data as ExecutionRow[]) || []);
  };

  useEffect(() => { loadAll(); }, [tenantId]);
  useEffect(() => { loadDetail(); }, [selectedBudget]);

  const current = budgets.find((b) => b.id === selectedBudget);

  const saveBudget = async () => {
    if (!tenantId || !budForm.name.trim()) {
      toast({ title: "Nombre obligatorio", variant: "destructive" }); return;
    }
    const payload: any = {
      tenant_id: tenantId,
      name: budForm.name.trim(),
      year: budForm.year,
      period_type: budForm.period_type,
      notes: budForm.notes.trim() || null,
    };
    const res = editingBud
      ? await (supabase as any).from("budgets").update(payload).eq("id", editingBud.id)
      : await (supabase as any).from("budgets").insert(payload).select("id").single();
    if (res.error) { toast({ title: "Error", description: res.error.message, variant: "destructive" }); return; }
    toast({ title: editingBud ? "Presupuesto actualizado" : "Presupuesto creado" });
    setBudOpen(false);
    if (!editingBud && res.data?.id) setSelectedBudget(res.data.id);
    loadAll();
  };

  const changeStatus = async (status: string) => {
    if (!current) return;
    const { error } = await (supabase as any).from("budgets").update({ status, approved_at: status === "approved" ? new Date().toISOString() : null }).eq("id", current.id);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Estado actualizado" });
    loadAll();
  };

  const saveLine = async () => {
    if (!selectedBudget || !lineForm.account_id) {
      toast({ title: "Cuenta obligatoria", variant: "destructive" }); return;
    }
    const payload: any = {
      budget_id: selectedBudget,
      tenant_id: tenantId,
      account_id: lineForm.account_id,
      cost_center_id: lineForm.cost_center_id || null,
      period_month: Number(lineForm.period_month),
      amount: Number(lineForm.amount) || 0,
      notes: lineForm.notes.trim() || null,
    };
    const res = editingLine
      ? await (supabase as any).from("budget_lines").update(payload).eq("id", editingLine.id)
      : await (supabase as any).from("budget_lines").insert(payload);
    if (res.error) { toast({ title: "Error", description: res.error.message, variant: "destructive" }); return; }
    toast({ title: editingLine ? "Línea actualizada" : "Línea agregada" });
    setLineOpen(false);
    loadDetail();
  };

  const removeLine = async (id: string) => {
    if (!confirm("¿Eliminar línea?")) return;
    await (supabase as any).from("budget_lines").delete().eq("id", id);
    loadDetail();
  };

  const totalBudgeted = useMemo(() => execution.reduce((s, r) => s + Number(r.budgeted || 0), 0), [execution]);
  const totalActual = useMemo(() => execution.reduce((s, r) => s + Number(r.actual || 0), 0), [execution]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={selectedBudget || ""}
            onChange={(e) => setSelectedBudget(e.target.value || null)}
          >
            <option value="">— Selecciona un presupuesto —</option>
            {budgets.map((b) => (
              <option key={b.id} value={b.id}>{b.year} · {b.name} [{b.status}]</option>
            ))}
          </select>
          {current && (
            <>
              <Badge variant={current.status === "approved" ? "default" : current.status === "closed" ? "secondary" : "outline"}>
                {current.status}
              </Badge>
              {current.status === "draft" && (
                <Button size="sm" variant="outline" onClick={() => changeStatus("approved")}>Aprobar</Button>
              )}
              {current.status === "approved" && (
                <Button size="sm" variant="outline" onClick={() => changeStatus("closed")}>Cerrar</Button>
              )}
            </>
          )}
        </div>
        <Button size="sm" onClick={() => { setEditingBud(null); setBudForm({ name: "", year: new Date().getFullYear(), period_type: "monthly", notes: "" }); setBudOpen(true); }} className="gap-1">
          <Plus className="h-4 w-4" />Nuevo presupuesto
        </Button>
      </div>

      {current && (
        <Tabs defaultValue="lines">
          <TabsList>
            <TabsTrigger value="lines"><ListChecks className="h-3.5 w-3.5 mr-1" />Líneas</TabsTrigger>
            <TabsTrigger value="execution">Ejecución vs Real</TabsTrigger>
          </TabsList>

          <TabsContent value="lines" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" disabled={current.status !== "draft"} onClick={() => { setEditingLine(null); setLineForm({ account_id: "", cost_center_id: "", period_month: 1, amount: "0", notes: "" }); setLineOpen(true); }} className="gap-1">
                <Plus className="h-4 w-4" />Agregar línea
              </Button>
            </div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Centro</TableHead>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sin líneas</TableCell></TableRow>
                  ) : lines.map((l) => {
                    const acc = accounts.find((a) => a.id === l.account_id);
                    const cc = costCenters.find((c) => c.id === l.cost_center_id);
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="text-sm">{acc ? `${acc.code} - ${acc.name}` : l.account_id}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{cc ? cc.code : "—"}</TableCell>
                        <TableCell>{MONTHS[l.period_month - 1]}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(Number(l.amount))}</TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" disabled={current.status !== "draft"} onClick={() => { setEditingLine(l); setLineForm({ account_id: l.account_id, cost_center_id: l.cost_center_id || "", period_month: l.period_month, amount: String(l.amount), notes: l.notes || "" }); setLineOpen(true); }}><Edit2 className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" disabled={current.status !== "draft"} onClick={() => removeLine(l.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="execution" className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Presupuestado</p>
                <p className="text-xl font-bold font-mono">{fmt(totalBudgeted)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Real</p>
                <p className="text-xl font-bold font-mono">{fmt(totalActual)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Variación</p>
                <p className={`text-xl font-bold font-mono ${totalBudgeted - totalActual < 0 ? "text-destructive" : "text-success"}`}>
                  {fmt(totalBudgeted - totalActual)}
                </p>
              </CardContent></Card>
            </div>
            <Card><CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Centro</TableHead>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Presupuesto</TableHead>
                  <TableHead className="text-right">Real</TableHead>
                  <TableHead className="text-right">Variación</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {execution.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin datos</TableCell></TableRow>
                  ) : execution.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{r.account_code} - {r.account_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.cost_center_code || "—"}</TableCell>
                      <TableCell>{MONTHS[r.period_month - 1]}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(Number(r.budgeted))}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(Number(r.actual))}</TableCell>
                      <TableCell className={`text-right font-mono ${Number(r.variance) < 0 ? "text-destructive" : "text-success"}`}>
                        {fmt(Number(r.variance))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Budget dialog */}
      <Dialog open={budOpen} onOpenChange={setBudOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBud ? "Editar presupuesto" : "Nuevo presupuesto"}</DialogTitle>
            <DialogDescription>Define el plan financiero del período.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre *</Label><Input value={budForm.name} onChange={(e) => setBudForm({ ...budForm, name: e.target.value })} placeholder="Presupuesto operativo 2026" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Año</Label><Input type="number" value={budForm.year} onChange={(e) => setBudForm({ ...budForm, year: Number(e.target.value) })} /></div>
              <div><Label>Periodicidad</Label>
                <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={budForm.period_type} onChange={(e) => setBudForm({ ...budForm, period_type: e.target.value })}>
                  <option value="monthly">Mensual</option>
                  <option value="quarterly">Trimestral</option>
                  <option value="annual">Anual</option>
                </select>
              </div>
            </div>
            <div><Label>Notas</Label><Input value={budForm.notes} onChange={(e) => setBudForm({ ...budForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBudOpen(false)}>Cancelar</Button>
            <Button onClick={saveBudget}>{editingBud ? "Guardar" : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Line dialog */}
      <Dialog open={lineOpen} onOpenChange={setLineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLine ? "Editar línea" : "Nueva línea presupuestal"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Cuenta *</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={lineForm.account_id} onChange={(e) => setLineForm({ ...lineForm, account_id: e.target.value })}>
                <option value="">— Selecciona —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
              </select>
            </div>
            <div><Label>Centro de costo (opcional)</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={lineForm.cost_center_id} onChange={(e) => setLineForm({ ...lineForm, cost_center_id: e.target.value })}>
                <option value="">— Sin centro —</option>
                {costCenters.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Mes</Label>
                <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={lineForm.period_month} onChange={(e) => setLineForm({ ...lineForm, period_month: Number(e.target.value) })}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div><Label>Monto</Label><Input type="number" step="0.01" value={lineForm.amount} onChange={(e) => setLineForm({ ...lineForm, amount: e.target.value })} /></div>
            </div>
            <div><Label>Notas</Label><Input value={lineForm.notes} onChange={(e) => setLineForm({ ...lineForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLineOpen(false)}>Cancelar</Button>
            <Button onClick={saveLine}>{editingLine ? "Guardar" : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
