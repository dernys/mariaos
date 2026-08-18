// Pruebas de seguridad ejecutadas contra el backend real con la clave pública (rol anon).
// Objetivo: demostrar que un visitante no autenticado NO puede leer datos de negocio
// ni ejecutar operaciones privilegiadas, y que las funciones internas están cerradas.
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL ?? import.meta.env?.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;

const anon = createClient(url as string, key as string, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Tablas de negocio que jamás deben ser legibles sin sesión.
const PRIVATE_TABLES = [
  "sales",
  "sale_items",
  "purchases",
  "customers",
  "employees",
  "journal_entries",
  "journal_entry_lines",
  "payroll_runs",
  "product_stock",
  "inventory_movements",
  "tenant_users",
  "user_roles",
  "superadmins",
  "profiles",
  "business_memory",
  "ai_agents",
  "agent_actions",
  "risk_alerts",
  "tenant_api_keys",
  "webhooks",
  "activity_log",
];

describe("aislamiento anon (sin sesión)", () => {
  it.each(PRIVATE_TABLES)("no puede leer %s", async (table) => {
    const { data, error } = await anon.from(table as never).select("*").limit(1);
    expect(error || (data ?? []).length === 0).toBeTruthy();
    expect(data ?? []).toHaveLength(0);
  });

  it("no puede ejecutar operaciones internas de compras", async () => {
    const { error } = await anon.rpc("cancel_purchase", {
      p_purchase_id: "00000000-0000-0000-0000-000000000000",
      p_reason: "test",
    });
    expect(error).toBeTruthy();
  });

  it("no puede escribir en el catálogo de unidades de medida", async () => {
    const { error } = await anon
      .from("units_of_measure")
      .insert({ code: "SEC-TEST", name: "sec test" } as never);
    expect(error).toBeTruthy();
  });

  it("no puede crear roles de usuario", async () => {
    const { error } = await anon
      .from("user_roles")
      .insert({ user_id: "00000000-0000-0000-0000-000000000000", role: "admin" } as never);
    expect(error).toBeTruthy();
  });
});
