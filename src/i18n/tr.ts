import i18n from "@/i18n";
import { PT_PHRASES } from "./ptPhrases";

/**
 * Traducción por frase para pantallas con textos originales en español.
 * Devuelve el texto en pt-BR cuando el idioma activo es portugués y existe traducción.
 */
export function tr(es: string): string {
  const lang = i18n.language ?? "";
  if (lang.startsWith("pt")) return PT_PHRASES[es] ?? es;
  return es;
}
