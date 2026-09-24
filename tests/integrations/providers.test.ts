import { beforeEach, describe, expect, it } from "vitest";
import {
  clearRecordedCalls,
  mockTelephony,
  mockVoiceAgent,
  mockWorkflow,
  recordedCalls,
} from "@/lib/integrations/mock";
import { getProviders, integrationMode } from "@/lib/integrations";
import { Lead, PromptProfile } from "@/lib/domain/schemas";
import { extractLead } from "@/lib/domain/lead-extraction";

const profile = PromptProfile.parse({
  id: "11111111-1111-4111-8111-111111111111",
  contractorId: "22222222-2222-4222-8222-222222222222",
  trade: "hvac",
  businessName: "Northern Mechanical",
  greeting: "Northern Mechanical, how can I help?",
  objections: { "speak to the owner": "He's out on a call, I'll take your details." },
  afterHoursOnly: true,
  updatedAt: "2026-09-01T00:00:00.000Z",
});

beforeEach(() => clearRecordedCalls());

describe("mockVoiceAgent", () => {
  it("is deterministic for a given call id", async () => {
    const a = await mockVoiceAgent.getCallTranscript("ext_stable_1");
    const b = await mockVoiceAgent.getCallTranscript("ext_stable_1");
    expect(a).toEqual(b);
  });

  it("produces different transcripts for different calls", async () => {
    const a = await mockVoiceAgent.getCallTranscript("ext_a");
    const b = await mockVoiceAgent.getCallTranscript("ext_b");
    expect(a.callerNumber).not.toBe(b.callerNumber);
  });

  it("returns a transcript that yields a complete lead", async () => {
    const event = await mockVoiceAgent.getCallTranscript("ext_stable_1");
    const result = extractLead(event, { trade: "hvac" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lead.phone).toMatch(/^\d{10,11}$/);
    expect(result.lead.urgency).toBe("critical");
  });

  it("generates an agent id seeded by business name, not random", async () => {
    const a = await mockVoiceAgent.createAgent(profile);
    const b = await mockVoiceAgent.createAgent(profile);
    expect(a.agentId).toBe(b.agentId);
  });

  it("records what it would have sent to the real provider", async () => {
    await mockVoiceAgent.createAgent(profile);
    const calls = recordedCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].provider).toBe("mock-voice-agent");
    expect(calls[0].payload).toMatchObject({ action: "createAgent" });
  });
});

describe("mockWorkflow", () => {
  it("returns a receipt per channel", async () => {
    const lead = Lead.parse({
      id: "33333333-3333-4333-8333-333333333333",
      contractorId: "22222222-2222-4222-8222-222222222222",
      callId: "44444444-4444-4444-8444-444444444444",
      name: "Ana Ruiz",
      phone: "5558675309",
      intent: "emergency",
      urgency: "critical",
      issue: "No heat",
      capturedAt: "2026-09-01T00:00:00.000Z",
    });

    const receipts = await mockWorkflow.dispatchLead(lead, ["sms", "email"]);
    expect(receipts).toHaveLength(2);
    expect(receipts.every((r) => r.accepted)).toBe(true);
    expect(receipts.map((r) => r.channel)).toEqual(["sms", "email"]);
  });
});

describe("mockTelephony", () => {
  it("provisions a number in the fictional +1555 block", async () => {
    const number = await mockTelephony.provisionNumber({ region: "US-CO", label: "Denver" });
    expect(number.number).toMatch(/^\+155501\d{7}$/);
  });

  it("is deterministic for a given region", async () => {
    const a = await mockTelephony.provisionNumber({ region: "US-CO", label: "Denver" });
    const b = await mockTelephony.provisionNumber({ region: "US-CO", label: "Denver" });
    expect(a.number).toBe(b.number);
  });
});

describe("getProviders", () => {
  it("defaults to mock mode with no credentials", () => {
    expect(integrationMode()).toBe("mock");
    const p = getProviders();
    expect(p.telephony.name).toBe("mock-telephony");
  });

  it("refuses to start in live mode without credentials", () => {
    const prev = process.env.INTEGRATION_MODE;
    process.env.INTEGRATION_MODE = "live";
    delete process.env.TWILIO_ACCOUNT_SID;
    try {
      expect(() => getProviders()).toThrowError(/TWILIO_ACCOUNT_SID/);
    } finally {
      process.env.INTEGRATION_MODE = prev;
    }
  });
});
