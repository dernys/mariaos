import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_ROWS = 2000;
const MAX_BODY_BYTES = 6 * 1024 * 1024;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const str = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const bool = (v: unknown, fallback = true) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return fallback;
  return ["si", "sí", "yes", "true", "1", "x", "activo"].includes(s);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---- Authentication (identity always derived from the bearer token)
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "No autenticado" }, 401);
    const { data: { user: caller } } = await admin.auth.getUser(token);
    if (!caller) return json({ error: "No autenticado" }, 401);

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "Archivo demasiado grande" }, 413);
    let body: any;
    try { body = JSON.parse(raw); } catch { return json({ error: "Cuerpo inválido" }, 400); }

    const rows: Record<string, unknown>[] = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) return json({ error: "No hay filas para importar" }, 400);
    if (rows.length > MAX_ROWS) return json({ error: `Máximo ${MAX_ROWS} filas por importación` }, 400);
    const strategy: "skip" | "update" | "fail" = ["skip", "update", "fail"].includes(body?.strategy) ? body.strategy : "skip";
    const dryRun = body?.dry_run === true;

    // ---- Authorization: tenant scope comes from membership, never from the client
    const { data: isSA } = await admin.rpc("is_superadmin", { _user_id: caller.id });
    const { data: memberships } = await admin
      .from("tenant_users")
      .select("tenant_id, is_owner")
      .eq("user_id", caller.id);
    const myTenants = (memberships ?? []).map((m: any) => m.tenant_id);

    let tenantId: string | null = null;
    const requested = typeof body?.tenant_id === "string" ? body.tenant_id : null;
    if (isSA) {
      tenantId = requested ?? myTenants[0] ?? null;
    } else {
      if (requested && !myTenants.includes(requested)) return json({ error: "Negocio fuera de tu alcance" }, 403);
      tenantId = requested ?? myTenants[0] ?? null;
    }
    if (!tenantId) return json({ error: "Sin negocio asociado" }, 403);

    if (!isSA) {
      const isOwner = (memberships ?? []).some((m: any) => m.tenant_id === tenantId && m.is_owner);
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
      const roleSet = new Set((roles ?? []).map((r: any) => r.role));
      const allowed = ["admin", "gerente", "inventarista"].some((r) => roleSet.has(r));
      if (!(isOwner || allowed)) return json({ error: "Sin permisos para importar productos" }, 403);
    }

    // ---- Reference data for validation
    const [{ data: units }, { data: suppliers }, { data: warehouses }, { data: stores }, { data: taxes }, { data: currencies }, { data: existing }] =
      await Promise.all([
        admin.from("units_of_measure").select("id, code").eq("tenant_id", tenantId),
        admin.from("suppliers").select("id, name").eq("tenant_id", tenantId),
        admin.from("warehouses").select("id, name").eq("tenant_id", tenantId),
        admin.from("stores").select("id, name").eq("tenant_id", tenantId),
        admin.from("tax_rates").select("id, name, rate").eq("tenant_id", tenantId),
        admin.from("currencies").select("code").eq("tenant_id", tenantId),
        admin.from("products").select("id, sku").eq("tenant_id", tenantId),
      ]);

    const lc = (s: string) => s.trim().toLowerCase();
    const unitMap = new Map((units ?? []).map((u: any) => [lc(u.code), u]));
    const supplierMap = new Map((suppliers ?? []).map((s: any) => [lc(s.name), s]));
    const whMap = new Map((warehouses ?? []).map((w: any) => [lc(w.name), w]));
    const storeMap = new Map((stores ?? []).map((s: any) => [lc(s.name), s]));
    const taxMap = new Map((taxes ?? []).map((t: any) => [lc(t.name), t]));
    const currencySet = new Set((currencies ?? []).map((c: any) => lc(c.code)));
    const existingMap = new Map((existing ?? []).map((p: any) => [lc(p.sku), p]));

    const seen = new Set<string>();
    const errors: { row: number; sku: string; messages: string[] }[] = [];
    const warnings: { row: number; sku: string; messages: string[] }[] = [];
    type Prepared = { rowNumber: number; product: Record<string, unknown>; existingId?: string; stock: number | null; locationType?: string; locationId?: string; supplierId?: string; variants: any[] };
    const prepared: Prepared[] = [];
    let skipped = 0;

    rows.forEach((r, i) => {
      const rowNumber = Number(r.__row ?? i + 2);
      const msgs: string[] = [];
      const warns: string[] = [];
      const sku = str(r.sku, 80);
      const name = str(r.name, 200);
      if (!sku) msgs.push("SKU obligatorio");
      if (!name) msgs.push("Nombre obligatorio");
      const price = num(r.price);
      if (price === null) msgs.push("Precio de venta obligatorio y numérico");
      else if (price < 0) msgs.push("Precio negativo");
      const cost = num(r.cost) ?? 0;
      if (cost < 0) msgs.push("Costo negativo");
      const stock = num(r.stock);
      const minStock = num(r.min_stock) ?? 0;
      if (stock !== null && stock < 0) msgs.push("Stock negativo");

      if (sku && seen.has(lc(sku))) msgs.push("SKU duplicado dentro del archivo");
      seen.add(lc(sku));

      const unitCode = str(r.unit_code, 20);
      let unitId: string | undefined;
      if (unitCode) {
        const u = unitMap.get(lc(unitCode));
        if (!u) warns.push(`Unidad "${unitCode}" no configurada; se guardará como texto`);
        else unitId = u.id;
      }

      const taxRaw = str(r.tax, 60);
      let taxId: string | undefined;
      if (taxRaw) {
        const t = taxMap.get(lc(taxRaw)) ??
          (num(taxRaw) !== null ? (taxes ?? []).find((x: any) => Number(x.rate) === num(taxRaw)) : undefined);
        if (!t) warns.push(`Impuesto "${taxRaw}" no encontrado; se omite`);
        else taxId = t.id;
      }

      const currency = str(r.currency, 10);
      if (currency && !currencySet.has(lc(currency))) warns.push(`Moneda "${currency}" no configurada; se omite`);

      const locationName = str(r.location, 120);
      let locationType: string | undefined;
      let locationId: string | undefined;
      if (locationName) {
        const w = whMap.get(lc(locationName));
        const s = storeMap.get(lc(locationName));
        if (w) { locationType = "warehouse"; locationId = w.id; }
        else if (s) { locationType = "store"; locationId = s.id; }
        else msgs.push(`Almacén/Tienda "${locationName}" no existe`);
      }

      const supplierName = str(r.supplier, 160);
      let supplierId: string | undefined;
      if (supplierName) {
        const s = supplierMap.get(lc(supplierName));
        if (!s) warns.push(`Proveedor "${supplierName}" no existe; se omite el vínculo`);
        else supplierId = s.id;
      }

      const barcode = str(r.barcode, 64);
      const variants = str(r.variants, 1000)
        .split(";")
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => {
          const [vname, vsku, vprice] = v.split("|").map((p) => (p ?? "").trim());
          return vname ? { name: vname.slice(0, 120), sku: vsku || null, price: num(vprice) ?? price ?? 0 } : null;
        })
        .filter(Boolean);

      const found = sku ? existingMap.get(lc(sku)) : undefined;
      if (found && strategy === "fail") msgs.push("SKU ya existe en el catálogo");

      if (msgs.length) { errors.push({ row: rowNumber, sku, messages: msgs }); return; }
      if (warns.length) warnings.push({ row: rowNumber, sku, messages: warns });
      if (found && strategy === "skip") { skipped++; return; }

      prepared.push({
        rowNumber,
        existingId: found?.id,
        stock,
        locationType, locationId, supplierId,
        variants: variants as any[],
        product: {
          tenant_id: tenantId,
          sku, name,
          description: str(r.description, 2000) || null,
          category: str(r.category, 120) || null,
          brand: str(r.brand, 120) || null,
          unit_code: unitCode || null,
          unit_id: unitId ?? null,
          barcodes: barcode ? [barcode] : [],
          price: price ?? 0,
          cost,
          stock: stock ?? 0,
          min_stock: minStock,
          default_tax_rate_id: taxId ?? null,
          is_active: bool(r.is_active, true),
          ...(locationType === "warehouse" ? { warehouse_id: locationId } : {}),
          ...(locationType === "store" ? { store_id: locationId } : {}),
        },
      });
    });

    if (dryRun) {
      return json({
        dry_run: true,
        to_create: prepared.filter((p) => !p.existingId).length,
        to_update: prepared.filter((p) => p.existingId).length,
        skipped, errors, warnings,
      });
    }

    let created = 0, updated = 0;
    const failed: { row: number; sku: string; messages: string[] }[] = [];

    for (const p of prepared) {
      try {
        let productId = p.existingId;
        if (productId) {
          const { error } = await admin.from("products").update(p.product).eq("id", productId).eq("tenant_id", tenantId);
          if (error) throw error;
          updated++;
        } else {
          const { data, error } = await admin.from("products").insert(p.product).select("id").single();
          if (error) throw error;
          productId = data.id;
          created++;
        }

        if (p.locationId && p.stock !== null) {
          await admin.from("product_stock").upsert(
            {
              tenant_id: tenantId, product_id: productId,
              location_type: p.locationType, location_id: p.locationId,
              stock: p.stock, min_stock: Number(p.product.min_stock ?? 0),
            },
            { onConflict: "product_id,location_type,location_id" },
          );
        }

        if (p.supplierId) {
          await admin.from("supplier_products").insert({
            tenant_id: tenantId, supplier_id: p.supplierId, product_id: productId,
            product_name: p.product.name, sku: p.product.sku, unit_cost: p.product.cost,
          });
        }

        for (const v of p.variants) {
          await admin.from("product_variants").insert({
            tenant_id: tenantId, product_id: productId, name: v.name, sku: v.sku,
            price: v.price, cost: p.product.cost,
          });
        }
      } catch (e) {
        failed.push({ row: p.rowNumber, sku: String(p.product.sku), messages: [String((e as Error).message || e)] });
      }
    }

    return json({ created, updated, skipped, failed, errors, warnings, total: rows.length });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
