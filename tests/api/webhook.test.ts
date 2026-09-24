import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

/**
 * The webhook is the only publicly-reachable write path in the product.
 *
 * Its behaviour was previously verified only by a script in /tmp — outside the
 * repo, never run by CI, and lost on reboot. These tests move that contract
 * into the suite, because the guarantees below are the difference between
 * "we answer phone calls" and "anyone can inject leads into any contractor's
 * account".
 *
 * The route handler is invoked directly with mocked persistence and providers,
 * so the assertions are about the HANDLER's decisions, not the database's.
 */

const SECRET = "test-webhook-secret";

const resolveContractorForNumber = vi.fn();
const persistCall = vi.fn();
const persistLead = vi.fn();
const recordDispatchEvent = vi.fn();
const dispatchLead = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/portal/persistence", () => ({
  resolveContractorForNumber: (...a: unknown[]) => resolveContractorForNumber(...(a as [])),
  persistCall: (...a: unknown[]) => persistCall(...(a as [])),
  persistLead: (...a: unknown[]) => persistLead(...(a as [])),
  recordDispatchEvent: (...a: unknown[]) => recordDispatchEvent(...(a as [])),
}));

vi.mock("@/lib/dispatch/dispatch-lead", () => ({
  dispatchLead: (...a: unknown[]) => dispatchLead(...(a as [])),
}));

const { POST } = await import("@/app/api/webhooks/call-completed/route");

process.env.RETELL_WEBHOOK_SECRET = SECRET;
process.env.INTEGRATION_MODE = "mock";

const CONTRACTOR_ID = "11111111-1111-4111-8111-111111111111";

/** Builds a request the way Twilio/Retell would. */
function makeRequest(
  payload: unknown,
  { sign = true, secret = SECRET, header = true }: { sign?: boolean; secret?: string; header?: boolean } = {},
) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const headers = new Headers({ "content-type": "application/json" });
  if (header && sign) {
    headers.set(
      "x-retell-signature",
      createHmac("sha256", secret).update(body, "utf8").digest("hex"),
    );
  }
  return new Request("http://localhost/api/webhooks/call-completed", {
    method: "POST",
    headers,
    body,
  }) as never;
}

const qualifiedEvent = (over: Record<string, unknown> = {}) => ({
  externalCallId: "ext_1",
  startedAt: "2026-09-01T10:00:00.000Z",
  endedAt: "2026-09-01T10:02:00.000Z",
  durationSeconds: 120,
  callerNumber: "+15558675309",
  transcript: [
    { role: "agent", content: "HVAC, how can I help?", timestampMs: 0 },
    {
      role: "caller",
      content: "This is Maria Alvarez, my number is 555-867-5309. The furnace is out and it's freezing.",
      timestampMs: 4000,
    },
  ],
  metadata: { trade: "hvac", dialledNumber: "+15550001111" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  resolveContractorForNumber.mockResolvedValue({
    ok: true,
    data: { contractorId: CONTRACTOR_ID, dispatchChannels: ["sms"], number: "+15550001111" },
  });
  persistCall.mockResolvedValue({ ok: true, data: { id: "call-1", created: true } });
  persistLead.mockResolvedValue({ ok: true, data: { id: "lead-1" } });
  dispatchLead.mockResolvedValue([
    { leadId: "lead-1", channel: "sms", delivered: true, attempts: 1, elapsedMs: 800, withinSla: true },
  ]);
});

// ============================================================ signature gate
// This is the whole security model. Everything after it is unreachable without
// a valid signature.

describe("webhook signature verification", () => {
  it("rejects a request with no signature header", async () => {
    const res = await POST(makeRequest(qualifiedEvent(), { header: false }));
    expect(res.status).toBe(401);
    expect(persistCall).not.toHaveBeenCalled();
  });

  it("rejects a signature made with the wrong secret", async () => {
    const res = await POST(makeRequest(qualifiedEvent(), { secret: "wrong" }));
    expect(res.status).toBe(401);
    expect(persistCall).not.toHaveBeenCalled();
  });

  it("rejects a TAMPERED body — the signature covers the exact bytes", async () => {
    // Sign one payload, send a different one. A handler that re-serialised the
    // parsed JSON would produce a matching digest and accept this.
    const signature = createHmac("sha256", SECRET)
      .update(JSON.stringify(qualifiedEvent()), "utf8")
      .digest("hex");

    const tampered = qualifiedEvent({ externalCallId: "ext_injected" });
    const request = new Request("http://localhost/api/webhooks/call-completed", {
      method: "POST",
      headers: { "content-type": "application/json", "x-retell-signature": signature },
      body: JSON.stringify(tampered),
    }) as never;

    expect((await POST(request)).status).toBe(401);
    expect(persistCall).not.toHaveBeenCalled();
  });

  it("refuses everything when the webhook secret is not configured", async () => {
    const prev = process.env.RETELL_WEBHOOK_SECRET;
    delete process.env.RETELL_WEBHOOK_SECRET;
    try {
      const res = await POST(makeRequest(qualifiedEvent()));
      expect(res.status).toBe(503);
    } finally {
      process.env.RETELL_WEBHOOK_SECRET = prev;
    }
  });
});

// =========================================================== input handling
describe("webhook input handling", () => {
  it("rejects invalid JSON with 400", async () => {
    const res = await POST(makeRequest("not json at all"));
    expect(res.status).toBe(400);
  });

  it("returns 501 for a vendor-shaped payload it cannot map", async () => {
    // Better an honest 501 than a guessed field mapping that silently
    // mismatches the real webhook at launch.
    const res = await POST(makeRequest({ event: "call_ended", call_id: "x" }));
    expect(res.status).toBe(501);
    expect(persistCall).not.toHaveBeenCalled();
  });
});

// ====================================================== qualification gates
describe("webhook qualification", () => {
  it("does not dispatch a lead with no caller name", async () => {
    const res = await POST(
      makeRequest(
        qualifiedEvent({
          transcript: [
            { role: "agent", content: "HVAC?", timestampMs: 0 },
            { role: "caller", content: "Furnace is out, 555-867-5309.", timestampMs: 4000 },
          ],
        }),
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "captured_not_qualified", reason: "missing_name" });
    expect(persistLead).not.toHaveBeenCalled();
    expect(dispatchLead).not.toHaveBeenCalled();
  });

  it("rejects a wrong number rather than qualifying it", async () => {
    const res = await POST(
      makeRequest(
        qualifiedEvent({
          transcript: [
            { role: "caller", content: "Oh sorry, wrong number. This is Jim Reiner, 555-867-5309.", timestampMs: 0 },
          ],
        }),
      ),
    );
    const body = await res.json();
    expect(body.reason).toBe("wrong_number");
    expect(dispatchLead).not.toHaveBeenCalled();
  });
});

// =========================================================== happy path
describe("webhook happy path", () => {
  it("persists, then dispatches, and reports real ids", async () => {
    const res = await POST(makeRequest(qualifiedEvent()));

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body).toMatchObject({
      status: "accepted",
      callId: "call-1",
      leadId: "lead-1",
      trade: "hvac",
      tier: "emergency",
      replayed: false,
    });

    // Order matters: a lead must never be dispatched before it is stored.
    const order = [persistCall, persistLead, dispatchLead].map((m) =>
      m.mock.invocationCallOrder[0],
    );
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });

  it("sends the resolved contractor's channels to dispatch", async () => {
    await POST(makeRequest(qualifiedEvent()));
    expect(dispatchLead).toHaveBeenCalledWith(
      expect.objectContaining({ contractorId: CONTRACTOR_ID, channels: ["sms"] }),
    );
  });

  it("returns 202 (not 4xx) when the dialled number is unknown", async () => {
    // The request was valid and authenticated. 4xx would make the vendor
    // treat it as permanently undeliverable; 202 keeps it a no-op.
    resolveContractorForNumber.mockResolvedValue({ ok: false, reason: "unmapped_number" });
    const res = await POST(makeRequest(qualifiedEvent()));
    expect(res.status).toBe(202);
    expect((await res.json()).reason).toBe("unmapped_number");
    expect(dispatchLead).not.toHaveBeenCalled();
  });
});

// ============================================================== idempotency
// Retell retries webhooks. A duplicate call row double-counts a lead in the
// owner's ROI dashboard — the number they are paying for.

describe("webhook idempotency", () => {
  it("marks a replay so the caller knows it was not double-counted", async () => {
    persistCall.mockResolvedValue({ ok: true, data: { id: "call-1", created: false } });
    const res = await POST(makeRequest(qualifiedEvent()));
    expect((await res.json()).replayed).toBe(true);
  });

  it("returns 500 and dispatches nothing when persistence fails", async () => {
    persistCall.mockResolvedValue({ ok: false, reason: "insert_failed", detail: "boom" });
    const res = await POST(makeRequest(qualifiedEvent()));
    expect(res.status).toBe(500);
    // A lead must not be dispatched to a contractor when we failed to store it.
    expect(dispatchLead).not.toHaveBeenCalled();
  });

  it("returns 500 when the lead write fails", async () => {
    persistLead.mockResolvedValue({ ok: false, reason: "insert_failed" });
    const res = await POST(makeRequest(qualifiedEvent()));
    expect(res.status).toBe(500);
    expect(dispatchLead).not.toHaveBeenCalled();
  });
});
