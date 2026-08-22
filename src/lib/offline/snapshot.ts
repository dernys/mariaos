// Precarga del "conjunto de trabajo" del negocio para poder operar sin red:
// productos, clientes, categorías, impuestos, métodos de pago, tiendas, mesas y
// ajustes del POS. Se refresca al abrir la app y al recuperar conexión.
import { supabase } from "@/integrations/supabase/client";
import { offlineDB, snapshotProducts, type CustomerSnapshot, type ProductSnapshot } from "./db";
import { setMeta } from "./sync";

export interface PrefetchResult {
  products: number;
  customers: number;
  at: number;
}

export async function prefetchWorkingSet(tenantId: string): Promise<PrefetchResult | null> {
  if (!tenantId) return null;
  if (typeof navigator !== "undefined" && !navigator.onLine) return null;

  const [prod, cust, cats, taxes, methods, stores, tables, settings] = await Promise.all([
    supabase.from("products").select("id, name, sku, price, stock, category, image_url")
      .eq("tenant_id", tenantId).eq("is_active", true).order("name").limit(2000),
    supabase.from("customers").select("id, name, phone, email, balance, credit_limit")
      .eq("tenant_id", tenantId).order("name").limit(2000),
    supabase.from("product_categories").select("id, name").eq("tenant_id", tenantId).limit(500),
    supabase.from("tax_rates").select("id, name, rate").eq("tenant_id", tenantId).limit(200),
    supabase.from("payment_methods").select("id, name, type").eq("tenant_id", tenantId).limit(200),
    supabase.from("stores").select("id, name").eq("tenant_id", tenantId).limit(200),
    supabase.from("restaurant_tables").select("id, name, status, capacity").eq("tenant_id", tenantId).limit(500),
    supabase.from("pos_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
  ]);

  const now = Date.now();

  const products: ProductSnapshot[] = (prod.data || []).map((p: any) => ({
    id: p.id,
    tenant_id: tenantId,
    name: p.name,
    sku: p.sku ?? "",
    price: Number(p.price ?? 0),
    stock: Number(p.stock ?? 0),
    category: p.category ?? null,
    image_url: p.image_url ?? null,
    updated_at: now,
  }));
  if (products.length) await snapshotProducts(tenantId, products);

  const customers: CustomerSnapshot[] = (cust.data || []).map((c: any) => ({
    id: c.id,
    tenant_id: tenantId,
    name: c.name,
    phone: c.phone ?? null,
    email: c.email ?? null,
    balance: Number(c.balance ?? 0),
    credit_limit: Number(c.credit_limit ?? 0),
    pending: false,
    updated_at: now,
  }));
  if (customers.length) {
    // conserva los clientes creados offline aún sin sincronizar
    const local = await offlineDB.customers.where({ tenant_id: tenantId }).toArray();
    const keep = local.filter((c) => c.pending);
    await offlineDB.customers.where({ tenant_id: tenantId }).delete();
    await offlineDB.customers.bulkPut([...customers, ...keep]);
  }

  const blobs = [
    { kind: "categories", data: cats.data || [] },
    { kind: "tax_rates", data: taxes.data || [] },
    { kind: "payment_methods", data: methods.data || [] },
    { kind: "stores", data: stores.data || [] },
    { kind: "tables", data: tables.data || [] },
    { kind: "pos_settings", data: settings.data || null },
  ];
  await offlineDB.snapshots.bulkPut(
    blobs.map((b) => ({ key: `${tenantId}:${b.kind}`, tenant_id: tenantId, kind: b.kind, data: b.data, updated_at: now })),
  );

  await setMeta(`${tenantId}:last_prefetch`, now);
  await setMeta(`${tenantId}:ready`, products.length > 0);
  return { products: products.length, customers: customers.length, at: now };
}

export async function readSnapshot<T = any>(tenantId: string, kind: string): Promise<T | undefined> {
  const row = await offlineDB.snapshots.get(`${tenantId}:${kind}`);
  return row?.data as T | undefined;
}

export async function offlineProducts(tenantId: string) {
  return offlineDB.products.where({ tenant_id: tenantId }).toArray();
}

export async function offlineCustomers(tenantId: string) {
  return offlineDB.customers.where({ tenant_id: tenantId }).toArray();
}
