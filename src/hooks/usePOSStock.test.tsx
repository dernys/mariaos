import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
import { usePOSStock } from "./usePOSStock";
function queries(stock: number, error: object | null = null) {
  mocks.from.mockImplementation((table: string) => {
    const query = { select: vi.fn(), eq: vi.fn(), limit: vi.fn() };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    query.limit.mockResolvedValue({ data: table === "product_stock" ? [{ product_id: "p", stock }] : [], error });
    return query;
  });
}
describe("POS location snapshot", () => {
  beforeEach(() => { vi.clearAllMocks(); queries(21); });
  it("uses store stock rather than the global total", async () => {
    const { result } = renderHook(() => usePOSStock("tenant-a", "store-a"));
    expect(result.current.stockOf("p", 73)).toBe(0);
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.stockOf("p", 73)).toBe(21);
    expect(result.current.stockOf("missing", 73)).toBe(0);
  });
  it("does not reuse stock from another store", async () => {
    const { result, rerender } = renderHook(({ store }) => usePOSStock("tenant-a", store), { initialProps: { store: "store-a" } });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    queries(6);
    rerender({ store: "store-b" });
    expect(result.current.stockOf("p", 73)).toBe(0);
    await waitFor(() => expect(result.current.stockOf("p", 73)).toBe(6));
  });
  it("fails closed when a refresh returns an error", async () => {
    const { result } = renderHook(() => usePOSStock("tenant-a", "store-a"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    queries(21, { message: "denied" });
    await act(async () => { await result.current.refresh(); });
    expect(result.current.loaded).toBe(false);
    expect(result.current.stockOf("p", 73)).toBe(0);
  });
});