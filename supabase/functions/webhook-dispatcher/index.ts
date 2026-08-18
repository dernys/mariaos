import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function hmacSha256Hex(secret: string, body: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // SEC-013: el despachador hace peticiones salientes a URLs de tenants (riesgo SSRF/abuso).
  // Sólo se ejecuta con el secreto de cron o por un superadmin autenticado.
  const runnerSecret = Deno.env.get("WEBHOOK_DISPATCH_SECRET") ?? "";
  const provided = req.headers.get("x-dispatch-secret") ?? "";
  let authorized = !!runnerSecret && provided === runnerSecret;
  if (!authorized) {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (token) {
      const { data: { user } } = await admin.auth.getUser(token);
      if (user) {
        const { data: isSA } = await admin.rpc("is_superadmin", { _user_id: user.id });
        authorized = !!isSA;
      }
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Pull up to 25 pending deliveries due now
  const { data: pending } = await admin
    .from("webhook_deliveries")
    .select("id, webhook_id, event, payload, attempts, tenant_id")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .limit(25);

  if (!pending?.length) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let processed = 0;
  for (const d of pending) {
    const { data: wh } = await admin.from("webhooks")
      .select("url, secret, is_active, failure_count")
      .eq("id", d.webhook_id).maybeSingle();
    if (!wh || !wh.is_active) {
      await admin.from("webhook_deliveries").update({ status: "cancelled" }).eq("id", d.id);
      continue;
    }

    // SEC-014 (SSRF): sólo destinos HTTPS públicos.
    if (!isPublicHttpsUrl(wh.url)) {
      await admin.from("webhook_deliveries").update({
        status: "failed", response: "destino no permitido (solo HTTPS público)",
      }).eq("id", d.id);
      await admin.from("webhooks").update({ is_active: false }).eq("id", d.webhook_id);
      continue;
    }

    const body = JSON.stringify({
      event: d.event,
      tenant_id: d.tenant_id,
      delivered_at: new Date().toISOString(),
      data: d.payload,
    });
    const signature = await hmacSha256Hex(wh.secret, body);

    let status = 0, responseText = "";
    try {
      const res = await fetch(wh.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MarIA-Event": d.event,
          "X-MarIA-Signature": signature,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      status = res.status;
      responseText = (await res.text()).slice(0, 500);
    } catch (e) {
      responseText = String((e as Error).message || e).slice(0, 500);
    }

    const success = status >= 200 && status < 300;
    const attempts = (d.attempts || 0) + 1;
    if (success) {
      await admin.from("webhook_deliveries").update({
        status: "delivered", status_code: status, response: responseText,
        attempts, delivered_at: new Date().toISOString(),
      }).eq("id", d.id);
      await admin.from("webhooks").update({
        last_delivery_at: new Date().toISOString(), failure_count: 0,
      }).eq("id", d.webhook_id);
    } else if (attempts >= 6) {
      await admin.from("webhook_deliveries").update({
        status: "failed", status_code: status, response: responseText, attempts,
      }).eq("id", d.id);
      await admin.from("webhooks").update({ failure_count: (wh.failure_count || 0) + 1 }).eq("id", d.webhook_id);
    } else {
      const backoffMin = Math.pow(2, attempts); // 2,4,8,16,32 min
      await admin.from("webhook_deliveries").update({
        status: "pending", status_code: status, response: responseText, attempts,
        next_attempt_at: new Date(Date.now() + backoffMin * 60_000).toISOString(),
      }).eq("id", d.id);
    }
    processed++;
  }

  return new Response(JSON.stringify({ processed }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
