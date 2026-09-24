import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Authorization is enforced in THREE places — proxy, layout, and each route
 * handler. The route handler is the one that matters: it is a separate entry
 * point, and assuming it is unreachable because a layout is guarded is exactly
 * the mistake that would let any authenticated contractor rewrite every prompt
 * in the system via the service-role client.
 *
 * These tests pin the handler behaviour. Both admin routes must 404 a
 * non-admin, and must not touch the database on the way.
 */

vi.mock("server-only", () => ({}));

const getAdminIdentity = vi.fn();
vi.mock("@/lib/admin/guard", () => ({
  getAdminIdentity: (...a: unknown[]) => getAdminIdentity(...(a as [])),
}));

const onboardContractor = vi.fn();
const listContractors = vi.fn();
const createAdminClient = vi.fn();
const getProviders = vi.fn();
const recordDispatchEvent = vi.fn();
const from = vi.fn();

vi.mock("@/lib/admin/onboarding", () => ({
  onboardContractor: (...a: unknown[]) => onboardContractor(...(a as [])),
  listContractors: (...a: unknown[]) => listContractors(...(a as [])),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: (...a: unknown[]) => createAdminClient(...(a as [])),
}));

vi.mock("@/lib/integrations", () => ({
  getProviders: (...a: unknown[]) => getProviders(...(a as [])),
}));

vi.mock("@/lib/portal/persistence", () => ({
  recordDispatchEvent: (...a: unknown[]) => recordDispatchEvent(...(a as [])),
}));

vi.mock("@/lib/observability/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { POST } = await import("@/app/api/admin/contractors/route");
const { PATCH } = await import("@/app/api/admin/contractors/[id]/prompt/route");

const CONTRACTOR_ID = "11111111-1111-4111-8111-111111111111";

function adminRequest(body: unknown) {
  return new Request("http://localhost/api/admin/contractors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

function promptRequest(body: unknown, id = CONTRACTOR_ID) {
  return new Request(`http://localhost/api/admin/contractors/${id}/prompt`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

const validBody = {
  name: "Peak HVAC",
  primaryTrade: "hvac",
  tier: "emergency",
  regions: ["US-CO"],
  dispatchChannels: ["sms"],
};

beforeEach(() => {
  vi.clearAllMocks();
  getAdminIdentity.mockResolvedValue({ isAdmin: true, userId: "u-1", email: "ops@x.com" });
  createAdminClient.mockReturnValue({ from, auth: { admin: { listUsers: vi.fn() } } });

  // A fluent query builder. Every method must return the same object — the
  // production code chains .select().eq().order().limit().maybeSingle(), and
  // a mock missing one link silently breaks the chain.
  const row = { id: "p-1", trade: "hvac", business_name: "Peak" };
  const q: Record<string, unknown> = {};
  q.select = vi.fn(() => q);
  q.eq = vi.fn(() => q);
  q.order = vi.fn(() => q);
  q.limit = vi.fn(() => q);
  q.update = vi.fn(() => q);
  q.single = async () => ({ data: row, error: null });
  q.maybeSingle = async () => ({ data: row, error: null });
  from.mockReturnValue(q);

  getProviders.mockReturnValue({
    voice: {
      createAgent: vi.fn(async () => ({ agentId: "agt_1" })),
      updateAgent: vi.fn(async () => undefined),
    },
  });
});

describe("POST /api/admin/contractors — authorization", () => {
  it("404s an unauthenticated caller and never touches the database", async () => {
    getAdminIdentity.mockResolvedValue({ isAdmin: false, userId: null, email: null });
    const res = await POST(adminRequest(validBody));
    // 404 not 403: a 403 confirms the endpoint exists.
    expect(res.status).toBe(404);
    expect(onboardContractor).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("404s an authenticated NON-admin — the realistic threat", async () => {
    getAdminIdentity.mockResolvedValue({ isAdmin: false, userId: "u-1", email: "c@x.com" });
    const res = await POST(adminRequest(validBody));
    expect(res.status).toBe(404);
    expect(onboardContractor).not.toHaveBeenCalled();
  });

  it("rejects invalid input before any write", async () => {
    const res = await POST(adminRequest({ name: "", primaryTrade: "welding" }));
    expect(res.status).toBe(400);
    expect(onboardContractor).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/contractors/[id]/prompt — authorization", () => {
  it("404s a non-admin and never opens the service-role client", async () => {
    getAdminIdentity.mockResolvedValue({ isAdmin: false, userId: "u-1", email: "c@x.com" });
    const res = await PATCH(
      promptRequest({ greeting: "hijacked", afterHoursOnly: false, objections: {} }),
      { params: Promise.resolve({ id: CONTRACTOR_ID }) },
    );
    expect(res.status).toBe(404);
    // The privilege boundary: an RLS-bypassing client must not even be
    // constructed for an unauthorized caller.
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("404s an unauthenticated caller", async () => {
    getAdminIdentity.mockResolvedValue({ isAdmin: false, userId: null, email: null });
    const res = await PATCH(
      promptRequest({ greeting: "x", afterHoursOnly: false, objections: {} }),
      { params: Promise.resolve({ id: CONTRACTOR_ID }) },
    );
    expect(res.status).toBe(404);
  });

  it("rejects a malformed contractor id", async () => {
    const res = await PATCH(
      promptRequest({ greeting: "x", afterHoursOnly: false, objections: {} }),
      { params: Promise.resolve({ id: "../../etc/passwd" }) },
    );
    expect(res.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects an empty greeting rather than wiping a prompt", async () => {
    const res = await PATCH(
      promptRequest({ greeting: "", afterHoursOnly: false, objections: {} }),
      { params: Promise.resolve({ id: CONTRACTOR_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("reports a failed agent push without rolling back the stored prompt", async () => {
    // The operator's edit is the source of truth. Silently discarding it is
    // worse than a stale agent that the next sync picks up.
    getProviders.mockReturnValue({
      voice: {
        createAgent: vi.fn(async () => {
          throw new Error("retell unreachable");
        }),
        updateAgent: vi.fn(),
      },
    });

    const res = await PATCH(
      promptRequest({ greeting: "New greeting", afterHoursOnly: true, objections: {} }),
      { params: Promise.resolve({ id: CONTRACTOR_ID }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, pushed: false });
    expect(body.pushDetail).toContain("retell unreachable");
  });
});
