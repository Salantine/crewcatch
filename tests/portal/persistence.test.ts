import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The admin client is stubbed so persistence can be tested without a live
 * Supabase project. What is under test is the CONTRACT: idempotency on
 * conflict, fail-soft error handling, and the shape of the rows written —
 * not Supabase itself.
 */
const from = vi.fn();
const selectResult = vi.fn();
const insertResult = vi.fn();
const maybeSingleResult = vi.fn();
const singleResult = vi.fn();

function buildQuery() {
  const q: Record<string, unknown> = {};
  // Every builder method must return the SAME object — the production code
  // chains .insert().select().single(), so a mock that returns undefined here
  // silently breaks the chain and the test asserts on the wrong call.
  q.select = vi.fn(() => q);
  q.insert = vi.fn((rows: unknown) => {
    insertResult({ rows });
    return q;
  });
  q.eq = vi.fn(() => q);
  q.single = () => {
    singleResult();
    return Promise.resolve(selectResult());
  };
  q.maybeSingle = () => {
    maybeSingleResult();
    return Promise.resolve(selectResult());
  };
  return q;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from }),
}));

const { persistCall, persistLead, recordDispatchEvent, resolveContractorForNumber } =
  await import("@/lib/portal/persistence");
const { CallCompletedEvent } = await import("@/lib/domain/schemas");

const event = CallCompletedEvent.parse({
  externalCallId: "ext_1",
  startedAt: "2026-09-01T10:00:00.000Z",
  endedAt: "2026-09-01T10:02:00.000Z",
  durationSeconds: 120,
  callerNumber: "+15558675309",
  transcript: [{ role: "caller", content: "Furnace is out", timestampMs: 0 }],
  metadata: { trade: "hvac" },
});

beforeEach(() => {
  from.mockReset();
  insertResult.mockReset();
  selectResult.mockReset();
  singleResult.mockReset();
  maybeSingleResult.mockReset();
  from.mockImplementation(() => buildQuery());
});

describe("resolveContractorForNumber", () => {
  it("returns the contractor and channels for a known number", async () => {
    selectResult.mockResolvedValue({
      data: {
        contractor_id: "c-1",
        number: "+15558675309",
        contractors: { dispatch_channels: ["sms", "email"] },
      },
      error: null,
    });

    const result = await resolveContractorForNumber("+15558675309");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.contractorId).toBe("c-1");
    expect(result.data.dispatchChannels).toEqual(["sms", "email"]);
  });

  it("normalises a single-object join result", async () => {
    // Supabase types an inner join on a to-one FK as an array; accept both.
    selectResult.mockResolvedValue({
      data: { contractor_id: "c-1", number: "+1", contractors: [{ dispatch_channels: ["sms"] }] },
      error: null,
    });
    const result = await resolveContractorForNumber("+1");
    expect(result.ok && result.data.dispatchChannels).toEqual(["sms"]);
  });

  it("falls back to sms when the contractor has no channels", async () => {
    selectResult.mockResolvedValue({
      data: { contractor_id: "c-1", number: "+1", contractors: { dispatch_channels: [] } },
      error: null,
    });
    const result = await resolveContractorForNumber("+1");
    expect(result.ok && result.data.dispatchChannels).toEqual(["sms"]);
  });

  it("reports an unmapped number rather than throwing", async () => {
    selectResult.mockResolvedValue({ data: null, error: null });
    const result = await resolveContractorForNumber("+15550000000");
    expect(result).toEqual({ ok: false, reason: "unmapped_number" });
  });

  it("surfaces a query error as a soft failure", async () => {
    selectResult.mockResolvedValue({ data: null, error: { message: "timeout" } });
    const result = await resolveContractorForNumber("+1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("lookup_failed");
    expect(result.detail).toBe("timeout");
  });

  it("never throws, even when the client itself is missing", async () => {
    from.mockImplementation(() => {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    });
    const result = await resolveContractorForNumber("+1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("lookup_threw");
  });
});

describe("persistCall", () => {
  it("inserts a call and returns its id", async () => {
    selectResult.mockResolvedValue({ data: { id: "call-1" }, error: null });
    const result = await persistCall({
      event,
      contractorId: "c-1",
      intent: "emergency",
      urgency: "critical",
      qualified: true,
    });
    expect(result).toEqual({ ok: true, data: { id: "call-1", created: true } });
  });

  it("is idempotent: a unique violation reuses the existing row", async () => {
    // Retell retries webhooks; a duplicate call would double-count the lead.
    selectResult
      .mockResolvedValueOnce({ data: null, error: { code: "23505", message: "duplicate" } })
      .mockResolvedValueOnce({ data: { id: "call-existing" }, error: null });

    const result = await persistCall({
      event,
      contractorId: "c-1",
      intent: "emergency",
      urgency: "critical",
      qualified: true,
    });

    expect(result).toEqual({ ok: true, data: { id: "call-existing", created: false } });
  });

  it("fails soft on a non-unique insert error", async () => {
    selectResult.mockResolvedValue({ data: null, error: { message: "fk violation" } });
    const result = await persistCall({
      event,
      contractorId: "c-1",
      intent: "emergency",
      urgency: "critical",
      qualified: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("insert_failed");
  });
});

describe("persistLead", () => {
  it("writes a nullable address as null rather than undefined", async () => {
    selectResult.mockResolvedValue({ data: { id: "lead-1" }, error: null });
    await persistLead("c-1", "call-1", {
      name: "Ana Ruiz",
      phone: "5558675309",
      intent: "emergency",
      urgency: "critical",
      issue: "No heat",
    });

    const written = insertResult.mock.calls[0][0].rows;
    expect(written.address).toBeNull();
    expect(written.name).toBe("Ana Ruiz");
  });
});

describe("recordDispatchEvent", () => {
  it("stamps dispatched_at so the SLA can be measured", async () => {
    selectResult.mockResolvedValue({ data: { id: "evt-1" }, error: null });
    await recordDispatchEvent({
      contractorId: "c-1",
      leadId: "lead-1",
      channel: "sms",
      accepted: true,
    });
    const written = insertResult.mock.calls[0][0].rows;
    expect(written.dispatched_at).toBeTruthy();
    expect(new Date(written.dispatched_at).toString()).not.toBe("Invalid Date");
  });

  it("records failures too, so a dropped alert is visible", async () => {
    selectResult.mockResolvedValue({ data: { id: "evt-2" }, error: null });
    await recordDispatchEvent({
      contractorId: "c-1",
      leadId: "lead-1",
      channel: "sms",
      accepted: false,
      detail: "failed after 3 attempt(s)",
    });
    expect(insertResult.mock.calls[0][0].rows.accepted).toBe(false);
  });
});
