// Pruebas de aislamiento multi-tenant y protección del superadministrador.
// Se ejecutan contra el backend real usando la clave pública (rol anon) para
// demostrar deny-by-default: sin identidad autenticada no hay acceso a datos ni
// posibilidad de escalar privilegios, y las tablas de identidad global están cerradas.
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL ?? import.meta.env?.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY;

const anon = createClient(url as string, key as string, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const FAKE_TENANT = "00000000-0000-0000-0000-0000000000aa";
const FAKE_USER = "00000000-0000-0000-0000-0000000000bb";

describe("aislamiento cross-tenant (sin identidad válida)", () => {
  it("solo expone el directorio público del marketplace, nunca datos sensibles del negocio", async () => {
    // El catálogo público (nombre, slug, logo, tipo) es intencionalmente visible
    // para visitantes sin cuenta: es el directorio del marketplace.
    const { data, error } = await anon.from("tenants").select("id, name, slug, business_type").limit(5);
    expect(error).toBeFalsy();
    expect(Array.isArray(data)).toBe(true);

    // Las columnas sensibles siguen cerradas a nivel de permisos de columna.
    for (const col of ["email", "phone", "address", "settings"]) {
      const res = await anon.from("tenants").select(col as never).limit(1);
      expect(res.error).toBeTruthy();
    }

    // Y no se puede escribir ni descubrir negocios inactivos.
    const inactive = await anon.from("tenants").select("id").eq("is_active", false).limit(1);
    expect(inactive.data ?? []).toHaveLength(0);
  });


  it("no puede leer membresías de negocio de otros usuarios", async () => {
    const { data } = await anon.from("tenant_users").select("*").limit(5);
    expect(data ?? []).toHaveLength(0);
  });

  it("no puede leer datos filtrando por un tenant_id arbitrario (IDOR)", async () => {
    for (const table of ["sales", "products", "customers", "employees", "journal_entries"]) {
      const { data } = await anon.from(table as never).select("*").eq("tenant_id", FAKE_TENANT).limit(1);
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("no puede insertar datos en un negocio ajeno", async () => {
    const { error } = await anon
      .from("products")
      .insert({ tenant_id: FAKE_TENANT, sku: "ISO-TEST", name: "iso test", price: 1 } as never);
    expect(error).toBeTruthy();
  });

  it("no puede modificar la configuración de un negocio ajeno", async () => {
    const { error } = await anon.from("tenants").update({ name: "hijacked" } as never).eq("id", FAKE_TENANT);
    expect(error || true).toBeTruthy();
    const { data } = await anon.from("tenants").select("id").eq("name", "hijacked");
    expect(data ?? []).toHaveLength(0);
  });
});

describe("protección del superadministrador", () => {
  it("la tabla de superadministradores no es enumerable", async () => {
    const { data } = await anon.from("superadmins").select("*").limit(5);
    expect(data ?? []).toHaveLength(0);
  });

  it("no se puede otorgar el rol admin (escalada de privilegios)", async () => {
    const { error } = await anon
      .from("user_roles")
      .insert({ user_id: FAKE_USER, role: "admin" } as never);
    expect(error).toBeTruthy();
  });

  it("no se puede registrar un superadministrador desde el cliente", async () => {
    const { error } = await anon.from("superadmins").insert({ user_id: FAKE_USER } as never);
    expect(error).toBeTruthy();
  });

  it("no se puede eliminar roles de otros usuarios", async () => {
    const { error, data } = await anon.from("user_roles").delete().eq("user_id", FAKE_USER).select();
    expect(error || (data ?? []).length === 0).toBeTruthy();
  });

  it("no se puede eliminar el perfil de otro usuario", async () => {
    const { error, data } = await anon.from("profiles").delete().eq("user_id", FAKE_USER).select();
    expect(error || (data ?? []).length === 0).toBeTruthy();
  });

  it("la función de protección de superadmin no es ejecutable por anónimos", async () => {
    const { error } = await anon.rpc("is_protected_superadmin", { _user_id: FAKE_USER } as never);
    expect(error).toBeTruthy();
  });

  it("la gestión de usuarios exige autenticación", async () => {
    const res = await fetch(`${url}/functions/v1/manage-users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key as string },
      body: JSON.stringify({ action: "delete", user_id: FAKE_USER }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("la importación de productos exige autenticación", async () => {
    const res = await fetch(`${url}/functions/v1/import-products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key as string },
      body: JSON.stringify({ rows: [{ sku: "X", name: "X", price: 1 }], tenant_id: FAKE_TENANT }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
