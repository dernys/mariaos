// Seed demo users, tenants and rich, vertical-aware sample data.
// Idempotent: safe to call multiple times — only inserts when target table is empty for the tenant.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id",
};

const DEMO_PASSWORD = "demo1234";

type Prod = { name: string; sku: string; price: number; cost: number; stock: number; category: string; product_type?: string };
type Recipe = { product_sku: string; ingredient_sku: string; quantity: number; unit: string };
type TableRow = { name: string; capacity: number; zone?: string };

type DemoConfig = {
  type: "bar" | "restaurant" | "empresa";
  email: string;
  fullName: string;
  tenantName: string;
  tenantSlug: string;
  storeName: string;
  warehouseName: string;
  products: Prod[];
  recipes?: Recipe[];
  tables?: TableRow[];
  customers: { name: string; phone?: string; email?: string }[];
  employees: { name: string; position: string; salary: number }[];
};

// ---------- BAR ----------
const BAR_PRODUCTS: Prod[] = [
  // Insumos (sin recetas; usados por cocteles)
  { name: "Ron Blanco (botella)",   sku: "ING-RON-B",  price: 0, cost: 800, stock: 30, category: "Insumos" },
  { name: "Ron Añejo (botella)",    sku: "ING-RON-A",  price: 0, cost: 1200, stock: 18, category: "Insumos" },
  { name: "Hierbabuena (manojo)",   sku: "ING-MENTA",  price: 0, cost: 25,  stock: 50, category: "Insumos" },
  { name: "Limón (unidad)",         sku: "ING-LIM",    price: 0, cost: 10,  stock: 200, category: "Insumos" },
  { name: "Azúcar (kg)",            sku: "ING-AZU",    price: 0, cost: 90,  stock: 25, category: "Insumos" },
  { name: "Soda (botella 1L)",      sku: "ING-SODA",   price: 0, cost: 60,  stock: 40, category: "Insumos" },
  { name: "Hielo (kg)",             sku: "ING-HIE",    price: 0, cost: 20,  stock: 100, category: "Insumos" },
  { name: "Café grano (kg)",        sku: "ING-CAFE",   price: 0, cost: 600, stock: 8, category: "Insumos" },
  { name: "Leche (L)",              sku: "ING-LEC",    price: 0, cost: 80,  stock: 30, category: "Insumos" },
  // Bebidas listas (sin receta)
  { name: "Cerveza Cristal",        sku: "BAR-CER",    price: 150, cost: 80, stock: 120, category: "Cervezas" },
  { name: "Cerveza Bucanero",       sku: "BAR-BUC",    price: 170, cost: 90, stock: 100, category: "Cervezas" },
  { name: "Agua Mineral",           sku: "BAR-AGUA",   price: 60,  cost: 20, stock: 80, category: "Bebidas" },
  { name: "Refresco TuKola",        sku: "BAR-COLA",   price: 80,  cost: 30, stock: 90, category: "Bebidas" },
  // Cocteles y café (con receta → product_type=prepared)
  { name: "Mojito Clásico",         sku: "COC-MOJ",    price: 350, cost: 0, stock: 0, category: "Cocteles", product_type: "prepared" },
  { name: "Cuba Libre",             sku: "COC-CL",     price: 320, cost: 0, stock: 0, category: "Cocteles", product_type: "prepared" },
  { name: "Daiquirí Natural",       sku: "COC-DAI",    price: 360, cost: 0, stock: 0, category: "Cocteles", product_type: "prepared" },
  { name: "Café Espresso",          sku: "BAR-ESP",    price: 80,  cost: 0, stock: 0, category: "Café",     product_type: "prepared" },
  { name: "Café con Leche",         sku: "BAR-CL",     price: 120, cost: 0, stock: 0, category: "Café",     product_type: "prepared" },
  // Tapas
  { name: "Sándwich Cubano",        sku: "BAR-SAN",    price: 280, cost: 120, stock: 25, category: "Comida" },
  { name: "Maní Tostado",           sku: "BAR-MAN",    price: 90,  cost: 30,  stock: 40, category: "Comida" },
];

const BAR_RECIPES: Recipe[] = [
  { product_sku: "COC-MOJ", ingredient_sku: "ING-RON-B", quantity: 0.05, unit: "L" },
  { product_sku: "COC-MOJ", ingredient_sku: "ING-MENTA", quantity: 0.1,  unit: "unidad" },
  { product_sku: "COC-MOJ", ingredient_sku: "ING-LIM",   quantity: 0.5,  unit: "unidad" },
  { product_sku: "COC-MOJ", ingredient_sku: "ING-AZU",   quantity: 0.015, unit: "kg" },
  { product_sku: "COC-MOJ", ingredient_sku: "ING-SODA",  quantity: 0.1,  unit: "L" },
  { product_sku: "COC-MOJ", ingredient_sku: "ING-HIE",   quantity: 0.15, unit: "kg" },

  { product_sku: "COC-CL",  ingredient_sku: "ING-RON-B", quantity: 0.05, unit: "L" },
  { product_sku: "COC-CL",  ingredient_sku: "BAR-COLA",  quantity: 0.3,  unit: "unidad" },
  { product_sku: "COC-CL",  ingredient_sku: "ING-LIM",   quantity: 0.25, unit: "unidad" },
  { product_sku: "COC-CL",  ingredient_sku: "ING-HIE",   quantity: 0.1,  unit: "kg" },

  { product_sku: "COC-DAI", ingredient_sku: "ING-RON-B", quantity: 0.05, unit: "L" },
  { product_sku: "COC-DAI", ingredient_sku: "ING-LIM",   quantity: 0.5,  unit: "unidad" },
  { product_sku: "COC-DAI", ingredient_sku: "ING-AZU",   quantity: 0.02, unit: "kg" },
  { product_sku: "COC-DAI", ingredient_sku: "ING-HIE",   quantity: 0.2,  unit: "kg" },

  { product_sku: "BAR-ESP", ingredient_sku: "ING-CAFE",  quantity: 0.008, unit: "kg" },
  { product_sku: "BAR-CL",  ingredient_sku: "ING-CAFE",  quantity: 0.008, unit: "kg" },
  { product_sku: "BAR-CL",  ingredient_sku: "ING-LEC",   quantity: 0.12,  unit: "L" },
];

const BAR_TABLES: TableRow[] = [
  { name: "Barra 1", capacity: 2, zone: "Barra" },
  { name: "Barra 2", capacity: 2, zone: "Barra" },
  { name: "Mesa 1", capacity: 4, zone: "Salón" },
  { name: "Mesa 2", capacity: 4, zone: "Salón" },
  { name: "Mesa 3", capacity: 6, zone: "Salón" },
  { name: "Terraza 1", capacity: 4, zone: "Terraza" },
  { name: "Terraza 2", capacity: 4, zone: "Terraza" },
];

// ---------- RESTAURANT ----------
const RST_PRODUCTS: Prod[] = [
  // Insumos
  { name: "Arroz (kg)",         sku: "ING-ARR", price: 0, cost: 90,  stock: 80, category: "Insumos" },
  { name: "Frijol Negro (kg)",  sku: "ING-FRI", price: 0, cost: 130, stock: 40, category: "Insumos" },
  { name: "Carne de Res (kg)",  sku: "ING-RES", price: 0, cost: 950, stock: 25, category: "Insumos" },
  { name: "Carne de Cerdo (kg)",sku: "ING-CER", price: 0, cost: 700, stock: 30, category: "Insumos" },
  { name: "Pollo (kg)",         sku: "ING-POL", price: 0, cost: 480, stock: 35, category: "Insumos" },
  { name: "Yuca (kg)",          sku: "ING-YUC", price: 0, cost: 60,  stock: 50, category: "Insumos" },
  { name: "Plátano (unidad)",   sku: "ING-PLA", price: 0, cost: 15,  stock: 200, category: "Insumos" },
  { name: "Tomate (kg)",        sku: "ING-TOM", price: 0, cost: 120, stock: 30, category: "Insumos" },
  { name: "Lechuga (unidad)",   sku: "ING-LEC", price: 0, cost: 40,  stock: 30, category: "Insumos" },
  { name: "Huevo (unidad)",     sku: "ING-HUE", price: 0, cost: 12,  stock: 240, category: "Insumos" },
  { name: "Aceite (L)",         sku: "ING-ACE", price: 0, cost: 380, stock: 15, category: "Insumos" },
  { name: "Sal/Especias (kg)",  sku: "ING-ESP", price: 0, cost: 200, stock: 8,  category: "Insumos" },
  { name: "Leche Cond. (lata)", sku: "ING-LC",  price: 0, cost: 280, stock: 20, category: "Insumos" },
  // Platos (con receta)
  { name: "Ropa Vieja",         sku: "RST-RV",  price: 850, cost: 0, stock: 0, category: "Platos Fuertes", product_type: "prepared" },
  { name: "Arroz Congrí",       sku: "RST-AC",  price: 250, cost: 0, stock: 0, category: "Guarniciones",   product_type: "prepared" },
  { name: "Yuca con Mojo",      sku: "RST-YM",  price: 180, cost: 0, stock: 0, category: "Guarniciones",   product_type: "prepared" },
  { name: "Lechón Asado",       sku: "RST-LA",  price: 950, cost: 0, stock: 0, category: "Platos Fuertes", product_type: "prepared" },
  { name: "Pollo Asado",        sku: "RST-PA",  price: 680, cost: 0, stock: 0, category: "Platos Fuertes", product_type: "prepared" },
  { name: "Ensalada Mixta",     sku: "RST-EM",  price: 220, cost: 0, stock: 0, category: "Entradas",       product_type: "prepared" },
  { name: "Tostones",           sku: "RST-TO",  price: 160, cost: 0, stock: 0, category: "Guarniciones",   product_type: "prepared" },
  { name: "Flan de Caramelo",   sku: "RST-FL",  price: 180, cost: 0, stock: 0, category: "Postres",        product_type: "prepared" },
  // Bebidas listas
  { name: "Jugo Natural",       sku: "RST-JN",  price: 120, cost: 40, stock: 70, category: "Bebidas" },
  { name: "Refresco",           sku: "RST-RE",  price: 90,  cost: 30, stock: 80, category: "Bebidas" },
  { name: "Agua Mineral",       sku: "RST-AGUA",price: 60,  cost: 20, stock: 90, category: "Bebidas" },
  { name: "Cerveza",            sku: "RST-CER", price: 150, cost: 80, stock: 100, category: "Bebidas" },
];

const RST_RECIPES: Recipe[] = [
  { product_sku: "RST-RV", ingredient_sku: "ING-RES", quantity: 0.25, unit: "kg" },
  { product_sku: "RST-RV", ingredient_sku: "ING-TOM", quantity: 0.1,  unit: "kg" },
  { product_sku: "RST-RV", ingredient_sku: "ING-ACE", quantity: 0.03, unit: "L" },
  { product_sku: "RST-RV", ingredient_sku: "ING-ESP", quantity: 0.01, unit: "kg" },

  { product_sku: "RST-AC", ingredient_sku: "ING-ARR", quantity: 0.15, unit: "kg" },
  { product_sku: "RST-AC", ingredient_sku: "ING-FRI", quantity: 0.08, unit: "kg" },
  { product_sku: "RST-AC", ingredient_sku: "ING-CER", quantity: 0.05, unit: "kg" },

  { product_sku: "RST-YM", ingredient_sku: "ING-YUC", quantity: 0.3, unit: "kg" },
  { product_sku: "RST-YM", ingredient_sku: "ING-ACE", quantity: 0.02, unit: "L" },

  { product_sku: "RST-LA", ingredient_sku: "ING-CER", quantity: 0.4, unit: "kg" },
  { product_sku: "RST-LA", ingredient_sku: "ING-ESP", quantity: 0.015, unit: "kg" },

  { product_sku: "RST-PA", ingredient_sku: "ING-POL", quantity: 0.35, unit: "kg" },
  { product_sku: "RST-PA", ingredient_sku: "ING-ESP", quantity: 0.01, unit: "kg" },

  { product_sku: "RST-EM", ingredient_sku: "ING-LEC", quantity: 0.3, unit: "unidad" },
  { product_sku: "RST-EM", ingredient_sku: "ING-TOM", quantity: 0.08, unit: "kg" },

  { product_sku: "RST-TO", ingredient_sku: "ING-PLA", quantity: 2,    unit: "unidad" },
  { product_sku: "RST-TO", ingredient_sku: "ING-ACE", quantity: 0.04, unit: "L" },

  { product_sku: "RST-FL", ingredient_sku: "ING-HUE", quantity: 2,    unit: "unidad" },
  { product_sku: "RST-FL", ingredient_sku: "ING-LC",  quantity: 0.3,  unit: "unidad" },
];

const RST_TABLES: TableRow[] = [
  { name: "Mesa 1", capacity: 2, zone: "Salón" },
  { name: "Mesa 2", capacity: 2, zone: "Salón" },
  { name: "Mesa 3", capacity: 4, zone: "Salón" },
  { name: "Mesa 4", capacity: 4, zone: "Salón" },
  { name: "Mesa 5", capacity: 6, zone: "Salón" },
  { name: "Mesa 6", capacity: 8, zone: "Salón" },
  { name: "Terraza 1", capacity: 4, zone: "Terraza" },
  { name: "Terraza 2", capacity: 4, zone: "Terraza" },
  { name: "Privado 1", capacity: 10, zone: "Privado" },
];

// ---------- EMPRESA / RETAIL ----------
const EMP_PRODUCTS: Prod[] = [
  { name: "Camiseta Algodón Blanca",  sku: "RET-CAM-B-S", price: 1200, cost: 500,  stock: 50, category: "Ropa" },
  { name: "Camiseta Algodón Negra",   sku: "RET-CAM-N-S", price: 1200, cost: 500,  stock: 50, category: "Ropa" },
  { name: "Camisa Formal",            sku: "RET-CMS-F",   price: 2800, cost: 1100, stock: 35, category: "Ropa" },
  { name: "Pantalón Jeans",           sku: "RET-PAN-J",   price: 2500, cost: 1100, stock: 45, category: "Ropa" },
  { name: "Pantalón de Vestir",       sku: "RET-PAN-V",   price: 3200, cost: 1400, stock: 25, category: "Ropa" },
  { name: "Chaqueta Liviana",         sku: "RET-CHA-L",   price: 3800, cost: 1700, stock: 20, category: "Ropa" },
  { name: "Vestido Casual",           sku: "RET-VES-C",   price: 3500, cost: 1500, stock: 30, category: "Ropa" },
  { name: "Zapatos Deportivos",       sku: "RET-ZAP-D",   price: 4500, cost: 2200, stock: 25, category: "Calzado" },
  { name: "Zapatos Formales",         sku: "RET-ZAP-F",   price: 5500, cost: 2700, stock: 18, category: "Calzado" },
  { name: "Sandalias",                sku: "RET-SAN",     price: 1800, cost: 800,  stock: 40, category: "Calzado" },
  { name: "Botas",                    sku: "RET-BOT",     price: 6200, cost: 2900, stock: 12, category: "Calzado" },
  { name: "Mochila Escolar",          sku: "RET-MOC-E",   price: 1800, cost: 800,  stock: 30, category: "Accesorios" },
  { name: "Cinturón Cuero",           sku: "RET-CIN",     price: 950,  cost: 380,  stock: 60, category: "Accesorios" },
  { name: "Gorra",                    sku: "RET-GOR",     price: 750,  cost: 280,  stock: 80, category: "Accesorios" },
  { name: "Lentes de Sol",            sku: "RET-LEN",     price: 2200, cost: 900,  stock: 35, category: "Accesorios" },
  { name: "Cartera Mujer",            sku: "RET-CAR",     price: 2900, cost: 1200, stock: 25, category: "Accesorios" },
  { name: "Auriculares Bluetooth",    sku: "RET-AUR-BT",  price: 2200, cost: 950,  stock: 40, category: "Electrónica" },
  { name: "Bocina Portátil",          sku: "RET-BOC",     price: 3200, cost: 1400, stock: 22, category: "Electrónica" },
  { name: "Reloj Inteligente",        sku: "RET-REL-I",   price: 6500, cost: 3200, stock: 15, category: "Electrónica" },
  { name: "Cargador USB-C",           sku: "RET-CAR-USB", price: 480,  cost: 180,  stock: 100, category: "Electrónica" },
  { name: "Botella Térmica",          sku: "RET-BOT-T",   price: 850,  cost: 320,  stock: 60, category: "Hogar" },
  { name: "Juego de Sábanas",         sku: "RET-SAB",     price: 2400, cost: 1000, stock: 28, category: "Hogar" },
  { name: "Lámpara LED",              sku: "RET-LAM",     price: 1200, cost: 480,  stock: 45, category: "Hogar" },
  { name: "Cafetera Italiana",        sku: "RET-CAF",     price: 1850, cost: 750,  stock: 18, category: "Hogar" },
  { name: "Set de Toallas",           sku: "RET-TOA",     price: 1600, cost: 650,  stock: 30, category: "Hogar" },
];

// ---------- DEMOS ----------
const DEMOS: DemoConfig[] = [
  {
    type: "bar",
    email: "demo-bar@kirabit.app",
    fullName: "Demo Bar",
    tenantName: "Bar MarIA Demo",
    tenantSlug: "demo-bar",
    storeName: "Bar El Trópico — Salón",
    warehouseName: "Bodega de Bar",
    products: BAR_PRODUCTS,
    recipes: BAR_RECIPES,
    tables: BAR_TABLES,
    customers: [
      { name: "Carlos Pérez", phone: "+5355512345" },
      { name: "Lucía Gómez", phone: "+5355598765" },
      { name: "Roberto Vega", phone: "+5355511223" },
    ],
    employees: [
      { name: "Mario Bartender", position: "Bartender", salary: 18000 },
      { name: "Ana Mesera", position: "Mesera", salary: 15000 },
      { name: "Pedro Cajero", position: "Cajero", salary: 16000 },
    ],
  },
  {
    type: "restaurant",
    email: "demo-restaurante@kirabit.app",
    fullName: "Demo Restaurante",
    tenantName: "Restaurante MarIA Demo",
    tenantSlug: "demo-restaurante",
    storeName: "Restaurante MarIA — Salón",
    warehouseName: "Almacén de Cocina",
    products: RST_PRODUCTS,
    recipes: RST_RECIPES,
    tables: RST_TABLES,
    customers: [
      { name: "Familia Rodríguez", phone: "+5355544455" },
      { name: "Empresa Turistur", email: "reservas@turistur.cu" },
      { name: "Hotel Habana Libre", email: "eventos@hhl.cu" },
    ],
    employees: [
      { name: "Chef Pedro", position: "Chef Ejecutivo", salary: 35000 },
      { name: "Sofía Mesera", position: "Mesera", salary: 16000 },
      { name: "Juan Cajero", position: "Cajero", salary: 17000 },
      { name: "Luis Ayudante", position: "Ayudante de Cocina", salary: 14000 },
    ],
  },
  {
    type: "empresa",
    email: "demo-empresa@kirabit.app",
    fullName: "Demo Empresa",
    tenantName: "Retail MarIA Demo",
    tenantSlug: "demo-empresa",
    storeName: "Tienda Retail MarIA — Vedado",
    warehouseName: "Almacén Central Retail",
    products: EMP_PRODUCTS,
    customers: [
      { name: "María Fernández", phone: "+5355511122", email: "maria@example.com" },
      { name: "Tienda Mayorista S.A.", email: "compras@mayorista.cu" },
      { name: "Boutique Habana", email: "contacto@boutique.cu" },
    ],
    employees: [
      { name: "Laura Vendedora", position: "Vendedora", salary: 19000 },
      { name: "Diego Encargado", position: "Encargado", salary: 28000 },
      { name: "Carmen Caja", position: "Cajera", salary: 17000 },
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
        // Make sure business_type is correct (older seeds may have written something else)
        await admin.from("tenants").update({ business_type: cfg.type }).eq("id", tenantId);
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

      // 4) Seed products
      const { count: prodCount } = await admin
        .from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      if ((prodCount ?? 0) === 0) {
        const { error } = await admin.from("products").insert(
          cfg.products.map((p) => ({
            tenant_id: tenantId,
            name: p.name,
            sku: p.sku,
            price: p.price,
            cost: p.cost,
            stock: p.stock,
            min_stock: 5,
            category: p.category,
            product_type: p.product_type ?? "simple",
            is_active: true,
            is_online: cfg.type === "empresa",
            online_stock: p.stock,
          }))
        );
        if (error) throw new Error(`products insert (${cfg.tenantSlug}): ${error.message}`);
      }

      // 4a) Categorías reales del giro (derivadas del catálogo, sin duplicar)
      const { count: catCount } = await admin
        .from("product_categories").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      if ((catCount ?? 0) === 0) {
        const names = [...new Set(cfg.products.map((p) => p.category))];
        const { error } = await admin.from("product_categories").insert(
          names.map((name) => ({ tenant_id: tenantId, name, is_active: true }))
        );
        if (error) throw new Error(`categories insert (${cfg.tenantSlug}): ${error.message}`);
      }

      // 4b) Seed recipes (only if none yet for this tenant)
      if (cfg.recipes && cfg.recipes.length > 0) {
        const { count: recCount } = await admin
          .from("product_recipes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
        if ((recCount ?? 0) === 0) {
          const { data: tProds } = await admin
            .from("products").select("id,sku").eq("tenant_id", tenantId);
          const bySku = new Map((tProds || []).map((p) => [p.sku, p.id]));
          const rows = cfg.recipes
            .map((r) => ({
              tenant_id: tenantId,
              product_id: bySku.get(r.product_sku),
              ingredient_id: bySku.get(r.ingredient_sku),
              quantity: r.quantity,
              unit: r.unit,
            }))
            .filter((r) => r.product_id && r.ingredient_id);
          if (rows.length > 0) await admin.from("product_recipes").insert(rows);
        }
      }

      // 4c) Mesas: sólo para giros que las usan (bar / restaurante)
      if (cfg.tables && cfg.tables.length > 0) {
        const { count: tCount } = await admin
          .from("restaurant_tables").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
        if ((tCount ?? 0) === 0) {
          await admin.from("restaurant_tables").insert(
            cfg.tables.map((t, i) => ({
              tenant_id: tenantId,
              name: t.name,
              capacity: t.capacity,
              status: "available",
              position_x: (i % 4) * 120,
              position_y: Math.floor(i / 4) * 120,
            }))
          );
        }
      } else {
        // Un tenant sin servicio de mesas no debe mostrar salón
        await admin.from("restaurant_tables").delete().eq("tenant_id", tenantId);
      }

      // 5) Customers
      const { count: custCount } = await admin
        .from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      if ((custCount ?? 0) === 0) {
        const { error } = await admin.from("customers").insert(
          cfg.customers.map((c) => ({ tenant_id: tenantId, ...c }))
        );
        if (error) throw new Error(`customers insert (${cfg.tenantSlug}): ${error.message}`);
      }

      // 6) Employees
      const { count: empCount } = await admin
        .from("employees").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      if ((empCount ?? 0) === 0) {
        const { error } = await admin.from("employees").insert(
          cfg.employees.map((e) => ({ tenant_id: tenantId, ...e, is_active: true }))
        );
        if (error) throw new Error(`employees insert (${cfg.tenantSlug}): ${error.message}`);
      }

      // 7) Tienda + almacén + vínculo (base física de inventario y ventas)
      let storeId: string;
      const { data: store0 } = await admin
        .from("stores").select("id").eq("tenant_id", tenantId).limit(1).maybeSingle();
      if (store0) storeId = store0.id;
      else {
        const { data: st, error } = await admin.from("stores").insert({
          tenant_id: tenantId, name: cfg.storeName, address: "La Habana, Cuba", is_active: true,
        }).select("id").single();
        if (error) throw new Error(`stores insert (${cfg.tenantSlug}): ${error.message}`);
        storeId = st!.id;
      }

      let warehouseId: string;
      const { data: wh0 } = await admin
        .from("warehouses").select("id").eq("tenant_id", tenantId).limit(1).maybeSingle();
      if (wh0) warehouseId = wh0.id;
      else {
        const { data: wh, error } = await admin.from("warehouses").insert({
          tenant_id: tenantId, name: cfg.warehouseName, location: "La Habana, Cuba", is_active: true,
        }).select("id").single();
        if (error) throw new Error(`warehouses insert (${cfg.tenantSlug}): ${error.message}`);
        warehouseId = wh!.id;
      }
      await admin.from("warehouse_stores").upsert(
        { tenant_id: tenantId, warehouse_id: warehouseId, store_id: storeId, is_primary: true },
        { onConflict: "warehouse_id,store_id" }
      );

      // 8) Métodos de pago
      const { count: pmCount } = await admin
        .from("payment_methods").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      if ((pmCount ?? 0) === 0) {
        await admin.from("payment_methods").insert([
          { tenant_id: tenantId, name: "Efectivo", type: "cash", is_active: true },
          { tenant_id: tenantId, name: "Tarjeta", type: "card", requires_card_info: true, is_active: true },
          { tenant_id: tenantId, name: "Transferencia", type: "transfer", is_active: true },
        ]);
      }

      // 9) Stock por ubicación (tienda) coherente con el catálogo del tenant
      const { data: allProds } = await admin
        .from("products").select("id, sku, name, price, cost, stock, product_type").eq("tenant_id", tenantId);
      const products = allProds || [];
      const { count: psCount } = await admin
        .from("product_stock").select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId).eq("location_id", storeId);
      if ((psCount ?? 0) === 0 && products.length) {
        await admin.from("product_stock").upsert(
          products.map((p) => ({
            tenant_id: tenantId, product_id: p.id, location_type: "store", location_id: storeId,
            stock: Number(p.stock) || 0, min_stock: 5,
          })),
          { onConflict: "product_id,location_type,location_id" }
        );
      }

      // 10) Operación real: turno → ventas → líneas → pagos → devolución
      const { count: salesCount } = await admin
        .from("sales").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
      if ((salesCount ?? 0) === 0 && products.length) {
        const { data: custs } = await admin.from("customers").select("id").eq("tenant_id", tenantId);
        const { data: emps } = await admin.from("employees").select("id").eq("tenant_id", tenantId);
        const customers = custs || [];
        const employees = emps || [];
        const sellable = products.filter((p) => Number(p.price) > 0);

        const openedAt = new Date(Date.now() - 8 * 3600_000).toISOString();
        const { data: shift } = await admin.from("sales_shifts").insert({
          tenant_id: tenantId, user_id: userId, employee_id: employees[0]?.id ?? null,
          store_id: storeId, store_name: cfg.storeName, opened_at: openedAt,
          opening_cash: 5000, status: "open",
        }).select("id").single();
        const shiftId = shift?.id ?? null;

        let shiftTotal = 0;
        let ticket = 1;
        const createdSales: { id: string; items: { id: string; qty: number; price: number; product_id: string }[] }[] = [];

        for (let s = 0; s < 8; s++) {
          const lines = sellable
            .slice((s * 3) % Math.max(sellable.length - 3, 1), ((s * 3) % Math.max(sellable.length - 3, 1)) + 2 + (s % 2))
            .map((p, idx) => ({ product: p, qty: 1 + ((s + idx) % 3) }));
          if (!lines.length) continue;
          const subtotal = lines.reduce((a, l) => a + Number(l.product.price) * l.qty, 0);
          const total = subtotal;
          const createdAt = new Date(Date.now() - (8 - s) * 3600_000 + 60_000).toISOString();

          const { data: sale, error: saleErr } = await admin.from("sales").insert({
            tenant_id: tenantId,
            customer_id: customers.length ? customers[s % customers.length].id : null,
            employee_id: employees.length ? employees[s % employees.length].id : null,
            shift_id: shiftId,
            store_id: storeId,
            subtotal, tax: 0, total, amount_paid: total,
            status: "completed",
            ticket_number: `${cfg.tenantSlug.toUpperCase()}-${String(ticket++).padStart(4, "0")}`,
            currency: "CUP", exchange_rate: 1, total_in_base: total,
            created_at: createdAt,
          }).select("id").single();
          if (saleErr) throw new Error(`sales insert (${cfg.tenantSlug}): ${saleErr.message}`);

          const { data: insertedItems, error: itErr } = await admin.from("sale_items").insert(
            lines.map((l) => ({
              sale_id: sale!.id,
              product_id: l.product.id,
              product_name: l.product.name,
              sku: l.product.sku,
              price: Number(l.product.price),
              qty: l.qty,
              total: Number(l.product.price) * l.qty,
            }))
          ).select("id, qty, price, product_id");
          if (itErr) throw new Error(`sale_items insert (${cfg.tenantSlug}): ${itErr.message}`);

          await admin.from("sale_payments").insert({
            sale_id: sale!.id,
            method: s % 3 === 0 ? "card" : "cash",
            currency: "CUP", amount: total, amount_in_base: total, exchange_rate: 1,
          });

          shiftTotal += total;
          createdSales.push({ id: sale!.id, items: (insertedItems || []) as any });
        }

        if (shiftId) {
          await admin.from("sales_shifts").update({
            total_sales: shiftTotal, total_transactions: createdSales.length,
          }).eq("id", shiftId);
        }

        // Devolución real ligada a la primera venta (1 unidad de su primera línea)
        const first = createdSales[0];
        if (first && first.items.length) {
          const line = first.items[0];
          const qty = 1;
          const refund = qty * Number(line.price);
          const { data: ret } = await admin.from("sale_returns").insert({
            tenant_id: tenantId, sale_id: first.id,
            return_number: `DEV-${cfg.tenantSlug.toUpperCase()}-0001`,
            reason: "Producto no conforme (dato demo trazable)",
            total: refund, refund_method: "cash", restock: true,
            status: "completed", performed_by: userId,
          }).select("id").single();
          if (ret) {
            const prod = products.find((p) => p.id === line.product_id);
            await admin.from("sale_return_items").insert({
              return_id: ret.id, sale_item_id: line.id, product_id: line.product_id,
              product_name: prod?.name ?? "", qty, price: Number(line.price), total: refund,
            });
            await admin.rpc("process_sale_return", {
              p_return_id: ret.id, p_location_type: "store", p_location_id: storeId,
            });
          }
        }
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
