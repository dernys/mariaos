// QW3 — Observabilidad empresarial (aditiva y desactivable).
//
// Objetivo: que cualquier error o operación relevante quede registrado con el
// contexto mínimo para diagnosticar en minutos: tenant, usuario, módulo,
// operación y correlation_id.
//
// Diseño:
// - Cero dependencias externas: funciona dentro de Lovable Cloud.
// - Desactivable con VITE_OBSERVABILITY=off (degrada a no-op silencioso).
// - Nunca lanza: la observabilidad jamás puede romper el flujo de negocio.
// - Los errores se persisten de forma best-effort en `activity_log`
//   (entity_type = 'observability'), que ya está protegido por RLS por tenant.

import { supabase } from "@/integrations/supabase/client";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface ObservabilityContext {
  tenant_id?: string | null;
  user_id?: string | null;
  module?: string;
  operation?: string;
  operation_id?: string;
  correlation_id?: string;
}

export interface LogFields extends ObservabilityContext {
  [key: string]: unknown;
}

const ENABLED = import.meta.env.VITE_OBSERVABILITY !== "off";

/** Contexto ambiental, fijado una vez que se conocen tenant y usuario. */
let ambient: ObservabilityContext = {};

export function setObservabilityContext(ctx: ObservabilityContext) {
  ambient = { ...ambient, ...ctx };
}

export function getObservabilityContext(): ObservabilityContext {
  return { ...ambient };
}

function envelope(level: LogLevel, message: string, fields: LogFields = {}) {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...ambient,
    ...fields,
  };
}

function toConsole(level: LogLevel, payload: Record<string, unknown>) {
  const line = `[${payload.module ?? "app"}${payload.operation ? ":" + payload.operation : ""}]`;
  // eslint-disable-next-line no-console
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  sink(line, payload.message, payload);
}

async function persistError(payload: Record<string, unknown>) {
  try {
    await supabase.from("activity_log").insert({
      entity_type: "observability",
      entity_id: String(payload.operation_id ?? payload.correlation_id ?? "unknown"),
      action: String(payload.level),
      description: String(payload.message).slice(0, 500),
      metadata: payload as any,
      tenant_id: (payload.tenant_id as string) ?? null,
      performed_by: (payload.user_id as string) ?? null,
    });
  } catch {
    // best-effort: nunca propagar
  }
}

export function log(level: LogLevel, message: string, fields: LogFields = {}) {
  if (!ENABLED) return;
  const payload = envelope(level, message, fields);
  toConsole(level, payload);
  if (level === "error" || level === "warn") void persistError(payload);
}

export const observability = {
  debug: (m: string, f?: LogFields) => log("debug", m, f),
  info: (m: string, f?: LogFields) => log("info", m, f),
  warn: (m: string, f?: LogFields) => log("warn", m, f),
  error: (m: string, f?: LogFields) => log("error", m, f),
  captureException(err: unknown, fields: LogFields = {}) {
    const e = err instanceof Error ? err : new Error(String(err));
    log("error", e.message, { ...fields, error_name: e.name, stack: e.stack?.slice(0, 2000) });
  },
};

/** Handlers globales del navegador. Idempotente. */
let installed = false;
export function installGlobalErrorHandlers() {
  if (!ENABLED || installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    observability.captureException(e.error ?? e.message, { module: "window", operation: "onerror" });
  });
  window.addEventListener("unhandledrejection", (e) => {
    observability.captureException((e as PromiseRejectionEvent).reason, {
      module: "window",
      operation: "unhandledrejection",
    });
  });
}
