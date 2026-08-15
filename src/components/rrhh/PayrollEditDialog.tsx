import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";

export interface EditablePayroll {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  base_salary: number;
  hours_worked: number;
  bonus: number;
  deductions: number;
  net_pay: number;
  status: string;
  notes?: string | null;
  payment_method?: string | null;
  employees?: { name: string; position?: string | null };
}

interface Props {
  payroll: EditablePayroll | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function PayrollEditDialog({ payroll, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ base: "0", hours: "0", bonus: "0", ded: "0", notes: "", method: "transfer" });

  useEffect(() => {
    if (!payroll) return;
    setForm({
      base: String(payroll.base_salary ?? 0),
      hours: String(payroll.hours_worked ?? 0),
      bonus: String(payroll.bonus ?? 0),
      ded: String(payroll.deductions ?? 0),
      notes: payroll.notes ?? "",
      method: payroll.payment_method ?? "transfer",
    });
  }, [payroll]);

  const n = (v: string) => parseFloat(v || "0") || 0;
  const gross = n(form.base) + n(form.bonus);
  const net = gross - n(form.ded);

  const save = async () => {
    if (!payroll) return;
    setSaving(true);
    const { error } = await (supabase.rpc as any)("update_payroll_run", {
      p_payroll_id: payroll.id,
      p_bonus: n(form.bonus),
      p_deductions: n(form.ded),
      p_hours_worked: n(form.hours),
      p_base_salary: n(form.base),
      p_notes: form.notes || null,
      p_payment_method: form.method,
    });
    setSaving(false);
    if (error) return toast({ title: "No se pudo guardar", description: error.message, variant: "destructive" });
    toast({ title: "Nómina actualizada", description: `Neto recalculado: $${net.toFixed(2)}` });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={!!payroll} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar nómina</DialogTitle>
          <DialogDescription>
            {payroll?.employees?.name} · {payroll?.period_start} → {payroll?.period_end}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Salario base del período</Label>
              <Input type="number" step="0.01" value={form.base} onChange={(e) => setForm({ ...form, base: e.target.value })} /></div>
            <div><Label className="text-xs">Horas trabajadas</Label>
              <Input type="number" step="0.01" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></div>
            <div><Label className="text-xs">Bonos / incentivos</Label>
              <Input type="number" step="0.01" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} /></div>
            <div><Label className="text-xs">Deducciones</Label>
              <Input type="number" step="0.01" value={form.ded} onChange={(e) => setForm({ ...form, ded: e.target.value })} /></div>
          </div>

          <div><Label className="text-xs">Forma de pago</Label>
            <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="transfer">Transferencia</SelectItem>
                <SelectItem value="cash">Efectivo</SelectItem>
                <SelectItem value="card">Tarjeta</SelectItem>
                <SelectItem value="other">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div><Label className="text-xs">Notas</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Justificación de ajustes, incidencias del período…" /></div>

          <div className="rounded-lg border p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Bruto</span><span className="tabular-nums">${gross.toFixed(2)}</span></div>
            <div className="flex justify-between text-destructive"><span>Deducciones</span><span className="tabular-nums">-${n(form.ded).toFixed(2)}</span></div>
            <div className="flex justify-between border-t pt-1 font-bold"><span>Neto a pagar</span><span className="tabular-nums">${net.toFixed(2)}</span></div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving} className="gap-1 gradient-brand text-primary-foreground">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
