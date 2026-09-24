import { randomUUID } from "node:crypto";
import { renderPrompt } from "@/lib/domain/prompt-render";
import {
  CallCompletedEvent,
  type CallCompletedEvent as CallCompleted,
  type DeliveryReceipt,
  type DispatchChannel,
  type Lead,
  type PhoneNumber,
} from "@/lib/domain/schemas";
import type {
  NotificationChannel,
  RecordedCall,
  TelephonyProvider,
  VoiceAgentProvider,
  WorkflowProvider,
} from "./types";

/**
 * Deterministic mock providers.
 *
 * Determinism matters: seeded by external call id, the same call always yields
 * the same agent id, so screenshots, tests, and sales demos are reproducible.
 * Every call is appended to an in-memory log that doubles as documentation of
 * exactly what the live provider would have received.
 */

const log: RecordedCall[] = [];

function record(provider: string, payload: unknown) {
  log.push({ provider, at: new Date().toISOString(), payload });
}

export function recordedCalls(): readonly RecordedCall[] {
  return log;
}

export function clearRecordedCalls() {
  log.length = 0;
}

/** FNV-1a — small, stable across runs, and not a security primitive. */
function seedFrom(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export const mockTelephony: TelephonyProvider = {
  name: "mock-telephony",
  async provisionNumber({ region, label }) {
    // +1555 01xx xxxx is the North American fictional-number block: it cannot
    // reach a real person, which makes it the correct choice for a demo.
    const digits = String(seedFrom(`${region}:${label}`) % 10000000).padStart(7, "0");
    const number: PhoneNumber = {
      id: randomUUID(),
      contractorId: randomUUID(),
      number: `+155501${digits}`,
      regionLabel: region,
      active: true,
    };
    record("mock-telephony", { action: "provisionNumber", region, label, number });
    return number;
  },
  async getCallStatus(externalCallId) {
    const seed = seedFrom(externalCallId);
    const status = seed % 20 === 0 ? "busy" : "completed";
    const result = { status, durationSeconds: 30 + (seed % 300) } as const;
    record("mock-telephony", { action: "getCallStatus", externalCallId, result });
    return result;
  },
};

export const mockVoiceAgent: VoiceAgentProvider = {
  name: "mock-voice-agent",
  async createAgent(profile) {
    const agentId = `agt_mock_${seedFrom(profile.businessName + profile.trade).toString(16)}`;
    const rendered = renderPrompt(profile, profile.trade);
    record("mock-voice-agent", { action: "createAgent", agentId, prompt: rendered.system });
    return { agentId };
  },
  async updateAgent(agentId, profile) {
    const rendered = renderPrompt(profile, profile.trade);
    record("mock-voice-agent", { action: "updateAgent", agentId, prompt: rendered.system });
  },
  async getCallTranscript(externalCallId) {
    // Synthetic but schema-valid: the same external id always yields the same
    // transcript, so tests and demos are stable.
    const seed = seedFrom(externalCallId);
    const firstNames = ["Maria", "Dale", "Ana", "Sam", "Nina", "Theo", "Rita", "Cole"];
    const lastNames = ["Alvarez", "Kovac", "Ruiz", "Ortiz", "Park", "Nguyen", "Silva", "Brooks"];
    const first = firstNames[seed % firstNames.length];
    const last = lastNames[Math.floor(seed / 8) % lastNames.length];
    const line = `555${String(2000000 + (seed % 9999999)).slice(0, 7)}`;

    const event = CallCompletedEvent.parse({
      externalCallId,
      startedAt: new Date(0).toISOString(),
      endedAt: new Date(120_000).toISOString(),
      durationSeconds: 120,
      callerNumber: `+1${line}`,
      transcript: [
        { role: "agent", content: "Thanks for calling, how can I help?", timestampMs: 0 },
        { role: "caller", content: `This is ${first} ${last}, my number is ${line}.`, timestampMs: 4_000 },
        { role: "agent", content: "Got it. What's the issue?", timestampMs: 8_000 },
        { role: "caller", content: "The furnace is out and it's freezing.", timestampMs: 12_000 },
        { role: "agent", content: "Is there a gas smell or any water leak?", timestampMs: 16_000 },
        { role: "caller", content: "No gas smell, no water.", timestampMs: 20_000 },
        { role: "agent", content: "We'll have a technician call you back shortly.", timestampMs: 24_000 },
      ],
      metadata: { trade: "hvac" },
    }) satisfies CallCompleted;

    record("mock-voice-agent", { action: "getCallTranscript", externalCallId });
    return event;
  },
};

export const mockWorkflow: WorkflowProvider = {
  name: "mock-workflow",
  async dispatchLead(lead, channels) {
    const receipts: DeliveryReceipt[] = channels.map((channel) => {
      const receipt: DeliveryReceipt = {
        channel,
        accepted: true,
        providerMessageId: `msg_${seedFrom(lead.id + channel).toString(16)}`,
      };
      record("mock-workflow", { action: "dispatchLead", channel, lead, receipt });
      return receipt;
    });
    return receipts;
  },
};

export const mockNotification = (channel: DispatchChannel): NotificationChannel => ({
  channel,
  async send(notification) {
    const receipt: DeliveryReceipt = {
      channel,
      accepted: true,
      providerMessageId: `ntf_${seedFrom(notification.leadId + channel).toString(16)}`,
    };
    record(`mock-notification:${channel}`, { action: "send", notification, receipt });
    return receipt;
  },
});

/** Scripts a full call scenario end-to-end so the chain is demonstrable
 *  without a Twilio/Retell/Make account. */
export const mockChannels: NotificationChannel[] = [
  mockNotification("sms"),
  mockNotification("email"),
];

/** Type re-export so callers can build a Lead without importing schemas. */
export type { Lead };
