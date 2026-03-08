import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  business_type: string;
  email: string | null;
  phone: string | null;
  address: string | null;
}

interface TenantContextType {
  tenantId: string | null;
  tenant: TenantInfo | null;
  allTenants: TenantInfo[];
  setActiveTenantId: (id: string) => void;
  loading: boolean;
  businessType: string;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [allTenants, setAllTenants] = useState<TenantInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTenantId(null);
      setTenant(null);
      setAllTenants([]);
      setLoading(false);
      return;
    }

    const load = async () => {
      // Check if superadmin
      const { data: sa } = await supabase.from("superadmins").select("id").eq("user_id", user.id).maybeSingle();

      if (sa) {
        // Superadmin: load all tenants
        const { data: tenants } = await supabase.from("tenants").select("id, name, slug, business_type, email, phone, address").eq("is_active", true).order("name");
        const list = (tenants ?? []) as TenantInfo[];
        setAllTenants(list);

        // Restore last selected or pick first
        const stored = localStorage.getItem("sa_active_tenant");
        const match = list.find((t) => t.id === stored);
        if (match) {
          setTenantId(match.id);
          setTenant(match);
        } else if (list.length > 0) {
          setTenantId(list[0].id);
          setTenant(list[0]);
        }
      } else {
        // Regular user: get their tenant
        const { data: tu } = await supabase.from("tenant_users").select("tenant_id").eq("user_id", user.id).limit(1).single();
        if (tu) {
          const { data: t } = await supabase.from("tenants").select("id, name, slug, business_type, email, phone, address").eq("id", tu.tenant_id).single();
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

  const setActiveTenantId = (id: string) => {
    const t = allTenants.find((t) => t.id === id);
    if (t) {
      setTenantId(t.id);
      setTenant(t);
      localStorage.setItem("sa_active_tenant", id);
    }
  };

  return (
    <TenantContext.Provider value={{ tenantId, tenant, allTenants, setActiveTenantId, loading, businessType: tenant?.business_type ?? "empresa" }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenantContext() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenantContext must be used within TenantProvider");
  return ctx;
}
