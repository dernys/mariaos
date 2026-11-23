import i18n from "@/i18n";
import { PT_PHRASES } from "./ptPhrases";
import { PT_PHRASES_AUTO } from "./ptPhrasesAuto";

/**
 * Traducción por frase para pantallas con textos originales en español.
 * Devuelve el texto en pt-BR cuando el idioma activo es portugués y existe traducción.
 */
export function tr(es: string): string;
export function tr<T>(value: T): T;
export function tr(es: unknown): unknown {
  if (typeof es !== "string") return es;
  const lang = i18n.language ?? "";
  if (lang.startsWith("pt")) return PT_PHRASES[es] ?? PT_PHRASES_AUTO[es] ?? es;
  return es;
}
