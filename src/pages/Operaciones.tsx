import { AppLayout } from "@/components/AppLayout";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useAgent } from "@/hooks/useAgent";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, ArrowRightLeft, ClipboardCheck, Plus, Sparkles, Store, Warehouse, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";

interface Insights {
  summary: { total_skus: number; overstock_count: number; understock_count: number; transfer_suggestions: number; open_incidents: number };
  overstock: any[];
  understock: any[];
  suggestions: any[];
  incidents: any[];
  stores: any[];
  warehouses: any[];
}

const Operaciones = () => {
  const tenantId = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);
  const [stores, setStores] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [checklists, setChecklists] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [incidentDialog, setIncidentDialog] = useState(false);
  const [checklistDialog, setChecklistDialog] = useState(false);
  const [incForm, setIncForm] = useState({ store_id: "", incident_type: "operational", severity: "low", title: "", description: "" });
  const [clForm, setClForm] = useState({ name: "", checklist_type: "opening", scope: "store", items: "" });

  const load = async () => {
    const [stRes, incRes, clRes, runRes] = await Promise.all([
      supabase.from("stores").select("id, name, operational_status, is_active").order("name"),
      supabase.from("store_incidents").select("*, stores(name)").order("created_at", { ascending: false }).limit(50),
      supabase.from("operational_checklists").select("*").order("created_at", { ascending: false }),
      supabase.from("checklist_runs").select("*").order("created_at", { ascending: false }).limit(30),
    ]);
    setStores(stRes.data || []);
    setIncidents(incRes.data || []);
    setChecklists(clRes.data || []);
    setRuns(runRes.data || []);
  };

  const { invoke } = useAgent();
  const runOptimizer = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await invoke<Insights>("logistics-optimizer", { tenant_id: tenantId }, { notify: false });
    setLoading(false);
    if (error) { toast({ title: "Error", description: error, variant: "destructive" }); return; }
    if (data) setInsights(data);
    toast({ title: "Análisis logístico actualizado" });
  };


  useEffect(() => { load(); }, []);
  useEffect(() => { if (tenantId) runOptimizer(); }, [tenantId]);

  const createIncident = async () => {
    if (!incForm.store_id || !incForm.title.trim()) { toast({ title: "Faltan datos", variant: "destructive" }); return; }
    const { error } = await supabase.from("store_incidents").insert({
      tenant_id: tenantId, store_id: incForm.store_id, incident_type: incForm.incident_type,
      severity: incForm.severity, title: incForm.title, description: incForm.description, reported_by: user?.id,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Incidencia registrada" });
    setIncidentDialog(false);
    setIncForm({ store_id: "", incident_type: "operational", severity: "low", title: "", description: "" });
    load();
  };

  const resolveIncident = async (id: string) => {
    await supabase.from("store_incidents").update({ status: "resolved", resolved_by: user?.id, resolved_at: new Date().toISOString() }).eq("id", id);
    load();
  };

  const createChecklist = async () => {
    if (!clForm.name.trim()) { toast({ title: "Nombre requerido", variant: "destructive" }); return; }
    const items = clForm.items.split("\n").filter(Boolean).map((t, i) => ({ id: i + 1, text: t.trim(), required: true }));
    const { error } = await supabase.from("operational_checklists").insert({
      tenant_id: tenantId, name: clForm.name, checklist_type: clForm.checklist_type, scope: clForm.scope, items,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Checklist creado" });
    setChecklistDialog(false);
    setClForm({ name: "", checklist_type: "opening", scope: "store", items: "" });
    load();
  };

  const sevColor: Record<string, string> = {
    low: "bg-muted text-foreground",
    medium: "bg-warning/15 text-warning",
    high: "bg-destructive/15 text-destructive",
    critical: "bg-destructive text-destructive-foreground",
  };

  return (
    <AppLayout title="Operaciones">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm text-muted-foreground">Centro de operaciones, logística inteligente, incidencias y checklists</p>
          <Button size="sm" onClick={runOptimizer} disabled={loading} className="gap-1 gradient-brand text-primary-foreground">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Recalcular
          </Button>
        </div>

        {insights && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { icon: Store, label: "SKUs", value: insights.summary.total_skus, color: "text-primary" },
              { icon: TrendingUp, label: "Sobrestock", value: insights.summary.overstock_count, color: "text-warning" },
              { icon: TrendingDown, label: "Bajo stock", value: insights.summary.understock_count, color: "text-destructive" },
              { icon: ArrowRightLeft, label: "Sugerencias", value: insights.summary.transfer_suggestions, color: "text-success" },
              { icon: AlertTriangle, label: "Incidencias", value: insights.summary.open_incidents, color: "text-destructive" },
            ].map((k, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card rounded-xl p-4 border shadow-card">
                <div className="flex items-center gap-2"><k.icon className={`h-4 w-4 ${k.color}`} /><span className="text-xs text-muted-foreground">{k.label}</span></div>
                <p className="font-heading font-bold text-2xl mt-1">{k.value}</p>
              </motion.div>
            ))}
          </div>
        )}

        <Tabs defaultValue="logistics" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="logistics" className="gap-1"><Sparkles className="h-3.5 w-3.5" /> Logística</TabsTrigger>
            <TabsTrigger value="incidents" className="gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Incidencias</TabsTrigger>
            <TabsTrigger value="checklists" className="gap-1"><ClipboardCheck className="h-3.5 w-3.5" /> Checklists</TabsTrigger>
            <TabsTrigger value="status" className="gap-1"><Activity className="h-3.5 w-3.5" /> Estado tiendas</TabsTrigger>
          </TabsList>

          <TabsContent value="logistics" className="space-y-4">
            <div className="bg-card rounded-xl p-5 border shadow-card">
              <h3 className="font-heading font-semibold mb-3 flex items-center gap-2"><ArrowRightLeft className="h-4 w-4 text-primary" /> Sugerencias de transferencia</h3>
              <div className="space-y-2 max-h-96 overflow-auto">
                {insights?.suggestions.length === 0 && <p className="text-sm text-muted-foreground">Sin sugerencias por ahora.</p>}
                {insights?.suggestions.map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                    <div>
                      <p className="text-sm font-medium">{s.product_name}</p>
                      <p className="text-xs text-muted-foreground">{s.from_type} → {s.to_type} · {s.suggested_qty} uds</p>
                    </div>
                    <Badge className={sevColor[s.urgency === "high" ? "high" : "medium"]}>{s.urgency}</Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-card rounded-xl p-5 border shadow-card">
                <h3 className="font-heading font-semibold mb-3 flex items-center gap-2 text-warning"><TrendingUp className="h-4 w-4" /> Sobrestock</h3>
                <div className="space-y-2 max-h-72 overflow-auto text-xs">
                  {insights?.overstock.slice(0, 20).map((o, i) => (
                    <div key={i} className="flex justify-between p-2 rounded bg-muted/30">
                      <span>{o.name}</span>
                      <span className="text-warning font-mono">+{o.excess}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-card rounded-xl p-5 border shadow-card">
                <h3 className="font-heading font-semibold mb-3 flex items-center gap-2 text-destructive"><TrendingDown className="h-4 w-4" /> Bajo stock</h3>
                <div className="space-y-2 max-h-72 overflow-auto text-xs">
                  {insights?.understock.slice(0, 20).map((o, i) => (
                    <div key={i} className="flex justify-between p-2 rounded bg-muted/30">
                      <span>{o.name}</span>
                      <span className="text-destructive font-mono">{o.stock}/{o.min_stock} · {o.days_of_cover}d</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="incidents" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setIncidentDialog(true)} className="gap-1"><Plus className="h-3.5 w-3.5" /> Nueva incidencia</Button>
            </div>
            <div className="space-y-2">
              {incidents.map((i: any) => (
                <div key={i.id} className="bg-card rounded-xl p-4 border shadow-card flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge className={sevColor[i.severity] || ""}>{i.severity}</Badge>
                      <span className="font-medium text-sm truncate">{i.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{i.stores?.name} · {new Date(i.created_at).toLocaleString()}</p>
                    {i.description && <p className="text-xs mt-1 text-muted-foreground">{i.description}</p>}
                  </div>
                  {i.status === "open" ? (
                    <Button size="sm" variant="outline" onClick={() => resolveIncident(i.id)}>Resolver</Button>
                  ) : <Badge variant="secondary">Resuelta</Badge>}
                </div>
              ))}
              {incidents.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Sin incidencias registradas</p>}
            </div>
          </TabsContent>

          <TabsContent value="checklists" className="space-y-3">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setChecklistDialog(true)} className="gap-1"><Plus className="h-3.5 w-3.5" /> Nuevo checklist</Button>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {checklists.map((c: any) => (
                <div key={c.id} className="bg-card rounded-xl p-4 border shadow-card">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">{c.name}</h4>
                    <Badge variant="outline" className="text-[10px]">{c.checklist_type}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{(c.items || []).length} items · {c.scope}</p>
                </div>
              ))}
              {checklists.length === 0 && <p className="text-sm text-muted-foreground col-span-full text-center py-8">Sin checklists</p>}
            </div>
            {runs.length > 0 && (
              <div className="bg-card rounded-xl p-4 border shadow-card">
                <h3 className="font-heading font-semibold mb-2 text-sm">Ejecuciones recientes</h3>
                <div className="space-y-1 text-xs">
                  {runs.map((r: any) => (
                    <div key={r.id} className="flex justify-between p-2 rounded bg-muted/30">
                      <span>{r.location_type} · {r.status}</span>
                      <span className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="status">
            <div className="grid md:grid-cols-3 gap-3">
              {stores.map((s: any) => (
                <div key={s.id} className="bg-card rounded-xl p-4 border shadow-card">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{s.name}</span>
                    <Badge className={s.operational_status === "open" ? "bg-success/15 text-success" : "bg-muted"}>
                      {s.operational_status || (s.is_active ? "open" : "closed")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={incidentDialog} onOpenChange={setIncidentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva incidencia</DialogTitle>
            <DialogDescription>Registra un evento operativo en una tienda</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Tienda</Label>
              <Select value={incForm.store_id} onValueChange={(v) => setIncForm({ ...incForm, store_id: v })}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>{stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={incForm.incident_type} onValueChange={(v) => setIncForm({ ...incForm, incident_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operational">Operacional</SelectItem>
                    <SelectItem value="maintenance">Mantenimiento</SelectItem>
                    <SelectItem value="security">Seguridad</SelectItem>
                    <SelectItem value="customer">Cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Severidad</Label>
                <Select value={incForm.severity} onValueChange={(v) => setIncForm({ ...incForm, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baja</SelectItem>
                    <SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="critical">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Título</Label><Input value={incForm.title} onChange={(e) => setIncForm({ ...incForm, title: e.target.value })} /></div>
            <div><Label>Descripción</Label><Textarea rows={3} value={incForm.description} onChange={(e) => setIncForm({ ...incForm, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIncidentDialog(false)}>Cancelar</Button>
            <Button onClick={createIncident} className="gradient-brand text-primary-foreground">Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={checklistDialog} onOpenChange={setChecklistDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo checklist</DialogTitle>
            <DialogDescription>Define una lista operativa (apertura, cierre, limpieza, etc.)</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Nombre</Label><Input value={clForm.name} onChange={(e) => setClForm({ ...clForm, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={clForm.checklist_type} onValueChange={(v) => setClForm({ ...clForm, checklist_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="opening">Apertura</SelectItem>
                    <SelectItem value="closing">Cierre</SelectItem>
                    <SelectItem value="cleaning">Limpieza</SelectItem>
                    <SelectItem value="maintenance">Mantenimiento</SelectItem>
                    <SelectItem value="audit">Auditoría</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Alcance</Label>
                <Select value={clForm.scope} onValueChange={(v) => setClForm({ ...clForm, scope: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">Tienda</SelectItem>
                    <SelectItem value="warehouse">Almacén</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Items (uno por línea)</Label>
              <Textarea rows={6} value={clForm.items} onChange={(e) => setClForm({ ...clForm, items: e.target.value })} placeholder={"Encender luces\nRevisar caja\nLimpiar mostrador"} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChecklistDialog(false)}>Cancelar</Button>
            <Button onClick={createChecklist} className="gradient-brand text-primary-foreground">Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Operaciones;
