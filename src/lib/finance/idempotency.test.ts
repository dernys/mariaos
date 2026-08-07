import { describe, it, expect } from "vitest";
import { beginOperation, idempotencyKeyFor, traceFields } from "@/lib/context/operationContext";

describe("QW1/QW2 — contexto de operación e idempotencia", () => {
  it("la misma intención produce la misma clave de idempotencia", () => {
    const first = beginOperation({ module: "sales", operation: "create_quick_sale", tenant_id: "t1" });
    // Reintento: mismo correlation_id, nuevo operation_id
    const retry = beginOperation({
      module: "sales",
      operation: "create_quick_sale",
      tenant_id: "t1",
      correlationId: first.correlation_id,
    });
    expect(retry.operation_id).not.toBe(first.operation_id);
    expect(idempotencyKeyFor(retry)).toBe(idempotencyKeyFor(first));
  });

  it("intenciones distintas producen claves distintas", () => {
    const a = beginOperation({ module: "sales", operation: "create_quick_sale", tenant_id: "t1" });
    const b = beginOperation({ module: "sales", operation: "create_quick_sale", tenant_id: "t1" });
    expect(idempotencyKeyFor(a)).not.toBe(idempotencyKeyFor(b));
  });

  it("la traza transporta los cinco campos obligatorios", () => {
    const ctx = beginOperation({ module: "finance", operation: "register_account_payment", tenant_id: "t1", user_id: "u1" });
    const f = traceFields(ctx);
    for (const key of ["tenant_id", "user_id", "operation_id", "correlation_id", "timestamp"]) {
      expect(f[key as keyof typeof f]).toBeTruthy();
    }
  });
});
