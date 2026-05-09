import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useTenantContext } from "@/hooks/useTenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Workflow as WorkflowIcon } from "lucide-react";
import { toast } from "sonner";

export default function Workflows() {
  const { tenantId } = useTenantContext();
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", trigger_type: "event", trigger_event: "agent.analysis.completed", action: "notify" });

  const load = async () => {
    if (!tenantId) return;
    const { data } = await supabase.from("workflows").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
    setItems(data ?? []);
  };
  useEffect(() => { load(); }, [tenantId]);

  const create = async () => {
    if (!tenantId || !form.name) return;
    const { error } = await supabase.from("workflows").insert({
      tenant_id: tenantId, name: form.name, description: form.description,
      trigger: { type: form.trigger_type, event: form.trigger_event },
      definition: { nodes: [{ id: "n1", type: "trigger", event: form.trigger_event }, { id: "n2", type: "action", action: form.action }], edges: [{ from: "n1", to: "n2" }] },
    });
    if (error) toast.error(error.message); else { toast.success("Workflow creado"); setOpen(false); load(); }
  };

  const toggle = async (id: string, enabled: boolean) => {
    await supabase.from("workflows").update({ enabled }).eq("id", id); load();
  };

  return (
    <AppLayout title="Workflows autónomos">
      <div className="space-y-4">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <p className="text-sm text-muted-foreground">Automatizaciones disparadas por eventos del sistema nervioso.</p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" /> Nuevo workflow</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nuevo workflow</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nombre</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Descripción</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div><Label>Evento disparador</Label><Input value={form.trigger_event} onChange={(e) => setForm({ ...form, trigger_event: e.target.value })} placeholder="ej: agent.analysis.completed" /></div>
                <div><Label>Acción</Label><Input value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} placeholder="notify | email | run_agent" /></div>
              </div>
              <DialogFooter><Button onClick={create}>Crear</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {items.length === 0 && <Card><CardContent className="py-12 text-center text-sm text-muted-foreground"><WorkflowIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />Sin workflows aún.</CardContent></Card>}
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((w) => (
            <Card key={w.id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div><CardTitle className="text-sm flex items-center gap-2"><WorkflowIcon className="h-4 w-4 text-primary" />{w.name}</CardTitle><p className="text-[11px] text-muted-foreground mt-0.5">{w.description}</p></div>
                  <Switch checked={w.enabled} onCheckedChange={(v) => toggle(w.id, v)} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-[11px] font-mono bg-muted/40 p-2 rounded">on <span className="text-primary">{(w.trigger as any)?.event}</span> → <span className="text-emerald-500">{(w.definition as any)?.nodes?.[1]?.action}</span></div>
                <p className="text-[10px] text-muted-foreground mt-2">Ejecuciones: {w.run_count}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
