import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Layers, Loader2 } from "lucide-react";
import { format, startOfMonth } from "date-fns";

interface Props {
  tenantId: string | null;
  defaultBonus?: number;
  defaultDeductions?: number;
  onDone: () => void;
}

export function PayrollBatchDialog({ tenantId, defaultBonus = 0, defaultDeductions = 0, onDone }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [form, setForm] = useState({
    start: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    end: format(new Date(), "yyyy-MM-dd"),
    bonus: String(defaultBonus),
    ded: String(defaultDeductions),
  });

  const run = async () => {
    if (!tenantId) return;
    setRunning(true);
    const { data, error } = await (supabase.rpc as any)("generate_payroll_batch", {
      p_tenant_id: tenantId,
      p_period_start: form.start,
      p_period_end: form.end,
      p_bonus: parseFloat(form.bonus || "0") || 0,
      p_deductions: parseFloat(form.ded || "0") || 0,
    });
    setRunning(false);
    if (error) return toast({ title: "No se pudo generar el lote", description: error.message, variant: "destructive" });
    const res = data as any;
    toast({
      title: `Lote generado: ${res?.created ?? 0} nóminas`,
      description: res?.skipped ? `${res.skipped} empleado(s) ya tenían nómina en ese período.` : "Todos los empleados activos con cargo asignado fueron procesados.",
    });
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1"><Layers className="h-4 w-4" />Generar en lote</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generar nóminas en lote</DialogTitle>
          <DialogDescription>
            Calcula la nómina del período para todos los empleados activos con cargo asignado. Los que ya tengan nómina en ese período se omiten.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="text-xs">Desde</Label><Input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
          <div><Label className="text-xs">Hasta</Label><Input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
          <div><Label className="text-xs">Bono por empleado</Label><Input type="number" step="0.01" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} /></div>
          <div><Label className="text-xs">Deducción por empleado</Label><Input type="number" step="0.01" value={form.ded} onChange={(e) => setForm({ ...form, ded: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={run} disabled={running} className="gap-1 gradient-brand text-primary-foreground">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />} Generar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
