// Risk scanner — analiza datos reales del tenant, deduplica alertas abiertas
// e incorpora análisis de IA (Lovable AI Gateway) con acciones recomendadas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

type Alert = {
  tenant_id: string;
  severity: "low" | "medium" | "high" | "critical";
  category: string;
  title: string;
  description: string;
  entity_type?: string;
  entity_id?: string | null;
  metadata?: Record<string, unknown>;
};

const num = (v: unknown) => Number(v ?? 0);
const money = (v: unknown) => num(v).toFixed(2);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes?.user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const tenant_id: string | undefined = body?.tenant_id;
    const useAi: boolean = body?.ai !== false;
    if (!tenant_id) return json({ error: "tenant_id required" }, 400);

    // El usuario debe pertenecer al tenant (o ser superadmin)
    const [{ data: membership }, { data: superadmin }] = await Promise.all([
      userClient.from("tenant_users").select("tenant_id").eq("tenant_id", tenant_id).maybeSingle(),
      userClient.from("superadmins").select("user_id").maybeSingle(),
    ]);
    if (!membership && !superadmin) return json({ error: "forbidden" }, 403);

    const admin = createClient(supabaseUrl, serviceKey);
    const alerts: Alert[] = [];
    const now = Date.now();
    const since = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const since30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const todayIso = new Date().toISOString().slice(0, 10);

    const T = (t: string) => admin.from(t).select("*", { count: "exact" }).eq("tenant_id", tenant_id);

    const [
      cancels, negStock, cust, lowStockProducts, shifts, unpaidSales,
      draftEntries, overduePayables, expiringLots, returns, openShifts,
    ] = await Promise.all([
      admin.from("sales").select("id, total, cancel_reason, created_at").eq("tenant_id", tenant_id).eq("status", "cancelled").gte("created_at", since),
      admin.from("product_stock").select("product_id, stock, location_type, location_id").eq("tenant_id", tenant_id).lt("stock", 0).limit(50),
      admin.from("customers").select("id, name, balance").eq("tenant_id", tenant_id).gt("balance", 0).order("balance", { ascending: false }).limit(10),
      admin.from("products").select("id, name, min_stock").eq("tenant_id", tenant_id).gt("min_stock", 0).limit(300),
      admin.from("sales_shifts").select("id, store_name, cash_difference, closed_at, status").eq("tenant_id", tenant_id).eq("status", "closed").gte("closed_at", since30).limit(200),
      admin.from("sales").select("id, ticket_number, total, amount_paid, customer_id, employee_id, created_at").eq("tenant_id", tenant_id).eq("status", "completed").gte("created_at", since30).limit(500),
      admin.from("journal_entries").select("id, entry_number, date, status").eq("tenant_id", tenant_id).neq("status", "posted").lte("date", todayIso).limit(200),
      admin.from("accounts_payable").select("id, description, amount, amount_paid, due_date, status").eq("tenant_id", tenant_id).neq("status", "paid").lt("due_date", todayIso).limit(200),
      admin.from("product_lots").select("id, lot_number, expiration_date, quantity, product_id").eq("tenant_id", tenant_id).gt("quantity", 0).not("expiration_date", "is", null).lte("expiration_date", new Date(now + 15 * 86400000).toISOString().slice(0, 10)).limit(100),
      admin.from("sale_returns").select("id, total, created_at").eq("tenant_id", tenant_id).gte("created_at", since30).limit(300),
      admin.from("sales_shifts").select("id, store_name, opened_at").eq("tenant_id", tenant_id).eq("status", "open").limit(50),
    ]);

    // 1. Cancelaciones excesivas (posible fraude en caja)
    const cancelList = cancels.data ?? [];
    if (cancelList.length >= 5) {
      const value = cancelList.reduce((s, x) => s + num(x.total), 0);
      alerts.push({
        tenant_id,
        severity: cancelList.length >= 15 ? "critical" : "high",
        category: "fraud",
        title: `${cancelList.length} ventas canceladas en 7 días`,
        description: `Valor cancelado: ${money(value)}. Revisa motivos y operadores implicados.`,
        entity_type: "sale",
        metadata: { signature: "cancels_7d", count: cancelList.length, value, window_days: 7 },
      });
    }

    // 2. Stock negativo
    const neg = negStock.data ?? [];
    if (neg.length > 0) {
      alerts.push({
        tenant_id,
        severity: "high",
        category: "loss",
        title: `${neg.length} productos con stock negativo`,
        description: "Inconsistencia entre ventas y entradas de inventario: revisa recepciones y ajustes.",
        entity_type: "product",
        metadata: { signature: "negative_stock", count: neg.length, items: neg.slice(0, 10) },
      });
    }

    // 3. Cuentas por cobrar concentradas
    const customers = cust.data ?? [];
    const totalAR = customers.reduce((s, x) => s + num(x.balance), 0);
    if (totalAR > 1000) {
      alerts.push({
        tenant_id,
        severity: totalAR > 10000 ? "high" : "medium",
        category: "financial",
        title: `Cuentas por cobrar acumuladas: ${money(totalAR)}`,
        description: `Top deudores: ${customers.slice(0, 5).map((c) => `${c.name} (${money(c.balance)})`).join(", ")}`,
        entity_type: "customer",
        metadata: { signature: "receivables", total: totalAR, top: customers.slice(0, 5) },
      });
    }

    // 4. Productos bajo mínimo
    const lowStock = lowStockProducts.data ?? [];
    if (lowStock.length > 0) {
      const ids = lowStock.map((p: any) => p.id);
      const { data: stocks } = await admin.from("product_stock").select("product_id, stock").in("product_id", ids);
      const byId: Record<string, number> = {};
      (stocks ?? []).forEach((s: any) => { byId[s.product_id] = (byId[s.product_id] ?? 0) + num(s.stock); });
      const breached = lowStock.filter((p: any) => (byId[p.id] ?? 0) <= num(p.min_stock));
      if (breached.length >= 3) {
        alerts.push({
          tenant_id,
          severity: breached.length >= 10 ? "high" : "medium",
          category: "operational",
          title: `${breached.length} productos bajo el mínimo de stock`,
          description: `Ej.: ${breached.slice(0, 5).map((p: any) => p.name).join(", ")}`,
          entity_type: "product",
          metadata: { signature: "low_stock", count: breached.length, items: breached.slice(0, 10).map((p: any) => ({ name: p.name, stock: byId[p.id] ?? 0, min: num(p.min_stock) })) },
        });
      }
    }

    // 5. Descuadres de caja en cierres de turno
    const closed = shifts.data ?? [];
    const mismatched = closed.filter((s: any) => Math.abs(num(s.cash_difference)) > 1);
    if (mismatched.length > 0) {
      const worst = [...mismatched].sort((a: any, b: any) => Math.abs(num(b.cash_difference)) - Math.abs(num(a.cash_difference)))[0];
      const totalDiff = mismatched.reduce((s: number, x: any) => s + Math.abs(num(x.cash_difference)), 0);
      alerts.push({
        tenant_id,
        severity: totalDiff > 500 || mismatched.length >= 5 ? "high" : "medium",
        category: "fraud",
        title: `${mismatched.length} turnos cerrados con descuadre de caja`,
        description: `Desvío acumulado ${money(totalDiff)} en 30 días. Mayor descuadre: ${worst?.store_name ?? "tienda"} (${money(worst?.cash_difference)}).`,
        entity_type: "shift",
        entity_id: worst?.id ?? null,
        metadata: { signature: "cash_mismatch", count: mismatched.length, total_difference: totalDiff, shifts: mismatched.slice(0, 10).map((s: any) => ({ store: s.store_name, difference: num(s.cash_difference), closed_at: s.closed_at })) },
      });
    }

    // 6. Ventas completadas con cobro pendiente sin cliente asociado
    const sales = unpaidSales.data ?? [];
    const pending = sales.filter((s: any) => num(s.total) - num(s.amount_paid) > 0.01);
    const pendingOrphan = pending.filter((s: any) => !s.customer_id && !s.employee_id);
    if (pending.length > 0) {
      const debt = pending.reduce((s: number, x: any) => s + (num(x.total) - num(x.amount_paid)), 0);
      alerts.push({
        tenant_id,
        severity: pendingOrphan.length > 0 ? "high" : "medium",
        category: "financial",
        title: `${pending.length} ventas con saldo pendiente (${money(debt)})`,
        description: pendingOrphan.length > 0
          ? `${pendingOrphan.length} de ellas no tienen cliente ni empleado asociado: crédito sin responsable identificable.`
          : "Ventas a crédito abiertas dentro de los últimos 30 días.",
        entity_type: "sale",
        metadata: { signature: "unpaid_sales", count: pending.length, orphan: pendingOrphan.length, debt },
      });
    }

    // 7. Asientos contables sin contabilizar con fecha vencida
    const drafts = draftEntries.data ?? [];
    if (drafts.length > 0) {
      alerts.push({
        tenant_id,
        severity: drafts.length >= 20 ? "high" : "medium",
        category: "compliance",
        title: `${drafts.length} asientos sin contabilizar`,
        description: "Existen asientos con fecha vencida que no están posteados: el mayor y los reportes están incompletos.",
        entity_type: "journal_entry",
        metadata: { signature: "draft_entries", count: drafts.length, entries: drafts.slice(0, 10).map((e: any) => ({ number: e.entry_number, date: e.date, status: e.status })) },
      });
    }

    // 8. Cuentas por pagar vencidas
    const payables = overduePayables.data ?? [];
    if (payables.length > 0) {
      const outstanding = payables.reduce((s: number, x: any) => s + (num(x.amount) - num(x.amount_paid)), 0);
      alerts.push({
        tenant_id,
        severity: outstanding > 5000 ? "critical" : "high",
        category: "financial",
        title: `${payables.length} obligaciones vencidas por ${money(outstanding)}`,
        description: `Ej.: ${payables.slice(0, 3).map((p: any) => `${p.description ?? "Pago"} (vence ${p.due_date})`).join(", ")}`,
        entity_type: "payable",
        metadata: { signature: "overdue_payables", count: payables.length, outstanding },
      });
    }

    // 9. Lotes por caducar
    const lots = expiringLots.data ?? [];
    if (lots.length > 0) {
      const units = lots.reduce((s: number, x: any) => s + num(x.quantity), 0);
      alerts.push({
        tenant_id,
        severity: "medium",
        category: "loss",
        title: `${lots.length} lotes caducan en 15 días (${units} uds.)`,
        description: "Prioriza rotación, promociones o mermas controladas para evitar pérdida de inventario.",
        entity_type: "product_lot",
        metadata: { signature: "expiring_lots", count: lots.length, units, lots: lots.slice(0, 10) },
      });
    }

    // 10. Devoluciones anómalas frente a ventas
    const rets = returns.data ?? [];
    const salesTotal = sales.reduce((s: number, x: any) => s + num(x.total), 0);
    const retTotal = rets.reduce((s: number, x: any) => s + num(x.total), 0);
    const retRatio = salesTotal > 0 ? (retTotal / salesTotal) * 100 : 0;
    if (rets.length >= 3 && retRatio >= 5) {
      alerts.push({
        tenant_id,
        severity: retRatio >= 15 ? "high" : "medium",
        category: "fraud",
        title: `Devoluciones al ${retRatio.toFixed(1)}% de las ventas`,
        description: `${rets.length} devoluciones por ${money(retTotal)} en 30 días. Revisa patrones por cajero y motivo.`,
        entity_type: "sale_return",
        metadata: { signature: "returns_ratio", ratio: retRatio, count: rets.length, total: retTotal },
      });
    }

    // 11. Turnos abiertos demasiado tiempo
    const stale = (openShifts.data ?? []).filter((s: any) => now - new Date(s.opened_at).getTime() > 36 * 3600 * 1000);
    if (stale.length > 0) {
      alerts.push({
        tenant_id,
        severity: "medium",
        category: "operational",
        title: `${stale.length} turnos abiertos más de 36 h`,
        description: `Sin cierre Z: ${stale.slice(0, 3).map((s: any) => s.store_name ?? "tienda").join(", ")}. El arqueo de caja queda sin validar.`,
        entity_type: "shift",
        entity_id: stale[0]?.id ?? null,
        metadata: { signature: "stale_shifts", count: stale.length },
      });
    }

    // Deduplicación: no repetir alertas abiertas con la misma firma
    const { data: openAlerts } = await admin
      .from("risk_alerts")
      .select("id, metadata, title, created_at")
      .eq("tenant_id", tenant_id)
      .eq("status", "open");

    const openBySignature = new Map<string, any>();
    (openAlerts ?? []).forEach((a: any) => {
      const sig = a?.metadata?.signature;
      if (sig) openBySignature.set(sig, a);
    });

    const toInsert: Alert[] = [];
    const toUpdate: { id: string; alert: Alert }[] = [];
    for (const a of alerts) {
      const sig = (a.metadata as any)?.signature as string | undefined;
      const existing = sig ? openBySignature.get(sig) : null;
      if (existing) toUpdate.push({ id: existing.id, alert: a });
      else toInsert.push(a);
    }

    // Análisis de IA: resumen ejecutivo + acciones por alerta
    let aiSummary: string | null = null;
    let aiActions: Record<string, string[]> = {};
    if (useAi && LOVABLE_API_KEY && alerts.length > 0) {
      try {
        const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              {
                role: "system",
                content:
                  "Eres un auditor de riesgo operativo y financiero de retail/gastronomía. Responde SOLO JSON válido con la forma {\"summary\":string,\"actions\":{\"<signature>\":[string,string]}}. El resumen: máximo 3 frases ejecutivas en español. Cada acción: imperativa, concreta y verificable.",
              },
              {
                role: "user",
                content: `Alertas detectadas (datos reales de la empresa):\n${JSON.stringify(
                  alerts.map((a) => ({ signature: (a.metadata as any)?.signature, severity: a.severity, category: a.category, title: a.title, description: a.description })),
                )}`,
              },
            ],
          }),
        });
        if (ai.ok) {
          const aj = await ai.json();
          const raw = aj.choices?.[0]?.message?.content ?? "";
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            aiSummary = typeof parsed.summary === "string" ? parsed.summary : null;
            if (parsed.actions && typeof parsed.actions === "object") aiActions = parsed.actions;
          } else if (raw) {
            aiSummary = raw.slice(0, 800);
          }
        }
      } catch (e) {
        console.error("ai analysis failed", e);
      }
    }

    const withAi = (a: Alert) => {
      const sig = (a.metadata as any)?.signature as string | undefined;
      const actions = sig ? aiActions[sig] : undefined;
      return {
        ...a,
        metadata: {
          ...(a.metadata ?? {}),
          ai_actions: Array.isArray(actions) ? actions.slice(0, 3) : null,
          scanned_at: new Date().toISOString(),
        },
      };
    };

    let created = 0;
    if (toInsert.length > 0) {
      const { error } = await admin.from("risk_alerts").insert(toInsert.map(withAi));
      if (error) throw error;
      created = toInsert.length;
    }
    for (const u of toUpdate) {
      const a = withAi(u.alert);
      await admin.from("risk_alerts").update({
        severity: a.severity,
        title: a.title,
        description: a.description,
        metadata: a.metadata,
      }).eq("id", u.id);
    }

    // Auto-resolver alertas abiertas cuya condición ya no se cumple
    const activeSignatures = new Set(alerts.map((a) => (a.metadata as any)?.signature));
    const resolvable = (openAlerts ?? []).filter((a: any) => a?.metadata?.signature && !activeSignatures.has(a.metadata.signature));
    if (resolvable.length > 0) {
      await admin.from("risk_alerts")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .in("id", resolvable.map((a: any) => a.id));
    }

    return json({
      ok: true,
      created,
      updated: toUpdate.length,
      auto_resolved: resolvable.length,
      detected: alerts.length,
      ai_enabled: Boolean(useAi && LOVABLE_API_KEY),
      ai_summary: aiSummary,
      alerts: alerts.map(withAi),
      scanned_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
