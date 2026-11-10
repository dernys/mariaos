import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: {
  user: null as { id: string } | null,
  session: null as { access_token: string } | null,
  loading: true,
}, check: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/checkSuperadmin", () => ({ checkSuperadmin: mocks.check }));
import { useSuperadmin } from "./useSuperadmin";

describe("superadmin session lifecycle", () => {
  beforeEach(() => {
    mocks.auth = { user: null, session: null, loading: true };
    mocks.check.mockReset();
  });
  it("keeps hook order stable from hydration to sign-in and sign-out", async () => {
    mocks.check.mockResolvedValue(true);
    const { result, rerender } = renderHook(() => useSuperadmin());
    expect(result.current.loading).toBe(true);
    expect(mocks.check).not.toHaveBeenCalled();
    mocks.auth = { user: { id: "user-a" }, session: { access_token: "test-token" }, loading: false };
    rerender();
    await waitFor(() => expect(result.current).toEqual({ isSuperadmin: true, loading: false }));
    mocks.auth = { user: null, session: null, loading: false };
    rerender();
    expect(result.current).toEqual({ isSuperadmin: false, loading: false });
  });
  it("ignores the previous user's pending verification after sign-out", async () => {
    let resolve: (value: boolean) => void = () => {};
    mocks.check.mockReturnValue(new Promise<boolean>((done) => { resolve = done; }));
    mocks.auth = { user: { id: "user-a" }, session: { access_token: "test-token" }, loading: false };
    const { result, rerender } = renderHook(() => useSuperadmin());
    mocks.auth = { user: null, session: null, loading: false };
    rerender();
    await act(async () => { resolve(true); });
    expect(result.current).toEqual({ isSuperadmin: false, loading: false });
  });
  it("handles rejected verification without throwing or granting access", async () => {
    mocks.check.mockRejectedValue(new Error("Invalid token"));
    mocks.auth = { user: { id: "user-a" }, session: { access_token: "test-token" }, loading: false };
    const { result } = renderHook(() => useSuperadmin());
    await waitFor(() => expect(result.current).toEqual({ isSuperadmin: false, loading: false }));
  });
});