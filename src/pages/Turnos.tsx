import { AppLayout } from "@/components/AppLayout";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Play, Square, DollarSign, Plus, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { logActivity } from "@/hooks/useActivityLog";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

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
  const [shifts, setShifts] = useState<SalesShift[]>([]);
  const [activeShift, setActiveShift] = useState<SalesShift | null>(null);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOpen, setShowOpen] = useState(false);
  const [showClose, setShowClose] = useState(false);

  const [openStoreId, setOpenStoreId] = useState("");
  const [openEmployeeId, setOpenEmployeeId] = useState("");
  const [openCash, setOpenCash] = useState("");
  const [closeCash, setCloseCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");

  useEffect(() => { if (user) fetchAll(); }, [user]);

  const fetchAll = async () => {
    const [shiftRes, storeRes, empRes] = await Promise.all([
      supabase.from("sales_shifts").select("*").eq("user_id", user!.id).order("opened_at", { ascending: false }).limit(20),
      supabase.from("stores").select("id, name").eq("is_active", true).order("name"),
      supabase.from("employees").select("id, name, position").eq("is_active", true).order("name"),
    ]);
    if (shiftRes.data) {
      const data = shiftRes.data as SalesShift[];
      setShifts(data);
      setActiveShift(data.find((s) => s.status === "open") ?? null);
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

  const closeShift = async () => {
    if (!activeShift || !closeCash) return toast.error("Ingresa el monto de cierre");
    const { error } = await supabase.from("sales_shifts").update({
      status: "closed", closed_at: new Date().toISOString(),
      closing_cash: parseFloat(closeCash), notes: closeNotes || null,
    }).eq("id", activeShift.id);

    if (error) return toast.error(error.message);
    await logActivity({ entity_type: "shift", entity_id: activeShift.id, action: "Turno cerrado", description: `Caja cierre: $${closeCash}`, tenant_id: tenantId, performed_by: user?.id });
    toast.success("Turno cerrado correctamente");
    setShowClose(false);
    setCloseCash("");
    setCloseNotes("");
    fetchAll();
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
        {activeShift && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="bg-primary/5 border border-primary/20 rounded-xl p-5">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg gradient-brand flex items-center justify-center">
                  <Play className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-heading font-semibold text-sm">Turno Activo</h3>
                  <p className="text-xs text-muted-foreground">
                    {getStoreName(activeShift)} · Cajero: {getEmployeeName(activeShift.employee_id)} · {format(new Date(activeShift.opened_at), "dd MMM HH:mm", { locale: es })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Caja Inicial</p>
                  <p className="font-heading font-bold text-sm">${activeShift.opening_cash}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Ventas</p>
                  <p className="font-heading font-bold text-sm text-primary">${activeShift.total_sales ?? 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">Transacciones</p>
                  <p className="font-heading font-bold text-sm">{activeShift.total_transactions ?? 0}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowClose(true)} className="gap-1 text-xs border-destructive/30 text-destructive hover:bg-destructive/10">
                  <Square className="h-3.5 w-3.5" /> Cerrar Turno
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Close Shift Dialog */}
        <AnimatePresence>
          {showClose && activeShift && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm p-4">
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-card rounded-2xl shadow-elevated border p-6 w-full max-w-sm">
                <h2 className="font-heading font-semibold text-lg mb-1">Cerrar Turno</h2>
                <p className="text-xs text-muted-foreground mb-4">{getStoreName(activeShift)} · Cajero: {getEmployeeName(activeShift.employee_id)}</p>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Efectivo en Caja</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input type="number" placeholder="0.00" value={closeCash} onChange={(e) => setCloseCash(e.target.value)} className="pl-9" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Notas (opcional)</Label>
                    <Textarea placeholder="Observaciones..." value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} rows={3} />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" className="flex-1" onClick={() => setShowClose(false)}>Cancelar</Button>
                  <Button onClick={closeShift} className="flex-1 gradient-brand text-primary-foreground font-heading font-semibold">Confirmar Cierre</Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Historial de turnos</p>
          {!activeShift && (
            <Button size="sm" onClick={() => setShowOpen(!showOpen)} className="gap-1 text-xs gradient-brand text-primary-foreground">
              <Plus className="h-3.5 w-3.5" /> Abrir Turno
            </Button>
          )}
        </div>

        {/* Open Shift Form */}
        <AnimatePresence>
          {showOpen && !activeShift && (
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
                    <tr key={shift.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
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
