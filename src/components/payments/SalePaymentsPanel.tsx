import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";
import {
  PAYMENT_STATUS_LABEL, methodLabel, statusTone, type PaymentStatus,
} from "@/lib/finance/paymentMethods";

export interface SalePaymentRow {
  id: string;
  method: string;
  currency: string;
  amount: number | string;
  amount_in_base: number | string;
  status?: string | null;
  provider?: string | null;
  channel?: string | null;
  reference?: string | null;
  provider_transaction_id?: string | null;
  confirmed_at?: string | null;
  created_at: string;
}

interface Props {
  payments: SalePaymentRow[];
  /** Recarga la venta y sus pagos tras confirmar/rechazar. */
  onChanged?: () => void;
}

const toneClass: Record<string, string> = {
  success: "bg-success/10 text-success border-success/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  destructive: "bg-destructive/10 text-destructive border-destructive/30",
  muted: "bg-muted text-muted-foreground",
};

/**
 * Pagos de una venta con su estado real. Los medios digitales/transferencias
 * entran como PENDING y sólo se cobran vía `confirm_sale_payment` (servidor):
 * la UI nunca marca un pago como cobrado por su cuenta.
 */
export function SalePaymentsPanel({ payments, onChanged }: Props) {
  const { toast } = useToast();
  const { get } = usePermissions();
  const canConfirm = get("turnos").can_edit || get("cuentas").can_edit;

  const [target, setTarget] = useState<SalePaymentRow | null>(null);
  const [mode, setMode] = useState<"PAID" | "FAILED">("PAID");
  const [reference, setReference] = useState("");
  const [txId, setTxId] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const openDialog = (p: SalePaymentRow, m: "PAID" | "FAILED") => {
    setTarget(p);
    setMode(m);
    setReference(p.reference || "");
    setTxId(p.provider_transaction_id || "");
    setNotes("");
  };

  const submit = async () => {
    if (!target) return;
    if (mode === "PAID" && !reference.trim()) {
      toast({ title: "Referencia requerida", description: "Registra la referencia real del cobro antes de confirmarlo.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { error } = await (supabase.rpc as any)("confirm_sale_payment", {
        p_payment_id: target.id,
        p_status: mode,
        p_reference: reference.trim() || null,
        p_provider_transaction_id: txId.trim() || null,
        p_notes: notes.trim() || null,
        p_idempotency_key: `confirm:${target.id}:${mode}`,
        p_correlation_id: `confirm:${target.id}`,
      });
      if (error) throw error;
      toast({
        title: mode === "PAID" ? "Pago confirmado" : "Pago rechazado",
        description: mode === "PAID"
          ? "Se registró el cobro y su asiento contable."
          : "El pago queda como fallido y la deuda se mantiene.",
      });
      setTarget(null);
      onChanged?.();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const pendingTotal = payments
    .filter((p) => ["PENDING", "CREATED"].includes((p.status || "").toUpperCase()))
    .reduce((s, p) => s + Number(p.amount_in_base || 0), 0);
  const paidTotal = payments
    .filter((p) => (p.status || "").toUpperCase() === "PAID")
    .reduce((s, p) => s + Number(p.amount_in_base || 0), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cobrado en firme</p>
          <p className="font-heading text-lg font-bold text-success">${paidTotal.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border bg-card p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Digital por confirmar</p>
          <p className="font-heading text-lg font-bold text-warning">${pendingTotal.toFixed(2)}</p>
        </div>
      </div>

      <div className="bg-card rounded-xl border overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-xs">Fecha</TableHead>
            <TableHead className="text-xs">Medio</TableHead>
            <TableHead className="text-xs">Estado</TableHead>
            <TableHead className="text-xs">Referencia</TableHead>
            <TableHead className="text-xs">Moneda</TableHead>
            <TableHead className="text-xs text-right">Monto</TableHead>
            <TableHead className="text-xs text-right">En base</TableHead>
            <TableHead className="text-xs text-right">Acciones</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {payments.map((p) => {
              const status = ((p.status || "PAID").toUpperCase()) as PaymentStatus;
              const isPending = status === "PENDING" || status === "CREATED";
              return (
                <TableRow key={p.id}>
                  <TableCell className="text-xs">{format(new Date(p.created_at), "dd/MM/yy HH:mm")}</TableCell>
                  <TableCell className="text-xs font-medium">
                    {methodLabel(p.method)}
                    {p.provider && <span className="ml-1 text-[10px] text-muted-foreground">({p.provider})</span>}
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className={`text-[10px] ${toneClass[statusTone(status)]}`}>
                      {isPending && <Clock className="mr-1 h-3 w-3" />}
                      {PAYMENT_STATUS_LABEL[status] ?? status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[10px] font-mono text-muted-foreground">{p.reference || p.provider_transaction_id || "—"}</TableCell>
                  <TableCell className="text-xs">{p.currency}</TableCell>
                  <TableCell className="text-xs text-right">${Number(p.amount).toFixed(2)}</TableCell>
                  <TableCell className="text-xs text-right font-bold">${Number(p.amount_in_base).toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    {isPending && canConfirm && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-[10px]" onClick={() => openDialog(p, "PAID")}>
                          <CheckCircle2 className="h-3 w-3" /> Confirmar
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-[10px] text-destructive" onClick={() => openDialog(p, "FAILED")}>
                          <XCircle className="h-3 w-3" /> Rechazar
                        </Button>
                      </div>
                    )}
                    {isPending && !canConfirm && (
                      <span className="text-[10px] text-muted-foreground">Requiere autorización</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {payments.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-6">Sin pagos</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === "PAID" ? "Confirmar cobro" : "Rechazar pago"}</DialogTitle>
            <DialogDescription>
              {target && <>{methodLabel(target.method)} · ${Number(target.amount_in_base).toFixed(2)} en base</>}
              {mode === "PAID"
                ? " · Se verifica contra el comprobante real del proveedor."
                : " · La deuda del cliente se mantiene."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {mode === "PAID" && (
              <>
                <div>
                  <Label className="text-xs">Referencia del cobro *</Label>
                  <Input className="h-9 text-xs" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Nro. de operación / transferencia" />
                </div>
                <div>
                  <Label className="text-xs">ID de transacción del proveedor</Label>
                  <Input className="h-9 text-xs" value={txId} onChange={(e) => setTxId(e.target.value)} placeholder="Opcional" />
                </div>
              </>
            )}
            <div>
              <Label className="text-xs">Notas</Label>
              <Input className="h-9 text-xs" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancelar</Button>
            <Button onClick={submit} disabled={busy} className={mode === "PAID" ? "gradient-brand text-primary-foreground" : ""} variant={mode === "PAID" ? "default" : "destructive"}>
              {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              {mode === "PAID" ? "Confirmar cobro" : "Marcar fallido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
