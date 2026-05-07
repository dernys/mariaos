import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { toast } from "sonner";
import { FileText, Download, Mail, Plus, Ban } from "lucide-react";
import { downloadInvoicePdf, InvoiceData } from "@/lib/invoicePdf";
import { MiniStatCard } from "@/components/data/MiniStatCard";
import { TableToolbar } from "@/components/data/TableToolbar";
import { ExportButton } from "@/components/data/ExportButton";
import { TablePagination } from "@/components/data/TablePagination";
import { useTableState } from "@/hooks/useTableState";

interface Invoice {
  id: string;
  series_code: string;
  invoice_number: string;
  issue_date: string;
  status: string;
  customer_name: string;
  total: number;
  amount_paid: number;
  currency: string;
  email_sent_at: string | null;
  customer_email: string | null;
  pdf_url: string | null;
}

const Facturas = () => {
  const { tenantId } = useTenantContext();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [issueOpen, setIssueOpen] = useState(false);
  const [pendingSales, setPendingSales] = useState<any[]>([]);
  const [selectedSale, setSelectedSale] = useState<string>("");

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data } = await supabase
      .from("invoices")
      .select("id, series_code, invoice_number, issue_date, status, customer_name, total, amount_paid, currency, email_sent_at, customer_email, pdf_url")
      .eq("tenant_id", tenantId)
      .order("issue_date", { ascending: false })
      .limit(500);
    setInvoices((data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [tenantId]);

  const openIssue = async () => {
    if (!tenantId) return;
    // Ventas pagadas/parciales sin factura
    const { data: sales } = await supabase
      .from("sales")
      .select("id, ticket_number, total, status, created_at, customer_id, customers(name)")
      .eq("tenant_id", tenantId)
      .in("status", ["paid", "partial"])
      .order("created_at", { ascending: false })
      .limit(100);
    const { data: existing } = await supabase
      .from("invoices")
      .select("sale_id").eq("tenant_id", tenantId).eq("status", "issued");
    const used = new Set((existing ?? []).map((i: any) => i.sale_id));
    setPendingSales((sales ?? []).filter((s: any) => !used.has(s.id)));
    setSelectedSale("");
    setIssueOpen(true);
  };

  const issueInvoice = async () => {
    if (!selectedSale) return;
    const { data, error } = await supabase.rpc("issue_invoice", { p_sale_id: selectedSale, p_series_code: null });
    if (error) { toast.error(error.message); return; }
    toast.success("Factura emitida");
    setIssueOpen(false);
    await load();
  };

  const fetchFull = async (id: string): Promise<InvoiceData | null> => {
    const { data, error } = await supabase.from("invoices").select("*").eq("id", id).single();
    if (error || !data) { toast.error("No se pudo cargar la factura"); return null; }
    return {
      ...data,
      items: Array.isArray((data as any).items) ? (data as any).items : [],
    } as any;
  };

  const downloadPdf = async (id: string) => {
    const full = await fetchFull(id);
    if (full) downloadInvoicePdf(full);
  };

  const sendEmail = async (id: string) => {
    const inv = invoices.find((i) => i.id === id);
    if (!inv?.customer_email) { toast.error("La factura no tiene email del cliente"); return; }
    const full = await fetchFull(id);
    if (!full) return;
    toast.info("Generando PDF y enviando...");
    const { getInvoicePdfBase64 } = await import("@/lib/invoicePdf");
    const pdfBase64 = getInvoicePdfBase64(full);
    const { error } = await supabase.functions.invoke("send-invoice-email", {
      body: { invoice_id: id, pdf_base64: pdfBase64 },
    });
    if (error) { toast.error("Error al enviar: " + error.message); return; }
    toast.success("Factura enviada por email");
    await load();
  };

  const cancelInvoice = async (id: string) => {
    const reason = prompt("Motivo de anulación:");
    if (!reason) return;
    const { error } = await supabase
      .from("invoices")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_reason: reason })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Factura anulada");
    await load();
  };

  const issued = invoices.filter((i) => i.status === "issued");
  const totalBilled = issued.reduce((s, i) => s + Number(i.total), 0);
  const totalPaid = issued.reduce((s, i) => s + Number(i.amount_paid), 0);

  const { paged, page, setPage, pageSize, setPageSize, total, search, setSearch, filters, setFilter } = useTableState({
    data: invoices,
    searchKeys: ["invoice_number", "customer_name", "series_code"],
  });

  return (
    <AppLayout title="Facturas">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MiniStatCard label="Facturas" value={invoices.length} icon={FileText} />
        <MiniStatCard label="Emitidas" value={issued.length} tone="success" />
        <MiniStatCard label="Total facturado" value={totalBilled.toFixed(2)} tone="primary" />
        <MiniStatCard label="Cobrado" value={totalPaid.toFixed(2)} tone="success" />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-lg font-semibold">Facturas emitidas</h2>
          <Button onClick={openIssue} size="sm" className="gap-2">
            <Plus className="h-4 w-4" /> Emitir factura
          </Button>
        </div>

        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por número o cliente..."
          filters={[
            {
              key: "status",
              label: "Estado",
              value: filters.status ?? "all",
              onChange: (v) => setFilter("status", v),
              options: [
                { value: "all", label: "Todos" },
                { value: "issued", label: "Emitidas" },
                { value: "cancelled", label: "Anuladas" },
              ],
            },
          ]}
        />

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Cargando...</TableCell></TableRow>
              ) : paged.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin facturas</TableCell></TableRow>
              ) : paged.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>{inv.issue_date}</TableCell>
                  <TableCell>{inv.customer_name}</TableCell>
                  <TableCell className="text-right">{Number(inv.total).toFixed(2)} {inv.currency}</TableCell>
                  <TableCell>
                    <Badge variant={inv.status === "issued" ? "default" : "destructive"}>
                      {inv.status === "issued" ? "Emitida" : "Anulada"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {inv.email_sent_at ? (
                      <Badge variant="secondary" className="text-xs">Enviada</Badge>
                    ) : inv.customer_email ? (
                      <span className="text-xs text-muted-foreground">{inv.customer_email}</span>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" title="Descargar PDF" onClick={() => downloadPdf(inv.id)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      {inv.customer_email && inv.status === "issued" && (
                        <Button size="icon" variant="ghost" title="Enviar por email" onClick={() => sendEmail(inv.id)}>
                          <Mail className="h-4 w-4" />
                        </Button>
                      )}
                      {inv.status === "issued" && (
                        <Button size="icon" variant="ghost" title="Anular" onClick={() => cancelInvoice(inv.id)}>
                          <Ban className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </Card>

      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Emitir factura desde venta</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Selecciona una venta cobrada sin factura</Label>
            <Select value={selectedSale} onValueChange={setSelectedSale}>
              <SelectTrigger><SelectValue placeholder="Elegir venta..." /></SelectTrigger>
              <SelectContent>
                {pendingSales.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {(s.ticket_number || s.id.slice(0, 8))} — {s.customers?.name ?? "Consumidor"} — {Number(s.total).toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {pendingSales.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay ventas pendientes de facturar.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)}>Cancelar</Button>
            <Button onClick={issueInvoice} disabled={!selectedSale}>Emitir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Facturas;
