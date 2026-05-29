// Seed demo users, tenants and sample data for the public demo flow.
// Idempotent: safe to call multiple times.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEMO_PASSWORD = "demo1234";

type DemoConfig = {
  type: "bar" | "restaurant" | "empresa";
  email: string;
  fullName: string;
  tenantName: string;
  tenantSlug: string;
  products: { name: string; sku: string; price: number; cost: number; stock: number; category: string }[];
  customers: { name: string; phone?: string; email?: string }[];
  employees: { name: string; position: string; salary: number }[];
};

const DEMOS: DemoConfig[] = [
  {
    type: "bar",
    email: "demo-bar@kirabit.app",
    fullName: "Demo Bar",
    tenantName: "Bar MarIA Demo",
    tenantSlug: "demo-bar",
    products: [
      { name: "Cerveza Cristal", sku: "BAR-001", price: 150, cost: 80, stock: 120, category: "Cervezas" },
      { name: "Mojito Clásico", sku: "BAR-002", price: 350, cost: 120, stock: 50, category: "Cocteles" },
      { name: "Daiquirí Natural", sku: "BAR-003", price: 320, cost: 110, stock: 40, category: "Cocteles" },
      { name: "Café Espresso", sku: "BAR-004", price: 80, cost: 25, stock: 200, category: "Café" },
      { name: "Sándwich Cubano", sku: "BAR-005", price: 280, cost: 120, stock: 25, category: "Comida" },
      { name: "Agua Mineral", sku: "BAR-006", price: 60, cost: 20, stock: 80, category: "Bebidas" },
    ],
    customers: [
      { name: "Carlos Pérez", phone: "+5355512345" },
      { name: "Lucía Gómez", phone: "+5355598765" },
    ],
    employees: [
      { name: "Mario Bartender", position: "Bartender", salary: 18000 },
      { name: "Ana Mesera", position: "Mesera", salary: 15000 },
    ],
  },
  {
    type: "restaurant",
    email: "demo-restaurante@kirabit.app",
    fullName: "Demo Restaurante",
    tenantName: "Restaurante MarIA Demo",
    tenantSlug: "demo-restaurante",
    products: [
      { name: "Ropa Vieja", sku: "RST-001", price: 850, cost: 320, stock: 30, category: "Platos Fuertes" },
      { name: "Arroz Congrí", sku: "RST-002", price: 250, cost: 90, stock: 60, category: "Guarniciones" },
      { name: "Yuca con Mojo", sku: "RST-003", price: 180, cost: 60, stock: 50, category: "Guarniciones" },
      { name: "Lechón Asado", sku: "RST-004", price: 950, cost: 380, stock: 20, category: "Platos Fuertes" },
      { name: "Ensalada Mixta", sku: "RST-005", price: 220, cost: 80, stock: 40, category: "Entradas" },
      { name: "Flan de Caramelo", sku: "RST-006", price: 180, cost: 60, stock: 35, category: "Postres" },
      { name: "Jugo Natural", sku: "RST-007", price: 120, cost: 40, stock: 70, category: "Bebidas" },
    ],
    customers: [
      { name: "Familia Rodríguez", phone: "+5355544455" },
      { name: "Empresa Turistur", email: "reservas@turistur.cu" },
    ],
    employees: [
      { name: "Chef Pedro", position: "Chef Ejecutivo", salary: 35000 },
      { name: "Sofía Mesera", position: "Mesera", salary: 16000 },
      { name: "Juan Cajero", position: "Cajero", salary: 17000 },
    ],
  },
  {
    type: "empresa",
    email: "demo-empresa@kirabit.app",
    fullName: "Demo Empresa",
    tenantName: "Retail MarIA Demo",
    tenantSlug: "demo-empresa",
    products: [
      { name: "Camiseta Algodón Blanca", sku: "RET-001", price: 1200, cost: 500, stock: 80, category: "Ropa" },
      { name: "Pantalón Jeans", sku: "RET-002", price: 2500, cost: 1100, stock: 45, category: "Ropa" },
      { name: "Zapatos Deportivos", sku: "RET-003", price: 4500, cost: 2200, stock: 25, category: "Calzado" },
      { name: "Mochila Escolar", sku: "RET-004", price: 1800, cost: 800, stock: 30, category: "Accesorios" },
      { name: "Auriculares Bluetooth", sku: "RET-005", price: 2200, cost: 950, stock: 40, category: "Electrónica" },
      { name: "Reloj Inteligente", sku: "RET-006", price: 6500, cost: 3200, stock: 15, category: "Electrónica" },
      { name: "Botella Térmica", sku: "RET-007", price: 850, cost: 320, stock: 60, category: "Hogar" },
    ],
    customers: [
      { name: "María Fernández", phone: "+5355511122", email: "maria@example.com" },
      { name: "Tienda Mayorista S.A.", email: "compras@mayorista.cu" },
    ],
    employees: [
      { name: "Laura Vendedora", position: "Vendedora", salary: 19000 },
      { name: "Diego Encargado", position: "Encargado", salary: 28000 },
    ],
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const result: Record<string, { email: string; password: string; tenant: string }> = {};

    for (const cfg of DEMOS) {
      // 1) Ensure auth user
      let userId: string | null = null;
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = list?.users.find((u) => u.email?.toLowerCase() === cfg.email);
      if (existing) {
        userId = existing.id;
      } else {
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email: cfg.email,
          password: DEMO_PASSWORD,
          email_confirm: true,
          user_metadata: { full_name: cfg.fullName },
        });
        if (cErr) throw new Error(`createUser ${cfg.email}: ${cErr.message}`);
        userId = created.user!.id;
      }

      // 2) Ensure tenant
      let tenantId: string;
      const { data: existingTenant } = await admin
        .from("tenants").select("id").eq("slug", cfg.tenantSlug).maybeSingle();
      if (existingTenant) {
        tenantId = existingTenant.id;
      } else {
        const { data: t, error: tErr } = await admin.from("tenants").insert({
          name: cfg.tenantName,
          slug: cfg.tenantSlug,
          business_type: cfg.type,
          email: cfg.email,
          phone: "+5355500000",
          address: "La Habana, Cuba",
          is_active: true,
        }).select("id").single();
        if (tErr) throw new Error(`tenants insert: ${tErr.message}`);
        tenantId = t!.id;
      }

      // 3) Link tenant_user
      await admin.from("tenant_users").upsert(
        { tenant_id: tenantId, user_id: userId, is_owner: true },
        { onConflict: "tenant_id,user_id" }
      );

      // 4) Seed products (only if tenant has none)
      const { count: prodCount } = await admin
        .from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      if ((prodCount ?? 0) === 0) {
        await admin.from("products").insert(
          cfg.products.map((p) => ({
            tenant_id: tenantId,
            name: p.name,
            sku: p.sku,
            price: p.price,
            cost: p.cost,
            stock: p.stock,
            min_stock: 5,
            category: p.category,
            is_active: true,
            is_online: true,
            online_stock: p.stock,
          }))
        );
      }

      // 5) Seed customers
      const { count: custCount } = await admin
        .from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      if ((custCount ?? 0) === 0) {
        await admin.from("customers").insert(
          cfg.customers.map((c) => ({ tenant_id: tenantId, ...c }))
        );
      }

      // 6) Seed employees
      const { count: empCount } = await admin
        .from("employees").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      if ((empCount ?? 0) === 0) {
        await admin.from("employees").insert(
          cfg.employees.map((e) => ({ tenant_id: tenantId, ...e, is_active: true }))
        );
      }

      result[cfg.type] = { email: cfg.email, password: DEMO_PASSWORD, tenant: cfg.tenantName };
    }

    return new Response(JSON.stringify({ success: true, demos: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("seed-demo error:", e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
