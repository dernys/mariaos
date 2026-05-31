import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useSuperadmin() {
  const { user } = useAuth();
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkSuperadmin = useCallback(async () => {
    if (!user) {
      setIsSuperadmin(false);
      setLoading(false);
      return;
    }

    // Hydrate from cache for instant UI (does NOT stop loading,
    // so guarded routes wait for the real verification before redirecting)
    const cacheKey = `sa:${user.id}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached !== null) {
      setIsSuperadmin(cached === "1");
    }

    try {
      const { data, error } = await supabase.functions.invoke("check-superadmin");
      const value = !error && !!data?.is_superadmin;
      setIsSuperadmin(value);
      sessionStorage.setItem(cacheKey, value ? "1" : "0");
    } catch {
      setIsSuperadmin(false);
      sessionStorage.setItem(cacheKey, "0");
    }
    setLoading(false);
  }, [user]);


  useEffect(() => {
    checkSuperadmin();
  }, [checkSuperadmin]);

  return { isSuperadmin, loading };
}
