// Edge function: generates UBL-like XML for an invoice, computes a CUFE
// (SHA-256 fingerprint) and optionally POSTs it to a tenant-configured webhook.
// Acts as the integration hook for any electronic invoicing provider.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
};

function escapeXml(s: any): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function sha256(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildUblXml(inv: any, cufe: string, settings: any): string {
  const items = (inv.items as any[]) || [];
  const lines = items
    .map((it, i) => `
    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="EA">${Number(it.qty || 0)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${escapeXml(inv.currency)}">${Number(it.total || 0).toFixed(2)}</cbc:LineExtensionAmount>
      <cac:Item><cbc:Name>${escapeXml(it.product_name)}</cbc:Name>${it.sku ? `<cbc:SellersItemIdentification><cbc:ID>${escapeXml(it.sku)}</cbc:ID></cbc:SellersItemIdentification>` : ""}</cac:Item>
      <cac:Price><cbc:PriceAmount currencyID="${escapeXml(inv.currency)}">${Number(it.price || 0).toFixed(2)}</cbc:PriceAmount></cac:Price>
    </cac:InvoiceLine>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>${escapeXml(settings?.tax_regime || "generic")}</cbc:CustomizationID>
  <cbc:ID>${escapeXml(inv.invoice_number)}</cbc:ID>
  <cbc:UUID>${cufe}</cbc:UUID>
  <cbc:IssueDate>${escapeXml(inv.issue_date)}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${escapeXml(inv.currency)}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyName><cbc:Name>${escapeXml(settings?.legal_name || inv.issuer_name)}</cbc:Name></cac:PartyName>
    <cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(settings?.legal_tax_id || inv.issuer_tax_id || "")}</cbc:CompanyID></cac:PartyTaxScheme>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyName><cbc:Name>${escapeXml(inv.customer_name)}</cbc:Name></cac:PartyName>
    <cac:PartyTaxScheme><cbc:CompanyID>${escapeXml(inv.customer_tax_id || "")}</cbc:CompanyID></cac:PartyTaxScheme>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="${escapeXml(inv.currency)}">${Number(inv.tax || 0).toFixed(2)}</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${escapeXml(inv.currency)}">${Number(inv.subtotal || 0).toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${escapeXml(inv.currency)}">${Number(inv.subtotal || 0).toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${escapeXml(inv.currency)}">${Number(inv.total || 0).toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${escapeXml(inv.currency)}">${Number(inv.total || 0).toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lines}
</Invoice>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: corsHeaders });

    const { invoice_id } = await req.json();
    if (!invoice_id) return new Response(JSON.stringify({ error: "invoice_id requerido" }), { status: 400, headers: corsHeaders });

    const { data: inv, error } = await supabase.from("invoices").select("*").eq("id", invoice_id).single();
    if (error || !inv) return new Response(JSON.stringify({ error: "Factura no encontrada" }), { status: 404, headers: corsHeaders });

    // Verify membership (or superadmin)
    const { data: member } = await supabase.from("tenant_users").select("id").eq("user_id", user.id).eq("tenant_id", inv.tenant_id).maybeSingle();
    const { data: sa } = await supabase.from("superadmins").select("id").eq("user_id", user.id).maybeSingle();
    if (!member && !sa) return new Response(JSON.stringify({ error: "Sin acceso a este tenant" }), { status: 403, headers: corsHeaders });

    const { data: settings } = await supabase.from("einvoice_settings").select("*").eq("tenant_id", inv.tenant_id).maybeSingle();

    // Compute CUFE (deterministic fingerprint)
    const fingerprintBase = `${inv.invoice_number}|${inv.issue_date}|${inv.issuer_tax_id || ""}|${inv.customer_tax_id || ""}|${Number(inv.total).toFixed(2)}|${inv.currency}|${settings?.signature_key || "local"}`;
    const cufe = await sha256(fingerprintBase);
    const xml = buildUblXml(inv, cufe, settings);

    let status = "transmitted";
    let providerResponse: any = { mode: "local", cufe };
    const provider = settings?.provider || "local";

    if (settings?.mode === "electronic" && settings?.webhook_url) {
      try {
        const res = await fetch(settings.webhook_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/xml",
            "X-Invoice-Number": inv.invoice_number,
            "X-CUFE": cufe,
            ...(settings.webhook_secret ? { Authorization: `Bearer ${settings.webhook_secret}` } : {}),
          },
          body: xml,
        });
        const text = await res.text();
        providerResponse = { mode: "electronic", status: res.status, body: text.slice(0, 4000), cufe };
        status = res.ok ? "transmitted" : "failed";
      } catch (e) {
        status = "failed";
        providerResponse = { mode: "electronic", error: (e as Error).message, cufe };
      }
    }

    await supabase.rpc("mark_invoice_transmitted", {
      p_invoice_id: invoice_id,
      p_status: status,
      p_cufe: cufe,
      p_xml: xml,
      p_xml_url: null,
      p_provider: provider,
      p_response: providerResponse,
    });

    return new Response(JSON.stringify({ ok: status === "transmitted", status, cufe, xml, provider_response: providerResponse }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
