import { AppLayout } from "@/components/AppLayout";
import { useTranslation } from "react-i18next";
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DetailHeader } from "@/components/detail/DetailHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Clock, Eye, DollarSign, Undo2, Ban, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { CashFlowPanel, type ShiftSummary } from "@/components/turnos/CashFlowPanel";
import { CashMovementDialog } from "@/components/turnos/CashMovementDialog";
import { useTenant } from "@/hooks/useTenant";



interface SaleRow {
  id: string;
  ticket_number: string | null;
  total: number;
  amount_paid: number;
  status: string;
  created_at: string;
  customer_id: string | null;
  employee_id: string | null;
  cancel_reason?: string | null;
}

export default function TurnoDetalle() {
  const { t } = useTranslation();
  const { id } = useParams();
  const nav = useNavigate();
  const { toast } = useToast();
  const tenantId = useTenant();

  const [shift, setShift] = useState<any>(null);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [showCash, setShowCash] = useState(false);

  const [movements, setMovements] = useState<any[]>([]);

  // dialogs
  const [paySale, setPaySale] = useState<SaleRow | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [paying, setPaying] = useState(false);

  const [cancelSale, setCancelSale] = useState<SaleRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!id || !tenantId) return;
    const [sR, mR, salesR, sumR] = await Promise.all([
      supabase.from("sales_shifts").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle(),
      (supabase.from as any)("shift_cash_movements").select("*").eq("shift_id", id).eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      supabase
        .from("sales")
        .select("id, ticket_number, total, amount_paid, status, created_at, customer_id, employee_id, cancel_reason")
        .eq("shift_id", id)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false }),
      (supabase.rpc as any)("calculate_shift_summary", { p_shift_id: id }),
    ]);
    setShift(sR.data); setMovements(mR.data || []); setSales((salesR.data || []) as SaleRow[]);
    if (sumR.data) setSummary(sumR.data);
  }, [id, tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);


  const openPay = (s: SaleRow) => {
    const pending = Number(s.total) - Number(s.amount_paid);
    setPaySale(s);
    setPayAmount(pending > 0 ? pending.toFixed(2) : "");
    setPayMethod("cash");
  };

  const submitPay = async () => {
    if (!paySale) return;
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) { toast({ title: "Monto inválido", variant: "destructive" }); return; }
    const partyType = paySale.customer_id ? "customer" : paySale.employee_id ? "employee" : null;
    const partyId = paySale.customer_id || paySale.employee_id;
    if (!partyType || !partyId) {
      toast({ title: "Sin contraparte", description: "La venta no tiene cliente ni empleado para registrar el pago.", variant: "destructive" });
      return;
    }
    setPaying(true);
    const { error } = await (supabase.rpc as any)("register_account_payment", {
      p_party_type: partyType,
      p_party_id: partyId,
      p_amount: amt,
      p_method: payMethod,
      p_currency: "CUP",
      p_exchange_rate: 1,
      p_reference_type: "sale",
      p_reference_id: paySale.id,
      p_notes: `Cobro de saldo de ticket ${paySale.ticket_number || paySale.id.slice(0, 8)}`,
    });
    setPaying(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Pago registrado", description: `$${amt.toFixed(2)} aplicado a la venta` });
    setPaySale(null);
    fetchAll();
  };

  const submitCancel = async () => {
    if (!cancelSale) return;
    if (cancelReason.trim().length < 3) {
      toast({ title: "Motivo requerido", description: "Indica el motivo de la cancelación.", variant: "destructive" });
      return;
    }
    setCancelling(true);
    const { error } = await (supabase.rpc as any)("cancel_sale", {
      p_sale_id: cancelSale.id,
      p_reason: cancelReason.trim(),
    });
    setCancelling(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Venta cancelada", description: "Stock revertido y registro conservado en el historial." });
    setCancelSale(null);
    setCancelReason("");
    fetchAll();
  };

  if (!shift) return <AppLayout title={t("nav.items.shifts")}><p className="text-sm text-muted-foreground">{t("common.loading")}</p></AppLayout>;

  const statusVariant = (s: string) =>
    s === "paid" ? "default"
    : s === "partial" ? "outline"
    : s === "pending" ? "secondary"
    : s === "cancelled" ? "destructive"
    : "outline";

  return (
    <AppLayout title={`Turno ${shift.id.slice(0, 8)}`}>
      <div className="space-y-6">
        <DetailHeader
          icon={Clock}
          title={`Turno · ${shift.store_name || "Tienda"}`}
          subtitle={`Apertura: ${format(new Date(shift.opened_at), "dd/MM/yy HH:mm")}${shift.closed_at ? ` · Cierre: ${format(new Date(shift.closed_at), "dd/MM/yy HH:mm")}` : ""}`}
          backTo="/turnos"
          badges={[{ label: shift.status === "open" ? "Abierto" : "Cerrado", variant: shift.status === "open" ? "default" : "secondary" }]}
          kpis={[
            { label: "Caja inicial", value: `$${Number(shift.opening_cash || 0).toFixed(2)}` },
            { label: "Ventas", value: `$${Number(summary?.total_sales ?? shift.total_sales ?? 0).toFixed(2)}`, tone: "primary" },
            { label: "Transacciones", value: summary?.transactions ?? shift.total_transactions ?? 0 },
            {
              label: shift.status === "open" ? "Efectivo esperado" : "Diferencia",
              value: `$${Number(shift.status === "open" ? (summary?.expected_cash ?? 0) : (shift.cash_difference ?? 0)).toFixed(2)}`,
              tone: shift.status === "open" ? "success" : (Math.abs(Number(shift.cash_difference || 0)) < 0.01 ? "success" : "warning"),
            },

          ]}
        />

        <Tabs defaultValue="caja">
          <TabsList>
            <TabsTrigger value="caja">Caja y flujo</TabsTrigger>
            <TabsTrigger value="ventas">Ventas ({sales.length})</TabsTrigger>
            <TabsTrigger value="resumen">Arqueo</TabsTrigger>
          </TabsList>

          <TabsContent value="caja">
            <CashFlowPanel
              summary={summary}
              movements={movements}
              isOpen={shift.status === "open" && !shift.locked}
              onNewMovement={() => setShowCash(true)}
            />
          </TabsContent>

          <TabsContent value="resumen">
            <div className="bg-card rounded-xl border p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {summary && Object.entries(summary)
                .filter(([, v]) => typeof v === "number")
                .map(([k, v]) => (
                <div key={k} className="bg-muted/40 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground capitalize">{k.replace(/_/g, " ")}</p>
                  <p className="font-heading font-bold mt-0.5">
                    {k === "transactions" ? Number(v as number) : `$${Number(v as number).toFixed(2)}`}
                  </p>
                </div>
              ))}
              {shift.z_journal_entry_id && (
                <div className="bg-success/10 border border-success/20 rounded-lg p-3">
                  <p className="text-[10px] text-muted-foreground">Asiento de descuadre</p>
                  <p className="font-heading font-bold mt-0.5 text-success">{String(shift.z_journal_entry_id).slice(0, 8)}</p>
                </div>
              )}
            </div>
          </TabsContent>


          <TabsContent value="ventas">
            <div className="bg-card rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">Ticket</TableHead>
                    <TableHead className="text-xs">Hora</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs text-right">Pagado</TableHead>
                    <TableHead className="text-xs text-right">Saldo</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                    <TableHead className="text-xs text-right w-44">Acciones</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {sales.map((s) => {
                      const pending = Number(s.total) - Number(s.amount_paid);
                      const isCancelled = s.status === "cancelled";
                      const hasParty = !!(s.customer_id || s.employee_id);
                      return (
                        <TableRow key={s.id} className={isCancelled ? "opacity-60" : ""}>
                          <TableCell className="text-xs font-medium">
                            {s.ticket_number || s.id.slice(0, 8)}
                            {isCancelled && s.cancel_reason && (
                              <p className="text-[10px] text-destructive mt-0.5 flex items-center gap-1">
                                <AlertTriangle className="h-2.5 w-2.5" /> {s.cancel_reason}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">{format(new Date(s.created_at), "HH:mm")}</TableCell>
                          <TableCell className="text-xs text-right font-bold">${Number(s.total).toFixed(2)}</TableCell>
                          <TableCell className="text-xs text-right">${Number(s.amount_paid).toFixed(2)}</TableCell>
                          <TableCell className="text-xs text-right">
                            {pending > 0.01 && !isCancelled ? (
                              <span className="font-bold text-warning">${pending.toFixed(2)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(s.status) as any} className="text-[10px] capitalize">{s.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Ver detalle"
                                onClick={() => nav(`/ventas/${s.id}`)}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              {!isCancelled && pending > 0.01 && hasParty && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-success" title="Cobrar saldo"
                                  onClick={() => openPay(s)}>
                                  <DollarSign className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {!isCancelled && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Devolver"
                                  onClick={() => nav(`/devoluciones?sale=${s.id}`)}>
                                  <Undo2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {!isCancelled && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" title="Cancelar venta"
                                  onClick={() => { setCancelSale(s); setCancelReason(""); }}>
                                  <Ban className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {sales.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">Sin ventas en este turno</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>



        </Tabs>
      </div>

      {/* Pay credit dialog */}
      <Dialog open={!!paySale} onOpenChange={(o) => !o && setPaySale(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Cobrar saldo</DialogTitle>
            <DialogDescription>
              Ticket {paySale?.ticket_number || paySale?.id.slice(0, 8)} · Saldo pendiente ${(Number(paySale?.total || 0) - Number(paySale?.amount_paid || 0)).toFixed(2)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Monto</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="pl-9 font-bold" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Método</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="card">Tarjeta</SelectItem>
                  <SelectItem value="transfer">Transferencia</SelectItem>
                  <SelectItem value="qr">QR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaySale(null)}>Cancelar</Button>
            <Button onClick={submitPay} disabled={paying} className="gradient-brand text-primary-foreground">
              {paying ? "Procesando..." : "Registrar pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel sale dialog */}
      <Dialog open={!!cancelSale} onOpenChange={(o) => !o && setCancelSale(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Ban className="h-5 w-5 text-destructive" /> Cancelar venta</DialogTitle>
            <DialogDescription>
              Ticket {cancelSale?.ticket_number || cancelSale?.id.slice(0, 8)}. Se revertirá el stock vendido y el saldo pendiente.
              La venta queda en el historial como <b>cancelada</b>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Motivo de cancelación *</Label>
              <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3}
                placeholder="Ej. Error del cajero, cliente desistió, productos equivocados..." />
              <p className="text-[10px] text-muted-foreground mt-1">Mínimo 3 caracteres. Quedará registrado en la actividad.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelSale(null)}>No cancelar</Button>
            <Button variant="destructive" onClick={submitCancel} disabled={cancelling}>
              {cancelling ? "Cancelando..." : "Confirmar cancelación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CashMovementDialog
        open={showCash}
        onOpenChange={setShowCash}
        shiftId={id ?? null}
        availableCash={summary?.expected_cash}
        onDone={fetchAll}
      />
    </AppLayout>

  );
}
