import { AppLayout } from "@/components/AppLayout";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { ExportButton } from "@/components/data/ExportButton";
import { TablePagination } from "@/components/data/TablePagination";
import { MiniStatCard, StatRow } from "@/components/data/MiniStatCard";
import { MultiPaymentDialog } from "@/components/payments/MultiPaymentDialog";

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
  const nav = useNavigate();
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
    setPayOpen(true);
  };

  const openHistory = (p: Party) => {
    const path = tab === "customer" ? `/clientes/${p.id}` : tab === "employee" ? `/empleados/${p.id}` : `/proveedores/${p.id}`;
    nav(path);
  };


  return (
    <AppLayout title="Cuentas por Cobrar y Pagar">
      <Tabs value={tab} onValueChange={(v) => setTab(v as PartyType)} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="customer" className="gap-1"><Wallet className="h-3.5 w-3.5" />Clientes</TabsTrigger>
            <TabsTrigger value="employee" className="gap-1"><Wallet className="h-3.5 w-3.5" />Empleados</TabsTrigger>
            <TabsTrigger value="supplier" className="gap-1"><DollarSign className="h-3.5 w-3.5" />Proveedores</TabsTrigger>
          </TabsList>
        </div>

        <StatRow>
          <MiniStatCard label="Total" value={list.length} icon={Users} tone="primary" />
          <MiniStatCard label="Con saldo" value={withDebt} icon={AlertTriangle} tone={withDebt > 0 ? "warning" : "default"} />
          <MiniStatCard
            label={isPayable ? "Por pagar" : "Por cobrar"}
            value={`$${totalDebt.toLocaleString()}`}
            icon={DollarSign}
            tone={totalDebt > 0 ? (isPayable ? "warning" : "destructive") : "success"}
          />
        </StatRow>

        <TableToolbar
          search={table.search}
          onSearchChange={table.setSearch}
          searchPlaceholder="Buscar por nombre, teléfono, email..."
          filters={[{
            key: "balance", label: "Saldo", value: table.filters.balance || "__all__",
            onChange: (v) => table.setFilter("balance", v),
            options: [{ value: "with", label: "Con saldo" }, { value: "without", label: "Sin saldo" }],
          }]}
          rightSlot={
            <ExportButton
              rows={table.filtered}
              filename={`cuentas-${tab}`}
              title="Cuentas"
              columns={[
                { key: "name", label: "Nombre" },
                { key: "phone", label: "Teléfono" },
                { key: "email", label: "Email" },
                { key: "balance", label: "Saldo" },
              ]}
            />
          }
        />

        <TabsContent value={tab}>
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
                {table.paged.map((p) => {
                  const debt = Number(p.balance || 0);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs font-medium">{p.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.phone || p.email || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={`text-[10px] ${
                          debt > 0 ? (isPayable ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive") :
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
                            {isPayable ? <ArrowUpFromLine className="h-3 w-3 mr-1" /> : <ArrowDownToLine className="h-3 w-3 mr-1" />}
                            {isPayable ? "Pagar" : "Cobrar"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {table.total === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-8">Sin registros</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
            <TablePagination page={table.page} pageSize={table.pageSize} total={table.total}
              onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />
          </div>
        </TabsContent>
      </Tabs>


      {/* Payment dialog (multi-currency, multi-method) */}
      {activeParty && (
        <MultiPaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          partyType={tab}
          partyId={activeParty.id}
          partyName={activeParty.name}
          amountDue={Math.max(0, Number(activeParty.balance || 0))}
          referenceType={null}
          title={isPayable ? "Pagar a proveedor" : "Registrar cobro"}
          onPaid={fetchAll}
        />
      )}

    </AppLayout>
  );
}
