import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useTenantContext } from "./useTenantContext";
import { normalizeLocale, type AppLocale } from "@/i18n";

const STORAGE_KEY = "maria_locale";

/**
 * Resolves the active UI locale in this priority order:
 *   1. user preference (profiles.locale)
 *   2. tenant preference (tenants.default_locale)
 *   3. browser language
 *   4. fallback "es"
 * Persists user choice to profiles.locale and tenant choice to tenants.default_locale.
 */
export function useLocale() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const { tenant } = useTenantContext();

  // Reactively resolve when user/tenant load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let userLocale: string | null = null;
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("locale")
          .eq("user_id", user.id)
          .maybeSingle();
        userLocale = (data as any)?.locale ?? null;
      }
      const tenantLocale = (tenant as any)?.default_locale ?? null;
      const browserLocale = typeof navigator !== "undefined" ? navigator.language : null;
      const resolved = normalizeLocale(userLocale || tenantLocale || browserLocale);
      if (!cancelled && resolved !== i18n.language) {
        await i18n.changeLanguage(resolved);
        localStorage.setItem(STORAGE_KEY, resolved);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, tenant, i18n]);

  const setUserLocale = async (locale: AppLocale) => {
    await i18n.changeLanguage(locale);
    localStorage.setItem(STORAGE_KEY, locale);
    if (user) {
      await supabase.from("profiles").update({ locale } as any).eq("user_id", user.id);
    }
  };

  const setTenantLocale = async (locale: AppLocale) => {
    if (!tenant?.id) return;
    await (supabase as any).from("tenants").update({ default_locale: locale }).eq("id", tenant.id);
  };

  return {
    locale: (i18n.language || "es") as AppLocale,
    setUserLocale,
    setTenantLocale,
  };
}
