import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useTranslation } from "react-i18next";
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
import { FileText, Download, Mail, Plus, Ban, Send, Settings, Code2, ShoppingCart } from "lucide-react";
import { downloadInvoicePdf, InvoiceData } from "@/lib/invoicePdf";
import { useNavigate } from "react-router-dom";
import { QuickSaleDialog } from "@/components/invoices/QuickSaleDialog";
import { EInvoiceSettingsDialog } from "@/components/invoices/EInvoiceSettingsDialog";
import { MiniStatCard } from "@/components/data/MiniStatCard";
import { TableToolbar } from "@/components/data/TableToolbar";
import { ExportButton } from "@/components/data/ExportButton";
import { TablePagination } from "@/components/data/TablePagination";
import { useServerTable, useTableStats } from "@/hooks/useServerTable";
import { TableDataState } from "@/components/data/DataState";
import { useTaxRates } from "@/hooks/useTaxRates";

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
  transmission_status?: string | null;
  cufe?: string | null;
  xml_content?: string | null;
}

const Facturas = () => {
  const { t } = useTranslation();
  const { tenantId } = useTenantContext();
  const { taxes, defaultTax } = useTaxRates();
  const [issueOpen, setIssueOpen] = useState(false);
  const [pendingSales, setPendingSales] = useState<any[]>([]);
  const [selectedSale, setSelectedSale] = useState<string>("");
  const [issueSeries, setIssueSeries] = useState<string>("");
  const [issueTaxId, setIssueTaxId] = useState<string>("");
  const [seriesList, setSeriesList] = useState<any[]>([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [transmittingId, setTransmittingId] = useState<string | null>(null);
  const nav = useNavigate();

  const table = useServerTable<Invoice>({
    table: "invoices",
    select:
      "id, series_code, invoice_number, issue_date, status, customer_name, total, amount_paid, currency, email_sent_at, customer_email, pdf_url, transmission_status, cufe, xml_content",
    searchColumns: ["invoice_number", "customer_name", "series_code"],
    orderBy: { column: "issue_date", ascending: false },
    scope: tenantId,
    enabled: !!tenantId,
    baseFilter: (q) => q.eq("tenant_id", tenantId),
    filterFns: { status: (q, v) => q.eq("status", v) },
  });
  const {
    rows: paged, page, setPage, pageSize, setPageSize, total, search, setSearch, filters, setFilter,
  } = table;
  const loading = table.loading;

  const statsQuery = useTableStats<{ status: string; total: number; amount_paid: number; transmission_status: string | null }>(
    "invoices",
    "status,total,amount_paid,transmission_status",
    { scope: tenantId, enabled: !!tenantId, baseFilter: (q) => q.eq("tenant_id", tenantId) },
  );

  const load = async () => {
    table.invalidate();
    await statsQuery.refetch();
  };


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
    const { data: series } = await supabase
      .from("invoice_series")
      .select("id, code, name, is_default")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("code");
    setSeriesList(series ?? []);
    setIssueSeries((series ?? []).find((s: any) => s.is_default)?.code || (series ?? [])[0]?.code || "");
    setIssueTaxId(defaultTax?.id || "");
    setSelectedSale("");
    setIssueOpen(true);
  };

  const issueInvoice = async () => {
    if (!selectedSale) return;
    const { error } = await (supabase.rpc as any)("issue_invoice_with_tax", {
      p_sale_id: selectedSale,
      p_series_code: issueSeries || null,
      p_tax_rate_id: issueTaxId || null,
    });
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
    const inv = paged.find((i) => i.id === id);
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

  const allStats = statsQuery.data ?? [];
  const issued = allStats.filter((i) => i.status === "issued");
  const totalBilled = issued.reduce((s, i) => s + Number(i.total), 0);
  const totalPaid = issued.reduce((s, i) => s + Number(i.amount_paid), 0);
  const transmitted = issued.filter((i) => i.transmission_status === "transmitted").length;

  const downloadXml = (inv: Invoice) => {
    if (!inv.xml_content) { toast.error("Esta factura aún no tiene XML. Transmítela primero."); return; }
    const blob = new Blob([inv.xml_content], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Factura_${inv.invoice_number}.xml`; a.click();
    URL.revokeObjectURL(url);
  };

  const transmit = async (id: string) => {
    setTransmittingId(id);
    const { data, error } = await supabase.functions.invoke("transmit-invoice", { body: { invoice_id: id } });
    setTransmittingId(null);
    if (error) { toast.error("Error al transmitir: " + error.message); return; }
    if ((data as any)?.status === "failed") toast.error("Transmisión fallida. Revisa la configuración del proveedor.");
    else toast.success("Factura transmitida (CUFE: " + ((data as any)?.cufe || "").slice(0, 12) + "…)");
    await load();
  };

  return (
    <AppLayout title={t("modules.invoices.title")}>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <MiniStatCard label="Facturas" value={allStats.length} icon={FileText} />

        <MiniStatCard label="Emitidas" value={issued.length} tone="success" />
        <MiniStatCard label="Transmitidas" value={transmitted} tone="primary" />
        <MiniStatCard label="Total facturado" value={totalBilled.toFixed(2)} tone="primary" />
        <MiniStatCard label="Cobrado" value={totalPaid.toFixed(2)} tone="success" />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">{t("modules.invoices.header")}</h2>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => setSettingsOpen(true)} size="sm" variant="outline" className="gap-1">
              <Settings className="h-4 w-4" /> Facturación electrónica
            </Button>
            <Button onClick={() => nav("/pos")} size="sm" variant="outline" className="gap-1">
              <ShoppingCart className="h-4 w-4" /> {t("modules.invoices.goPos")}
            </Button>
            <Button onClick={() => setQuickOpen(true)} size="sm" variant="outline" className="gap-1">
              <Plus className="h-4 w-4" /> Venta rápida
            </Button>
            <Button onClick={openIssue} size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> {t("modules.invoices.issue")}
            </Button>
          </div>
        </div>

        <TableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por número o cliente..."
          filters={[
            {
              key: "status",
              label: "Estado",
              value: filters.status ?? "__all__",
              onChange: (v) => setFilter("status", v),
              options: [
                                { value: "issued", label: "Emitidas" },
                { value: "cancelled", label: "Anuladas" },
              ],
            },
          ]}
          rightSlot={
            <ExportButton
              rows={paged}
              filename="facturas"
              title="Facturas"
              columns={[
                { key: "invoice_number", label: "Número" },
                { key: "created_at", label: "Fecha" },
                { key: "customer_name", label: "Cliente" },
                { key: "customer_tax_id", label: "RFC/NIF" },
                { key: "subtotal", label: "Subtotal" },
                { key: "tax", label: "Impuesto" },
                { key: "total", label: "Total" },
                { key: "amount_paid", label: "Pagado" },
                { key: "status", label: "Estado" },
              ]}
            />
          }
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
                <TableHead>Transmisión</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableDataState
                colSpan={8}
                loading={loading}
                error={table.error}
                empty={!loading && paged.length === 0}
                emptyTitle="Sin facturas"
                emptyHint="Emite tu primera factura desde una venta cobrada."
                icon={FileText}
                onRetry={() => table.refetch()}
              />
              {paged.map((inv) => {

                const tStatus = inv.transmission_status || "local";
                return (
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
                    <Badge variant="outline" className={`text-[10px] ${
                      tStatus === "transmitted" ? "bg-success/10 text-success" :
                      tStatus === "failed" ? "bg-destructive/10 text-destructive" :
                      tStatus === "pending" ? "bg-warning/10 text-warning" : "bg-muted"
                    }`} title={inv.cufe ? `CUFE: ${inv.cufe}` : ""}>
                      {tStatus === "transmitted" ? "Transmitida" : tStatus === "failed" ? "Fallida" : tStatus === "pending" ? "Pendiente" : "Local"}
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
                      <Button size="icon" variant="ghost" title={t("modules.invoices.downloadPdf")} onClick={() => downloadPdf(inv.id)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      {inv.xml_content && (
                        <Button size="icon" variant="ghost" title={t("modules.invoices.downloadXml")} onClick={() => downloadXml(inv)}>
                          <Code2 className="h-4 w-4" />
                        </Button>
                      )}
                      {inv.status === "issued" && tStatus !== "transmitted" && (
                        <Button size="icon" variant="ghost" title={t("modules.invoices.transmit")}
                          disabled={transmittingId === inv.id} onClick={() => transmit(inv.id)}>
                          <Send className={`h-4 w-4 ${transmittingId === inv.id ? "animate-pulse" : ""}`} />
                        </Button>
                      )}
                      {inv.customer_email && inv.status === "issued" && (
                        <Button size="icon" variant="ghost" title={t("modules.invoices.sendEmail")} onClick={() => sendEmail(inv.id)}>
                          <Mail className="h-4 w-4" />
                        </Button>
                      )}
                      {inv.status === "issued" && (
                        <Button size="icon" variant="ghost" title={t("modules.invoices.voidInvoice")} onClick={() => cancelInvoice(inv.id)}>
                          <Ban className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );})}
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
              <SelectTrigger><SelectValue placeholder={t("modules.invoices.chooseSale")} /></SelectTrigger>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Serie</Label>
                <Select value={issueSeries || "auto"} onValueChange={(v) => setIssueSeries(v === "auto" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Serie por defecto" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Serie por defecto</SelectItem>
                    {seriesList.map((s: any) => (
                      <SelectItem key={s.id} value={s.code}>{s.code} — {s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Impuesto a aplicar</Label>
                <Select value={issueTaxId || "none"} onValueChange={(v) => setIssueTaxId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Sin impuesto" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin impuesto (0%)</SelectItem>
                    {taxes.map((tr) => (
                      <SelectItem key={tr.id} value={tr.id}>{tr.name} — {Number(tr.rate)}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Los tipos de impuesto se administran en Configuración → Impuestos. Solo se recalcula el importe si la venta
              no tenía impuesto ni cobros registrados; en el resto de casos la factura conserva los importes de la venta.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueOpen(false)}>Cancelar</Button>
            <Button onClick={issueInvoice} disabled={!selectedSale}>{t("modules.invoices.issueAction")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuickSaleDialog open={quickOpen} onOpenChange={setQuickOpen} onCreated={() => load()} />
      <EInvoiceSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </AppLayout>
  );
};

export default Facturas;
