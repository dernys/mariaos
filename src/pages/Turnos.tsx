import { AppLayout } from "@/components/AppLayout";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Play, Square, DollarSign, Plus, Store, ArrowDownCircle, ArrowUpCircle, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { logActivity } from "@/hooks/useActivityLog";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

interface SalesShift {
  id: string;
  user_id: string;
  store_name: string;
  store_id: string | null;
  employee_id: string | null;
  opening_cash: number;
  closing_cash: number | null;
  total_sales: number | null;
  total_transactions: number | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
}

interface StoreItem { id: string; name: string; }
interface Employee { id: string; name: string; position: string | null; }

const Turnos = () => {
  const { user } = useAuth();
  const tenantId = useTenant();
  const nav = useNavigate();
  const [shifts, setShifts] = useState<SalesShift[]>([]);
  const [openShifts, setOpenShifts] = useState<SalesShift[]>([]);
  const [selectedShift, setSelectedShift] = useState<SalesShift | null>(null);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [showCash, setShowCash] = useState(false);

  const [openStoreId, setOpenStoreId] = useState("");
  const [openEmployeeId, setOpenEmployeeId] = useState("");
  const [openCash, setOpenCash] = useState("");
  const [closeCash, setCloseCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  // Cash movement
  const [cashType, setCashType] = useState<"cash_in" | "cash_out">("cash_out");
  const [cashAmount, setCashAmount] = useState("");
  const [cashReason, setCashReason] = useState("");

  // Summary preview at close
  const [summary, setSummary] = useState<{
    opening_cash: number; total_sales: number; total_transactions: number;
    cash_sales: number; card_sales: number; qr_sales: number;
    cash_in: number; cash_out: number; returns_cash: number; expected_cash: number;
  } | null>(null);

  useEffect(() => { if (user && tenantId) fetchAll(); }, [user, tenantId]);

  const fetchAll = async () => {
    const [shiftRes, storeRes, empRes] = await Promise.all([
      supabase.from("sales_shifts").select("*").eq("tenant_id", tenantId).order("opened_at", { ascending: false }).limit(50),
      supabase.from("stores").select("id, name").eq("is_active", true).order("name"),
      supabase.from("employees").select("id, name, position").eq("is_active", true).order("name"),
    ]);
    if (shiftRes.data) {
      const data = shiftRes.data as SalesShift[];
      setShifts(data);
      setOpenShifts(data.filter((s) => s.status === "open"));
    }
    if (storeRes.data) setStores(storeRes.data);
    if (empRes.data) setEmployees(empRes.data);
    setLoading(false);
  };

  const getStoreName = (shift: SalesShift) => {
    if (shift.store_id) return stores.find((s) => s.id === shift.store_id)?.name || shift.store_name;
    return shift.store_name;
  };


  const getEmployeeName = (id: string | null) => employees.find((e) => e.id === id)?.name || "—";

  const openShift = async () => {
    if (!openCash) return toast.error("Ingresa el monto inicial");
    if (!openStoreId) return toast.error("Selecciona una tienda");
    if (!openEmployeeId) return toast.error("Selecciona un cajero");

    const store = stores.find((s) => s.id === openStoreId);
    const { data, error } = await supabase.from("sales_shifts").insert({
      user_id: user!.id,
      store_name: store?.name || "Tienda",
      store_id: openStoreId,
      employee_id: openEmployeeId,
      opening_cash: parseFloat(openCash),
      tenant_id: tenantId,
    }).select("id").single();

    if (error) return toast.error(error.message);
    if (data) {
      await logActivity({ entity_type: "shift", entity_id: data.id, action: "Turno abierto", description: `Cajero: ${getEmployeeName(openEmployeeId)}, Tienda: ${store?.name}`, tenant_id: tenantId, performed_by: user?.id });
    }
    toast.success("Turno abierto correctamente");
    setShowOpen(false);
    setOpenCash("");
    setOpenStoreId("");
    setOpenEmployeeId("");
    fetchAll();
  };

  const loadSummary = async () => {
    if (!selectedShift) return;
    const { data, error } = await supabase.rpc("calculate_shift_summary" as any, { p_shift_id: selectedShift.id });
    if (error) { toast.error(error.message); return; }
    if (data && (data as any[]).length) setSummary((data as any[])[0]);
  };

  const openCloseDialog = async () => {
    setShowClose(true);
    await loadSummary();
  };

  const closeShift = async () => {
    if (!selectedShift || !closeCash) return toast.error("Ingresa el monto de cierre");
    // Cierre Z profesional: genera arqueo + asiento contable + bloqueo en una sola llamada
    const { data, error } = await supabase.rpc("close_shift_z" as any, {
      p_shift_id: selectedShift.id,
      p_counted_cash: parseFloat(closeCash),
    });
    if (error) return toast.error(error.message);
    const diff = (data as any)?.cash_difference ?? (parseFloat(closeCash) - (summary?.expected_cash || 0));
    const journalId = (data as any)?.journal_entry_id;
    await logActivity({ entity_type: "shift", entity_id: selectedShift.id, action: "Cierre Z", description: `Diferencia $${diff.toFixed(2)}${journalId ? ` · Asiento ${journalId.slice(0,8)}` : ""}`, tenant_id: tenantId, performed_by: user?.id });
    toast.success(`Cierre Z generado · Diferencia: $${Number(diff).toFixed(2)}${journalId ? " · Asiento contable creado" : ""}`);
    setShowClose(false); setCloseCash(""); setCloseNotes(""); setSummary(null);
    fetchAll();
  };

  const submitCashMovement = async () => {
    if (!selectedShift || !cashAmount || Number(cashAmount) <= 0) return toast.error("Monto inválido");
    const { error } = await (supabase.from as any)("shift_cash_movements").insert({
      tenant_id: tenantId, shift_id: selectedShift.id,
      movement_type: cashType, amount: parseFloat(cashAmount),
      reason: cashReason || null, performed_by: user?.id,
    });
    if (error) return toast.error(error.message);
    toast.success(cashType === "cash_in" ? "Ingreso registrado" : "Egreso registrado");
    setShowCash(false); setCashAmount(""); setCashReason(""); setCashType("cash_out");
  };

  if (loading) {
    return (
      <AppLayout title="Turnos de Venta">
        <div className="flex items-center justify-center h-64">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Turnos de Venta">
      <div className="space-y-4">
        {/* Active Shift Banner */}
        {selectedShift && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="bg-primary/5 border border-primary/20 rounded-xl p-5">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg gradient-brand flex items-center justify-center">
                  <Play className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-sm">Turno Activo</h3>
                  <p className="text-xs text-muted-foreground">
                    {getStoreName(selectedShift)} · Cajero: {getEmployeeName(selectedShift.employee_id)} · {format(new Date(selectedShift.opened_at), "dd MMM HH:mm", { locale: es })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Caja Inicial</p>
                  <p className="font-heading font-bold text-sm">${selectedShift.opening_cash}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Ventas</p>
                  <p className="font-heading font-bold text-sm text-primary">${selectedShift.total_sales ?? 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Transacciones</p>
                  <p className="font-heading font-bold text-sm">{selectedShift.total_transactions ?? 0}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowCash(true)} className="gap-1 text-xs">
                  <DollarSign className="h-3.5 w-3.5" /> Movimiento
                </Button>
                <Button variant="outline" size="sm" onClick={openCloseDialog} className="gap-1 text-xs border-destructive/30 text-destructive hover:bg-destructive/10">
                  <Square className="h-3.5 w-3.5" /> Cerrar Turno
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Cash Movement Dialog */}
        <Dialog open={showCash} onOpenChange={setShowCash}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Movimiento de Caja</DialogTitle>
              <DialogDescription>Registra ingresos o egresos manuales del turno</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Button variant={cashType === "cash_in" ? "default" : "outline"} onClick={() => setCashType("cash_in")} className="gap-1">
                  <ArrowDownCircle className="h-4 w-4" /> Ingreso
                </Button>
                <Button variant={cashType === "cash_out" ? "default" : "outline"} onClick={() => setCashType("cash_out")} className="gap-1">
                  <ArrowUpCircle className="h-4 w-4" /> Egreso
                </Button>
              </div>
              <div>
                <Label className="text-xs">Monto</Label>
                <Input type="number" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label className="text-xs">Motivo</Label>
                <Input value={cashReason} onChange={(e) => setCashReason(e.target.value)} placeholder="Pago proveedor, retiro..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCash(false)}>Cancelar</Button>
              <Button onClick={submitCashMovement} className="gradient-brand text-primary-foreground">Registrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Close Shift Dialog with Cuadre */}
        <Dialog open={showClose} onOpenChange={setShowClose}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" /> Cierre y Arqueo</DialogTitle>
              <DialogDescription>{selectedShift && `${getStoreName(selectedShift)} · ${getEmployeeName(selectedShift.employee_id)}`}</DialogDescription>
            </DialogHeader>
            {summary ? (
              <div className="space-y-3">
                <div className="bg-muted/40 rounded-lg p-3 space-y-1 text-xs">
                  <div className="flex justify-between"><span>Caja inicial</span><span className="font-heading font-semibold">${Number(summary.opening_cash).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Ventas en efectivo</span><span className="font-heading font-semibold text-success">+${Number(summary.cash_sales).toFixed(2)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Ventas tarjeta</span><span>${Number(summary.card_sales).toFixed(2)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Ventas QR</span><span>${Number(summary.qr_sales).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Ingresos manuales</span><span className="font-heading font-semibold text-success">+${Number(summary.cash_in).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Egresos manuales</span><span className="font-heading font-semibold text-destructive">-${Number(summary.cash_out).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>Devoluciones efectivo</span><span className="font-heading font-semibold text-destructive">-${Number(summary.returns_cash).toFixed(2)}</span></div>
                  <div className="border-t pt-1 mt-1 flex justify-between text-sm">
                    <span className="font-heading font-bold">Esperado en caja</span>
                    <span className="font-heading font-bold text-primary">${Number(summary.expected_cash).toFixed(2)}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Efectivo declarado *</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input type="number" placeholder="0.00" value={closeCash} onChange={(e) => setCloseCash(e.target.value)} className="pl-9 text-lg font-bold" />
                  </div>
                </div>
                {closeCash && (
                  <div className={`text-center p-2 rounded-lg text-sm font-heading font-bold ${
                    Math.abs(parseFloat(closeCash) - summary.expected_cash) < 0.01 ? "bg-success/10 text-success"
                      : parseFloat(closeCash) > summary.expected_cash ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
                  }`}>
                    Diferencia: ${(parseFloat(closeCash) - summary.expected_cash).toFixed(2)}
                  </div>
                )}
                <div>
                  <Label className="text-xs">Notas</Label>
                  <Textarea value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} rows={2} />
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">Calculando...</div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowClose(false)}>Cancelar</Button>
              <Button onClick={closeShift} disabled={!closeCash || !summary} className="gradient-brand text-primary-foreground">
                Confirmar Cierre
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Historial de turnos</p>
          {!selectedShift && (
            <Button size="sm" onClick={() => setShowOpen(!showOpen)} className="gap-1 text-xs gradient-brand text-primary-foreground">
              <Plus className="h-3.5 w-3.5" /> Abrir Turno
            </Button>
          )}
        </div>

        {/* Open Shift Form */}
        <AnimatePresence>
          {showOpen && !selectedShift && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="bg-card rounded-xl p-5 shadow-card border space-y-3">
                <h3 className="font-heading font-semibold text-sm">Abrir Nuevo Turno</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Tienda *</Label>
                    <Select value={openStoreId} onValueChange={setOpenStoreId}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar tienda" /></SelectTrigger>
                      <SelectContent>
                        {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Cajero *</Label>
                    <Select value={openEmployeeId} onValueChange={setOpenEmployeeId}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar cajero" /></SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name} {e.position && `(${e.position})`}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Efectivo Inicial</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input type="number" placeholder="0.00" value={openCash} onChange={(e) => setOpenCash(e.target.value)} className="pl-9" />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setShowOpen(false)}>Cancelar</Button>
                  <Button size="sm" onClick={openShift} className="gradient-brand text-primary-foreground font-heading font-semibold">Abrir Turno</Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Shifts History */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl shadow-card border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Tienda</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Cajero</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Apertura</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">Cierre</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Caja Inicio</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs hidden sm:table-cell">Caja Cierre</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Ventas</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Estado</th>
                </tr>
              </thead>
              <tbody>
                {shifts.length === 0 ? (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground text-xs">No hay turnos registrados</td></tr>
                ) : (
                  shifts.map((shift) => (
                    <tr key={shift.id} onClick={() => nav(`/turnos/${shift.id}`)} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors">
                      <td className="p-3 text-xs font-medium flex items-center gap-2">
                        <Store className="h-3.5 w-3.5 text-muted-foreground" />
                        {getStoreName(shift)}
                      </td>
                      <td className="p-3 text-xs">{getEmployeeName(shift.employee_id)}</td>
                      <td className="p-3 text-xs text-muted-foreground">{format(new Date(shift.opened_at), "dd/MM HH:mm")}</td>
                      <td className="p-3 text-xs text-muted-foreground hidden sm:table-cell">{shift.closed_at ? format(new Date(shift.closed_at), "dd/MM HH:mm") : "—"}</td>
                      <td className="p-3 text-xs font-heading font-semibold">${shift.opening_cash}</td>
                      <td className="p-3 text-xs font-heading font-semibold hidden sm:table-cell">{shift.closing_cash != null ? `$${shift.closing_cash}` : "—"}</td>
                      <td className="p-3 text-xs font-heading font-semibold text-primary">${shift.total_sales ?? 0}</td>
                      <td className="p-3">
                        <Badge variant={shift.status === "open" ? "default" : "secondary"} className="text-[10px]">
                          {shift.status === "open" ? "Abierto" : "Cerrado"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </AppLayout>
  );
};

export default Turnos;
