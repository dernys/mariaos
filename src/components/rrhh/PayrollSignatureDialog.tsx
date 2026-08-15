import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, PenLine } from "lucide-react";
import type { PayrollRow } from "./payrollTypes";

interface Props {
  payroll: PayrollRow | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function PayrollSignatureDialog({ payroll, onOpenChange, onSaved }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", method: "paper", evidence: "", notes: "" });

  useEffect(() => {
    if (!payroll) return;
    setForm({ name: payroll.employees?.name ?? "", method: "paper", evidence: "", notes: "" });
  }, [payroll]);

  const save = async () => {
    if (!payroll) return;
    setSaving(true);
    const { error } = await (supabase.rpc as any)("register_payroll_signature", {
      p_payroll_id: payroll.id,
      p_signer_name: form.name || null,
      p_method: form.method,
      p_evidence_url: form.evidence || null,
      p_notes: form.notes || null,
      p_document_ref: payroll.receipt_number || null,
    });
    setSaving(false);
    if (error) return toast({ title: "No se pudo registrar la firma", description: error.message, variant: "destructive" });
    toast({ title: "Firma registrada", description: `${form.name} · ${payroll.period_start} → ${payroll.period_end}` });
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={!!payroll} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PenLine className="h-4 w-4 text-primary" />Registrar firma del trabajador</DialogTitle>
          <DialogDescription>
            Queda registrado quién firma, la fecha y hora, el método y la evidencia. La firma se asocia a esta nómina.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Nombre de quien firma</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Método</Label>
            <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="paper">Documento en papel</SelectItem>
                <SelectItem value="digital">Firma digital</SelectItem>
                <SelectItem value="pin">Código / PIN</SelectItem>
                <SelectItem value="biometric">Biométrica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Evidencia (enlace al documento escaneado o imagen)</Label>
            <Input value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} placeholder="https://…" />
          </div>
          <div>
            <Label className="text-xs">Observaciones</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving || !form.name} className="gap-1 gradient-brand text-primary-foreground">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />} Registrar firma
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
