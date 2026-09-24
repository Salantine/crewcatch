import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The admin guard decides whether a request may provision real phone numbers
 * and read data through the service-role client, which bypasses RLS. A false
 * positive here exposes every contractor's leads, so these tests cover the
 * failure modes that would cause one — most importantly self-escalation via
 * user-writable metadata.
 */

let currentUser: {
  id: string;
  email: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
} | null = null;

const getUser = vi.fn(async () => ({ data: { user: currentUser }, error: null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

const { getAdminIdentity } = await import("@/lib/admin/guard");

beforeEach(() => {
  currentUser = null;
  getUser.mockClear();
});

describe("getAdminIdentity", () => {
  it("denies a signed-out request", async () => {
    const identity = await getAdminIdentity();
    expect(identity.isAdmin).toBe(false);
    expect(identity.userId).toBeNull();
  });

  it("denies an ordinary authenticated user", async () => {
    currentUser = { id: "u-1", email: "contractor@example.com" };
    const identity = await getAdminIdentity();
    expect(identity.isAdmin).toBe(false);
  });

  it("grants an app_metadata-flagged admin", async () => {
    currentUser = {
      id: "u-admin",
      email: "ops@crewcatch.ai",
      app_metadata: { is_admin: true },
    };
    const identity = await getAdminIdentity();
    expect(identity.isAdmin).toBe(true);
    expect(identity.userId).toBe("u-admin");
  });

  it("refuses self-escalation via user_metadata", async () => {
    // user_metadata is writable by the user from the browser. Trusting it
    // would let any contractor promote themselves with one updateUser call.
    currentUser = {
      id: "u-1",
      email: "attacker@example.com",
      user_metadata: { is_admin: true },
    };
    const identity = await getAdminIdentity();
    expect(identity.isAdmin).toBe(false);
  });

  it("requires the flag to be strictly true, not truthy", async () => {
    currentUser = {
      id: "u-1",
      email: "x@example.com",
      app_metadata: { is_admin: "true" },
    };
    expect((await getAdminIdentity()).isAdmin).toBe(false);
  });

  it("fails closed when the auth service throws", async () => {
    getUser.mockRejectedValueOnce(new Error("auth service unreachable"));
    const identity = await getAdminIdentity();
    expect(identity.isAdmin).toBe(false);
  });
});
