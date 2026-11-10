// @refresh reset
// Changing a custom hook's internal hook order must remount its consumers in preview.
import { useState, useEffect } from "react";
import { checkSuperadmin } from "@/lib/checkSuperadmin";
import { useAuth } from "@/hooks/useAuth";

export function useSuperadmin() {
  const { user, session, loading: authLoading } = useAuth();
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsSuperadmin(false);
    setLoading(true);
    if (authLoading) return;
    if (!user || !session) {
      setLoading(false);
      return;
    }
    checkSuperadmin(user.id).then((value) => {
      if (!cancelled) setIsSuperadmin(value);
    }).catch(() => {
      if (!cancelled) setIsSuperadmin(false);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user?.id, session?.access_token, authLoading]);

  return { isSuperadmin, loading };
}
