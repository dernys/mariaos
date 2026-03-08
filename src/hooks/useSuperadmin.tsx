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

    try {
      const { data, error } = await supabase.functions.invoke("check-superadmin");
      if (!error && data?.is_superadmin) {
        setIsSuperadmin(true);
      } else {
        setIsSuperadmin(false);
      }
    } catch {
      setIsSuperadmin(false);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    checkSuperadmin();
  }, [checkSuperadmin]);

  return { isSuperadmin, loading };
}
