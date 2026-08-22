import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { setObservabilityContext } from "@/lib/observability";
import { useAuth } from "./useAuth";

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  business_type: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  default_locale: string | null;
}

export type TenantMode = "tenant" | "global";

interface TenantContextType {
  tenantId: string | null;
  tenant: TenantInfo | null;
  allTenants: TenantInfo[];
  setActiveTenantId: (id: string) => Promise<void>;
  /** Re-reads the tenant list (use after provisioning a new business) */
  refreshTenants: () => Promise<TenantInfo[]>;
  mode: TenantMode;
  setMode: (mode: TenantMode) => Promise<void>;
  isSuperadmin: boolean;
  /** Increments on every tenant switch: use to reset local state/stores */
  contextVersion: number;
  loading: boolean;
  businessType: string;
}


const TenantContext = createContext<TenantContextType | undefined>(undefined);

const TENANT_COLS = "id, name, slug, business_type, email, phone, address";

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [allTenants, setAllTenants] = useState<TenantInfo[]>([]);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [mode, setModeState] = useState<TenantMode>("tenant");
  const [contextVersion, setContextVersion] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTenantId(null);
      setTenant(null);
      setAllTenants([]);
      setIsSuperadmin(false);
      setLoading(false);
      return;
    }

    const load = async () => {
      const { data: sa } = await supabase
        .from("superadmins")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (sa) {
        setIsSuperadmin(true);
        const { data: tenants } = await supabase
          .from("tenants")
          .select(TENANT_COLS)
          .eq("is_active", true)
          .order("name");
        const list = (tenants ?? []) as TenantInfo[];
        setAllTenants(list);

        // Server-side context is the source of truth (never localStorage alone)
        const { data: ctx } = await supabase.rpc("get_superadmin_context");
        const serverCtx = Array.isArray(ctx) ? ctx[0] : ctx;
        const serverMode = (serverCtx?.mode as TenantMode) ?? "tenant";
        setModeState(serverMode);

        const stored = localStorage.getItem("sa_active_tenant");
        const target =
          list.find((t) => t.id === serverCtx?.tenant_id) ??
          list.find((t) => t.id === stored) ??
          list[0];

        if (target) {
          // Sync the secure server-side context before any data query runs
          const { error } = await supabase.rpc("set_active_tenant", { _tenant_id: target.id });
          if (!error) {
            setTenantId(target.id);
            setTenant(target);
            localStorage.setItem("sa_active_tenant", target.id);
          }
        }
      } else {
        setIsSuperadmin(false);
        const { data: tu } = await supabase
          .from("tenant_users")
          .select("tenant_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        if (tu) {
          const { data: t } = await supabase
            .from("tenants")
            .select(TENANT_COLS)
            .eq("id", tu.tenant_id)
            .maybeSingle();
          if (t) {
            const info = t as TenantInfo;
            setTenantId(info.id);
            setTenant(info);
            setAllTenants([info]);
          }
        }
      }
      setLoading(false);
    };

    load();
  }, [user]);

  useEffect(() => {
    setObservabilityContext({ tenant_id: tenantId, user_id: user?.id ?? null });
  }, [tenantId, user?.id]);

  const refreshTenants = useCallback(async (): Promise<TenantInfo[]> => {
    if (!isSuperadmin) return allTenants;
    const { data } = await supabase
      .from("tenants")
      .select(TENANT_COLS)
      .eq("is_active", true)
      .order("name");
    const list = (data ?? []) as TenantInfo[];
    setAllTenants(list);
    return list;
  }, [isSuperadmin, allTenants]);

  const setActiveTenantId = useCallback(
    async (id: string) => {
      let t = allTenants.find((x) => x.id === id);
      if (!t) {
        // A business provisioned in this session may not be in the cached list yet
        const { data } = await supabase.from("tenants").select(TENANT_COLS).eq("id", id).maybeSingle();
        if (!data) return;
        t = data as TenantInfo;
      }
      const { error } = await supabase.rpc("set_active_tenant", { _tenant_id: id });
      if (error) return;
      localStorage.setItem("sa_active_tenant", id);
      // Hard reset of every cached query/store of the previous tenant
      queryClient.cancelQueries();
      queryClient.clear();
      // Purge non tenant-scoped local state that could leak across businesses
      ["pos_bar_cart_last", "maria_marketplace_cart"].forEach((k) => localStorage.removeItem(k));
      setTenantId(t.id);
      setTenant(t);
      setModeState("tenant");
      setContextVersion((v) => v + 1);
      // Full remount guarantees no in-memory state survives the switch
      window.location.reload();
    },
    [allTenants, queryClient],
  );


  const setMode = useCallback(
    async (next: TenantMode) => {
      const { error } = await supabase.rpc("set_superadmin_mode", { _mode: next });
      if (error) return;
      queryClient.cancelQueries();
      queryClient.clear();
      setModeState(next);
      setContextVersion((v) => v + 1);
    },
    [queryClient],
  );

  return (
    <TenantContext.Provider
      value={{
        tenantId,
        tenant,
        allTenants,
        setActiveTenantId,
        refreshTenants,

        mode,
        setMode,
        isSuperadmin,
        contextVersion,
        loading,
        businessType: tenant?.business_type ?? "empresa",
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenantContext() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenantContext must be used within TenantProvider");
  return ctx;
}
