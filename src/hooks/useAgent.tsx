// Unified hook to invoke MarIA OS AI edge functions with:
// - Standardized error handling (rate limit, credits, validation)
// - Correlation ID generation and propagation (client → edge → DB)
// - Loading state per AI function
//
// All AI edge functions (agent-runner, inventory-intelligence, risk-scanner,
// logistics-optimizer, workflow-runner) should be invoked through this hook
// so the audit trail and toasts stay consistent across the app.
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AgentFunctionName =
  | "agent-runner"
  | "inventory-intelligence"
  | "risk-scanner"
  | "logistics-optimizer"
  | "workflow-runner";

export interface AgentInvokeOptions {
  /** Show toasts on success/error. Default true. */
  notify?: boolean;
  /** Optional explicit correlation_id; otherwise a fresh UUID is generated. */
  correlationId?: string;
}

export interface AgentInvokeResult<T = any> {
  data: T | null;
  error: string | null;
  correlationId: string;
  validationOk: boolean | null;
}

function newCorrelationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "cid-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useAgent() {
  const [running, setRunning] = useState<AgentFunctionName | null>(null);

  const invoke = useCallback(
    async <T = any>(
      name: AgentFunctionName,
      body: Record<string, any> = {},
      opts: AgentInvokeOptions = {},
    ): Promise<AgentInvokeResult<T>> => {
      const { notify = true, correlationId } = opts;
      const cid = correlationId ?? newCorrelationId();
      setRunning(name);
      try {
        const { data, error } = await supabase.functions.invoke<T>(name, {
          body: { ...body, correlation_id: cid },
          headers: { "x-correlation-id": cid },
        });

        if (error) {
          const msg = (error as any)?.message ?? "Error invocando agente";
          // Map well-known HTTP errors
          if (/429/.test(msg)) {
            if (notify) toast.error("Límite de uso alcanzado. Intenta más tarde.");
          } else if (/402/.test(msg)) {
            if (notify) toast.error("Créditos de IA agotados. Añade créditos al workspace.");
          } else if (/401|403/.test(msg)) {
            if (notify) toast.error("No autorizado para esta operación.");
          } else if (notify) {
            toast.error(msg);
          }
          return { data: null, error: msg, correlationId: cid, validationOk: null };
        }

        const validationOk =
          data && typeof data === "object" && "validation_ok" in (data as any)
            ? Boolean((data as any).validation_ok)
            : null;

        if (notify && validationOk === false) {
          toast.warning("Resultado parcialmente válido — revisa la decisión generada.");
        }

        return {
          data: data as T,
          error: null,
          correlationId: (data as any)?.correlation_id ?? cid,
          validationOk,
        };
      } catch (e: any) {
        const msg = e?.message ?? "Error inesperado";
        if (notify) toast.error(msg);
        return { data: null, error: msg, correlationId: cid, validationOk: null };
      } finally {
        setRunning(null);
      }
    },
    [],
  );

  return { invoke, running, isRunning: (n: AgentFunctionName) => running === n };
}
