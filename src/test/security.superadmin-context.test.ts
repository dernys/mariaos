// Contrato del contexto seguro de negocio activo (GLOBAL vs TENANT MODE).
// Se ejecuta contra el backend real con la clave pública (rol anon) para demostrar
// que el contexto NO es manipulable sin una identidad de superadmin verificada
// y que las funciones de Edge fallan cerradas.
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL ?? import.meta.env?.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;

const anon = createClient(url as string, key as string, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const FAKE_TENANT = "00000000-0000-0000-0000-0000000000aa";

describe("contexto de negocio activo (superadmin)", () => {
  it("no se puede establecer el negocio activo sin sesión", async () => {
    const { error } = await anon.rpc("set_active_tenant", { _tenant_id: FAKE_TENANT } as never);
    expect(error).toBeTruthy();
  });

  it("la tabla de contexto no es legible ni escribible por anónimos", async () => {
    const { data } = await anon.from("superadmin_context" as never).select("*").limit(5);
    expect(data ?? []).toHaveLength(0);
    const { error } = await anon
      .from("superadmin_context" as never)
      .insert({ user_id: FAKE_TENANT, tenant_id: FAKE_TENANT } as never);
    expect(error).toBeTruthy();
  });

  it("el Data Center falla cerrado sin identidad válida", async () => {
    const res = await fetch(`${url}/functions/v1/data-center`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key as string },
      body: JSON.stringify({ action: "export", entity: "productos", tenant_id: FAKE_TENANT }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("la auditoría global falla cerrada sin identidad válida", async () => {
    const res = await fetch(`${url}/functions/v1/audit-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key as string },
      body: JSON.stringify({ tenant_id: FAKE_TENANT }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
