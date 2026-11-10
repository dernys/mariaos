import { supabase } from "@/integrations/supabase/client";

/** Use a hydrated user session; never fall back to the anonymous API key. */
export async function checkSuperadmin(userId: string): Promise<boolean> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session || data.session.user.id !== userId) return false;

  let session = data.session;
  if (session.expires_at && session.expires_at * 1000 <= Date.now() + 30_000) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session || refreshed.data.session.user.id !== userId) return false;
    session = refreshed.data.session;
  }

  const invoke = (token: string) => supabase.functions.invoke("check-superadmin", {
    headers: { Authorization: `Bearer ${token}` },
  });
  let result = await invoke(session.access_token);
  if (result.error?.context?.status === 401) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session || refreshed.data.session.user.id !== userId) return false;
    result = await invoke(refreshed.data.session.access_token);
  }
  return !result.error && result.data?.is_superadmin === true;
}