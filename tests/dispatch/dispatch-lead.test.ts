import { beforeEach, describe, expect, it, vi } from "vitest";

// The dispatch module imports `server-only` and the Supabase admin client.
// Both are stubbed so the retry/timeout logic can be tested in isolation —
// what matters here is the bounded-retry contract and the SLA measurement.
vi.mock("server-only", () => ({}));

const recordDispatchEvent = vi.fn(async () => ({ ok: true, data: { id: "evt_1" } }));
vi.mock("@/lib/portal/persistence", () => ({
  recordDispatchEvent: (...args: unknown[]) => recordDispatchEvent(...(args as [])),
}));

const workflowDispatchLead = vi.fn(async () => []);
const channelSenders = new Map<string, (n: unknown) => Promise<unknown>>();
vi.mock("@/lib/integrations", () => ({
  getProviders: () => ({ workflow: { dispatchLead: workflowDispatchLead } }),
  getNotificationChannel: (channel: string) => {
    const sender = channelSenders.get(channel);
    return sender ? { channel, send: sender } : null;
  },
}));

const { dispatchLead, buildMessage, MAX_ATTEMPTS, SLA_MS } = await import(
  "@/lib/dispatch/dispatch-lead"
);
const { Lead } = await import("@/lib/domain/schemas");

const lead = Lead.parse({
  id: "33333333-3333-4333-8333-333333333333",
  contractorId: "22222222-2222-4222-8222-222222222222",
  callId: "44444444-4444-4444-8444-444444444444",
  name: "Ana Ruiz",
  phone: "5558675309",
  address: "12 Elm St",
  intent: "emergency",
  urgency: "critical",
  issue: "No heat",
  capturedAt: "2026-09-01T00:00:00.000Z",
});

beforeEach(() => {
  recordDispatchEvent.mockClear();
  workflowDispatchLead.mockClear();
  channelSenders.clear();
});

const accept = () => ({ accepted: true, providerMessageId: "msg_1" });
const reject = (detail = "provider 503") => ({ accepted: false, detail });

describe("buildMessage", () => {
  it("carries the fields a contractor acts on", () => {
    const msg = buildMessage(lead);
    expect(msg).toContain("Ana Ruiz");
    expect(msg).toContain("5558675309");
    expect(msg).toContain("12 Elm St");
    expect(msg).toContain("No heat");
    expect(msg).toContain("CRITICAL");
  });

  it("omits the address line when there is no address", () => {
    const noAddress = { ...lead, address: undefined };
    expect(buildMessage(noAddress)).not.toContain("Address:");
  });
});

describe("dispatchLead", () => {
  it("delivers on the first successful attempt", async () => {
    channelSenders.set("sms", async () => accept());

    const [result] = await dispatchLead({
      contractorId: lead.contractorId,
      lead,
      channels: ["sms"],
      sleep: async () => {},
    });

    expect(result.delivered).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.withinSla).toBe(true);
    expect(recordDispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "sms", accepted: true }),
    );
  });

  it("retries a rejected send and succeeds on a later attempt", async () => {
    let calls = 0;
    channelSenders.set("sms", async () => {
      calls += 1;
      return calls < 3 ? reject() : accept();
    });

    const [result] = await dispatchLead({
      contractorId: lead.contractorId,
      lead,
      channels: ["sms"],
      sleep: async () => {},
    });

    expect(result.delivered).toBe(true);
    expect(result.attempts).toBe(3);
    expect(calls).toBe(3);
  });

  it("gives up after MAX_ATTEMPTS rather than retrying forever", async () => {
    let calls = 0;
    channelSenders.set("sms", async () => {
      calls += 1;
      return reject();
    });

    const [result] = await dispatchLead({
      contractorId: lead.contractorId,
      lead,
      channels: ["sms"],
      sleep: async () => {},
    });

    expect(result.delivered).toBe(false);
    expect(calls).toBe(MAX_ATTEMPTS);
    expect(result.detail).toContain("503");
  });

  it("retries a thrown provider error", async () => {
    let calls = 0;
    channelSenders.set("sms", async () => {
      calls += 1;
      if (calls < 2) throw new Error("socket hang up");
      return accept();
    });

    const [result] = await dispatchLead({
      contractorId: lead.contractorId,
      lead,
      channels: ["sms"],
      sleep: async () => {},
    });

    expect(result.delivered).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it("does not retry a channel with no implementation", async () => {
    const [result] = await dispatchLead({
      contractorId: lead.contractorId,
      lead,
      channels: ["crm"],
      sleep: async () => {},
    });

    expect(result.delivered).toBe(false);
    // Retrying cannot conjure a missing adapter, so it fails immediately.
    expect(result.attempts).toBe(1);
  });

  it("records a failure event so the drop is visible in the portal", async () => {
    channelSenders.set("sms", async () => reject());

    await dispatchLead({
      contractorId: lead.contractorId,
      lead,
      channels: ["sms"],
      sleep: async () => {},
    });

    expect(recordDispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "sms",
        accepted: false,
        detail: expect.stringContaining("failed after"),
      }),
    );
  });

  it("treats channels independently — one failure does not block another", async () => {
    channelSenders.set("sms", async () => reject());
    channelSenders.set("email", async () => accept());

    const results = await dispatchLead({
      contractorId: lead.contractorId,
      lead,
      channels: ["sms", "email"],
      sleep: async () => {},
    });

    const byChannel = Object.fromEntries(results.map((r) => [r.channel, r.delivered]));
    expect(byChannel.sms).toBe(false);
    expect(byChannel.email).toBe(true);
  });

  it("flags a dispatch that breaches the advertised SLA", async () => {
    let clock = 0;
    // A slow provider, not a slow retry: the send itself blows the budget.
    channelSenders.set("sms", async () => {
      clock += 45_000;
      return accept();
    });

    const [result] = await dispatchLead({
      contractorId: lead.contractorId,
      lead,
      channels: ["sms"],
      now: () => clock,
      sleep: async () => {},
    });

    expect(result.withinSla).toBe(false);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(SLA_MS);
  });

  it("does not flag a fast dispatch as an SLA breach", async () => {
    let clock = 0;
    channelSenders.set("sms", async () => {
      clock += 900;
      return accept();
    });

    const [result] = await dispatchLead({
      contractorId: lead.contractorId,
      lead,
      channels: ["sms"],
      now: () => clock,
      sleep: async () => {},
    });

    expect(result.withinSla).toBe(true);
  });

  it("survives a workflow fan-out failure without blocking channels", async () => {
    workflowDispatchLead.mockRejectedValueOnce(new Error("make.com unreachable"));
    channelSenders.set("sms", async () => accept());

    const [result] = await dispatchLead({
      contractorId: lead.contractorId,
      lead,
      channels: ["sms"],
      sleep: async () => {},
    });

    expect(result.delivered).toBe(true);
  });
});
