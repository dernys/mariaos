import i18n from "./index";

/**
 * Returns the active locale, normalized for Intl APIs.
 * Intl accepts BCP-47 tags directly (es, es-CU, pt-BR, en, en-US).
 */
export function activeLocale(): string {
  return i18n.language || "es";
}

export function formatMoney(
  value: number | null | undefined,
  currency: string = "USD",
  locale?: string
): string {
  const n = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(locale ?? activeLocale(), {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function formatNumber(
  value: number | null | undefined,
  locale?: string,
  options?: Intl.NumberFormatOptions
): string {
  const n = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(locale ?? activeLocale(), options).format(n);
  } catch {
    return String(n);
  }
}

export function formatDate(
  value: string | number | Date | null | undefined,
  locale?: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" }
): string {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(locale ?? activeLocale(), options).format(new Date(value));
  } catch {
    return String(value);
  }
}

export function formatDateTime(
  value: string | number | Date | null | undefined,
  locale?: string
): string {
  return formatDate(value, locale, { dateStyle: "medium", timeStyle: "short" });
}

export function formatTime(
  value: string | number | Date | null | undefined,
  locale?: string
): string {
  return formatDate(value, locale, { timeStyle: "short" });
}
