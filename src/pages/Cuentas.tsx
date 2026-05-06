import { AppLayout } from "@/components/AppLayout";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Wallet, ArrowDownToLine, ArrowUpFromLine, History, Users, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useTableState } from "@/hooks/useTableState";
import { TableToolbar } from "@/components/data/TableToolbar";
import { TablePagination } from "@/components/data/TablePagination";
import { MiniStatCard, StatRow } from "@/components/data/MiniStatCard";

type PartyType = "customer" | "employee" | "supplier";

interface Party {
  id: string;
  name: string;
  balance: number;
  phone?: string | null;
  email?: string | null;
}

interface Movement {
  id: string;
  party_type: PartyType;
  party_id: string;
  reference_type: string | null;
  reference_id: string | null;
  direction: "in" | "out";
  method: string;
  currency: string;
  amount: number;
  amount_in_base: number;
  notes: string | null;
  created_at: string;
}

export default function Cuentas() {
  const { toast } = useToast();
  const [tab, setTab] = useState<PartyType>("customer");
  const [customers, setCustomers] = useState<Party[]>([]);
  const [employees, setEmployees] = useState<Party[]>([]);
  const [suppliers, setSuppliers] = useState<Party[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);

  const [payOpen, setPayOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeParty, setActiveParty] = useState<Party | null>(null);

  // Pay form
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    const [c, e, s, m] = await Promise.all([
      supabase.from("customers").select("id, name, balance, phone, email").order("name"),
      supabase.from("employees").select("id, name, balance, phone, email").eq("is_active", true).order("name"),
      (supabase.from as any)("suppliers").select("id, name, balance, phone, email").eq("is_active", true).order("name"),
      (supabase.from as any)("account_payments").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    setCustomers((c.data as Party[]) || []);
    setEmployees((e.data as Party[]) || []);
    setSuppliers((s.data as Party[]) || []);
    setMovements((m.data as Movement[]) || []);
  };

  useEffect(() => { fetchAll(); }, []);

  const list = tab === "customer" ? customers : tab === "employee" ? employees : suppliers;
  const isPayable = tab === "supplier";
  const totalDebt = list.reduce((a, b) => a + Math.max(0, Number(b.balance || 0)), 0);
  const withDebt = list.filter((p) => Number(p.balance || 0) > 0).length;

  const table = useTableState({
    data: list,
    searchKeys: ["name", "phone", "email"],
    filterFns: {
      balance: (p, v) => v === "with" ? Number(p.balance || 0) > 0 : v === "without" ? Number(p.balance || 0) <= 0 : true,
    },
  });

  const openPay = (p: Party) => {
    setActiveParty(p);
    setAmount(String(Math.max(0, Number(p.balance || 0))));
    setMethod("cash");
    setNotes("");
    setPayOpen(true);
  };

  const openHistory = (p: Party) => {
    setActiveParty(p);
    setHistoryOpen(true);
  };

  const submitPayment = async () => {
    if (!activeParty) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast({ title: "Monto inválido", variant: "destructive" }); return; }
    setSaving(true);
    const { error } = await supabase.rpc("register_account_payment" as any, {
      p_party_type: tab,
      p_party_id: activeParty.id,
      p_amount: amt,
      p_method: method,
      p_currency: "CUP",
      p_exchange_rate: 1,
      p_reference_type: "adjustment",
      p_reference_id: null,
      p_notes: notes || null,
    });
    setSaving(false);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    toast({
      title: isPayable ? "Pago registrado al proveedor" : "Cobro registrado",
      description: `$${amt.toFixed(2)} — ${activeParty.name}`,
    });
    setPayOpen(false);
    fetchAll();
  };

  const partyMovements = activeParty
    ? movements.filter((m) => m.party_id === activeParty.id && m.party_type === tab)
    : [];

  return (
    <AppLayout title="Cuentas por Cobrar y Pagar">
      <Tabs value={tab} onValueChange={(v) => setTab(v as PartyType)} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="customer" className="gap-1"><Wallet className="h-3.5 w-3.5" />Clientes</TabsTrigger>
            <TabsTrigger value="employee" className="gap-1"><Wallet className="h-3.5 w-3.5" />Empleados</TabsTrigger>
            <TabsTrigger value="supplier" className="gap-1"><DollarSign className="h-3.5 w-3.5" />Proveedores</TabsTrigger>
          </TabsList>
          <div className="text-xs text-muted-foreground">
            {isPayable ? "Total por pagar" : "Total por cobrar"}:{" "}
            <span className="font-heading font-bold text-foreground">${totalDebt.toFixed(2)}</span>
          </div>
        </div>

        {(["customer", "employee", "supplier"] as PartyType[]).map((t) => (
          <TabsContent key={t} value={t}>
            <div className="bg-card rounded-xl shadow-card border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Nombre</TableHead>
                    <TableHead className="text-xs">Contacto</TableHead>
                    <TableHead className="text-xs text-right">Saldo</TableHead>
                    <TableHead className="text-xs w-44 text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((p) => {
                    const debt = Number(p.balance || 0);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs font-medium">{p.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.phone || p.email || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className={`text-[10px] ${
                            debt > 0 ? (t === "supplier" ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive") :
                            debt < 0 ? "bg-success/10 text-success" : "bg-muted"
                          }`}>
                            ${debt.toFixed(2)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => openHistory(p)}>
                              <History className="h-3 w-3 mr-1" /> Historial
                            </Button>
                            <Button size="sm" className="h-7 text-[10px] gradient-brand text-primary-foreground" onClick={() => openPay(p)} disabled={debt <= 0}>
                              {t === "supplier" ? <ArrowUpFromLine className="h-3 w-3 mr-1" /> : <ArrowDownToLine className="h-3 w-3 mr-1" />}
                              {t === "supplier" ? "Pagar" : "Cobrar"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {list.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-8">Sin registros</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Payment dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isPayable ? "Pagar a proveedor" : "Registrar cobro"}</DialogTitle>
            <DialogDescription>
              {activeParty?.name} — saldo actual: <strong>${Number(activeParty?.balance || 0).toFixed(2)}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Monto</Label>
              <Input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Método</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Efectivo</SelectItem>
                  <SelectItem value="card">Tarjeta</SelectItem>
                  <SelectItem value="transfer">Transferencia</SelectItem>
                  <SelectItem value="qr">QR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Notas</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancelar</Button>
            <Button className="gradient-brand text-primary-foreground" onClick={submitPayment} disabled={saving}>
              {saving ? "Guardando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de operaciones — {activeParty?.name}</DialogTitle>
            <DialogDescription>Saldo actual: ${Number(activeParty?.balance || 0).toFixed(2)}</DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Fecha</TableHead>
                <TableHead className="text-xs">Tipo</TableHead>
                <TableHead className="text-xs">Método</TableHead>
                <TableHead className="text-xs">Notas</TableHead>
                <TableHead className="text-xs text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partyMovements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs">{format(new Date(m.created_at), "dd/MM/yy HH:mm")}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className={`text-[10px] ${m.direction === "in" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                      {m.direction === "in" ? "Cobro" : "Pago"}
                    </Badge>
                    {m.reference_type && <span className="ml-1 text-muted-foreground text-[10px]">({m.reference_type})</span>}
                  </TableCell>
                  <TableCell className="text-xs capitalize">{m.method}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.notes || "—"}</TableCell>
                  <TableCell className="text-xs text-right font-heading font-bold">${Number(m.amount_in_base).toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {partyMovements.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Sin movimientos registrados</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
