import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import es from "./locales/es.json";
import ptBR from "./locales/pt-BR.json";
import en from "./locales/en.json";

export const SUPPORTED_LOCALES = [
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "es-CU", label: "Español (Cuba)", flag: "🇨🇺" },
  { code: "pt-BR", label: "Português (Brasil)", flag: "🇧🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "en-US", label: "English (US)", flag: "🇺🇸" },
] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]["code"];

export const FALLBACK_LOCALE: AppLocale = "es";

/**
 * Normalize any locale (e.g. "es-AR", "pt") to a supported one.
 * Strategy: exact match → language-only match → fallback.
 */
export function normalizeLocale(input?: string | null): AppLocale {
  if (!input) return FALLBACK_LOCALE;
  const codes = SUPPORTED_LOCALES.map((l) => l.code);
  if (codes.includes(input as AppLocale)) return input as AppLocale;
  const lang = input.split("-")[0].toLowerCase();
  // language-only matches
  if (lang === "es") return "es";
  if (lang === "pt") return "pt-BR";
  if (lang === "en") return "en";
  return FALLBACK_LOCALE;
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es },
      "es-CU": { translation: es },
      "pt-BR": { translation: ptBR },
      en: { translation: en },
      "en-US": { translation: en },
    },
    fallbackLng: FALLBACK_LOCALE,
    supportedLngs: SUPPORTED_LOCALES.map((l) => l.code),
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "maria_locale",
      caches: ["localStorage"],
    },
    returnNull: false,
  });

export default i18n;
