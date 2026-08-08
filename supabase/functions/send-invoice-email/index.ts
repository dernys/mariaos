import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
};

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

    const { invoice_id, pdf_base64 } = await req.json();
    if (!invoice_id || !pdf_base64) {
      return new Response(JSON.stringify({ error: "Faltan parámetros" }), { status: 400, headers: corsHeaders });
    }

    const { data: inv, error } = await supabase.from("invoices").select("*").eq("id", invoice_id).single();
    if (error || !inv) return new Response(JSON.stringify({ error: "Factura no encontrada" }), { status: 404, headers: corsHeaders });
    if (!inv.customer_email) return new Response(JSON.stringify({ error: "Cliente sin email" }), { status: 400, headers: corsHeaders });

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

    const subject = `Factura ${inv.invoice_number} de ${inv.issuer_name}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1f2937">
        <h2 style="color:#10b981;margin:0 0 16px">Factura ${inv.invoice_number}</h2>
        <p>Hola ${inv.customer_name},</p>
        <p>Adjuntamos tu factura por un total de <strong>${Number(inv.total).toFixed(2)} ${inv.currency}</strong>.</p>
        <p>Gracias por tu compra,<br/><strong>${inv.issuer_name}</strong></p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: `${inv.issuer_name} <onboarding@resend.dev>`,
        to: [inv.customer_email],
        subject,
        html,
        attachments: [{ filename: `Factura_${inv.invoice_number}.pdf`, content: pdf_base64 }],
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
