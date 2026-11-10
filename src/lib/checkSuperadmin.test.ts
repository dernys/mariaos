import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: mocks.getSession, refreshSession: mocks.refreshSession },
  functions: { invoke: mocks.invoke },
} }));
import { checkSuperadmin } from "./checkSuperadmin";

const session = (token = "test-current", expires_at = Math.floor(Date.now() / 1000) + 3600, id = "user-a") =>
  ({ access_token: token, expires_at, user: { id } });
describe("authenticated superadmin check", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getSession.mockResolvedValue({ data: { session: session() }, error: null });
    mocks.invoke.mockResolvedValue({ data: { is_superadmin: true }, error: null });
  });
  it("does not invoke without a user session", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    expect(await checkSuperadmin("user-a")).toBe(false);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("passes the current user's access token explicitly", async () => {
    expect(await checkSuperadmin("user-a")).toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith("check-superadmin", { headers: { Authorization: "Bearer test-current" } });
  });
  it("refreshes an expired session before invoking", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: session("expired", 1) }, error: null });
    mocks.refreshSession.mockResolvedValue({ data: { session: session("fresh") }, error: null });
    expect(await checkSuperadmin("user-a")).toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith("check-superadmin", { headers: { Authorization: "Bearer fresh" } });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
  it("retries a rejected token once and then fails closed", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: { status: 401 } } });
    mocks.refreshSession.mockResolvedValue({ data: { session: session("fresh") }, error: null });
    expect(await checkSuperadmin("user-a")).toBe(false);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
  });
  it("rejects a session belonging to another user", async () => {
    expect(await checkSuperadmin("user-b")).toBe(false);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("does not grant access to a regular user", async () => {
    mocks.invoke.mockResolvedValue({ data: { is_superadmin: false }, error: null });
    expect(await checkSuperadmin("user-a")).toBe(false);
  });
  it("fails closed when refresh fails", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: { status: 401 } } });
    mocks.refreshSession.mockResolvedValue({ data: { session: null }, error: new Error("refresh failed") });
    expect(await checkSuperadmin("user-a")).toBe(false);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});