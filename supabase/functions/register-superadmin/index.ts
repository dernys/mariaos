// Superadmin bootstrap is permanently closed: the superadmin already exists and
// this endpoint must never create privileged accounts again.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(JSON.stringify({ error: "bootstrap_disabled" }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
