import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
};

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const plain = (v: unknown) => String(v ?? "").replace(/[\r\n<>"]/g, " ").slice(0, 120);

/** Only accept a real, bounded PDF document as attachment. */
function isValidPdfBase64(b64: unknown): b64 is string {
  if (typeof b64 !== "string" || b64.length > 14_000_000 || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) return false;
  try { return atob(b64.slice(0, 16).replace(/\s/g, "")).startsWith("%PDF-"); } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Validar usuario
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: corsHeaders });

    // Attachments are never accepted from the caller; the email body is built from stored invoice data only.
    const { invoice_id } = await req.json();
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: "Faltan parámetros" }), { status: 400, headers: corsHeaders });
    }

    const { data: inv, error } = await supabase.from("invoices").select("*").eq("id", invoice_id).single();
    if (error || !inv) return new Response(JSON.stringify({ error: "Factura no encontrada" }), { status: 404, headers: corsHeaders });

    // SEC-011 (IDOR): el llamante debe pertenecer al tenant dueño de la factura.
    const { data: member } = await supabase.from("tenant_users").select("id").eq("user_id", user.id).eq("tenant_id", inv.tenant_id).maybeSingle();
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const canSend = (roles ?? []).some((r: any) => ["admin", "gerente", "contador"].includes(r.role));
    if (!member || !canSend) {
      return new Response(JSON.stringify({ error: "Sin acceso a esta factura" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Recipient must be the email saved on the linked customer record, not a free-text invoice field.
    if (!inv.customer_id) return new Response(JSON.stringify({ error: "La factura no tiene cliente registrado" }), { status: 400, headers: corsHeaders });
    const { data: cust } = await supabase.from("customers").select("email").eq("id", inv.customer_id).eq("tenant_id", inv.tenant_id).maybeSingle();
    const recipient = String(cust?.email ?? "").trim();
    if (!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(recipient)) return new Response(JSON.stringify({ error: "Cliente sin email válido" }), { status: 400, headers: corsHeaders });
    inv.customer_email = recipient;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      // Modo placeholder: solo marca envío
      await supabase.from("invoices").update({
        email_sent_to: inv.customer_email,
        email_sent_at: new Date().toISOString(),
      }).eq("id", invoice_id);
      return new Response(JSON.stringify({
        ok: true,
        warning: "Email no enviado: configura RESEND_API_KEY o un dominio verificado para enviar emails reales. Por ahora se ha registrado el envío.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const subject = `Factura ${plain(inv.invoice_number)} de ${plain(inv.issuer_name)}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f2937">
        <h2 style="color:#10b981;margin:0 0 16px">Factura ${esc(inv.invoice_number)}</h2>
        <p>Hola ${esc(inv.customer_name)},</p>
        <p>Te enviamos tu factura por un total de <strong>${Number(inv.total).toFixed(2)} ${esc(inv.currency)}</strong>.</p>
        <p>Gracias por tu compra,<br/><strong>${esc(inv.issuer_name)}</strong></p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: `${plain(inv.issuer_name)} <onboarding@resend.dev>`,
        to: [inv.customer_email],
        subject,
        html,
      }),
    });
    const result = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: result.message ?? "Error en proveedor de email" }),
        { status: 500, headers: corsHeaders });
    }

    await supabase.from("invoices").update({
      email_sent_to: inv.customer_email,
      email_sent_at: new Date().toISOString(),
    }).eq("id", invoice_id);

    return new Response(JSON.stringify({ ok: true, id: result.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: corsHeaders });
  }
});
