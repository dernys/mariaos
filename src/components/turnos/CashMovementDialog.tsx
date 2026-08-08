import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ArrowDownCircle, ArrowUpCircle, Landmark } from "lucide-react";
import { toast } from "sonner";
import { CashDirection, cashCategoriesFor, CASH_CATEGORIES } from "./cashCategories";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shiftId: string | null;
  availableCash?: number;
  onDone?: () => void;
}

export function CashMovementDialog({ open, onOpenChange, shiftId, availableCash, onDone }: Props) {
  const [direction, setDirection] = useState<CashDirection>("out");
  const [category, setCategory] = useState("expense");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDirection("out"); setCategory("expense"); setAmount(""); setReason("");
    }
  }, [open]);

  const options = cashCategoriesFor(direction).map((c) => ({ value: c.value, label: c.label }));
  const counterpart = CASH_CATEGORIES.find((c) => c.value === category)?.account;
  const amt = parseFloat(amount || "0");
  const insufficient = direction === "out" && availableCash !== undefined && amt > availableCash + 0.001;

  const switchDirection = (d: CashDirection) => {
    setDirection(d);
    setCategory(d === "in" ? "bank_withdrawal" : "expense");
  };

  const submit = async () => {
    if (!shiftId) return;
    if (!amt || amt <= 0) return toast.error("Monto inválido");
    if (insufficient) return toast.error("Efectivo insuficiente en caja");
    if (!reason.trim()) return toast.error("Indica el concepto del movimiento (auditoría)");
    setSaving(true);
    const { data, error } = await supabase.rpc("register_shift_cash_movement" as any, {
      p_shift_id: shiftId,
      p_movement_type: direction,
      p_amount: amt,
      p_category: category,
      p_reason: reason.trim(),
      p_currency: "CUP",
      p_exchange_rate: 1,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    const entry = (data as any)?.journal_entry_id;
    toast.success(
      `${direction === "in" ? "Ingreso" : "Egreso"} de caja registrado`,
      { description: entry ? `Asiento contable ${String(entry).slice(0, 8)} contabilizado` : "Sin asiento (revisa el plan de cuentas)" }
    );
    onOpenChange(false);
    onDone?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Movimiento de caja</DialogTitle>
          <DialogDescription>
            Todo movimiento genera su asiento contable automáticamente y queda en la auditoría del turno.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button variant={direction === "in" ? "default" : "outline"} onClick={() => switchDirection("in")} className="gap-1">
              <ArrowDownCircle className="h-4 w-4" /> Ingreso
            </Button>
            <Button variant={direction === "out" ? "default" : "outline"} onClick={() => switchDirection("out")} className="gap-1">
              <ArrowUpCircle className="h-4 w-4" /> Egreso
            </Button>
          </div>

          <div>
            <Label className="text-xs">Concepto contable *</Label>
            <SearchableSelect value={category} onChange={setCategory} options={options} placeholder="Selecciona" />
            {counterpart && (
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <Landmark className="h-3 w-3" /> Contrapartida: {counterpart} ↔ Caja
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Monto *</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="text-lg font-bold" />
            {availableCash !== undefined && (
              <p className={`text-[11px] mt-1 ${insufficient ? "text-destructive" : "text-muted-foreground"}`}>
                Efectivo disponible en caja: ${availableCash.toFixed(2)}
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Concepto / justificación *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Pago de gas, depósito en banco, retiro autorizado..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || insufficient} className="gradient-brand text-primary-foreground">
            {saving ? "Registrando..." : "Registrar y contabilizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
