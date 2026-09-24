import { mockChannels, mockTelephony, mockVoiceAgent, mockWorkflow } from "./mock";
import type { DispatchChannel } from "@/lib/domain/schemas";
import type {
  NotificationChannel,
  TelephonyProvider,
  VoiceAgentProvider,
  WorkflowProvider,
} from "./types";

/**
 * Provider selection.
 *
 * Defaults to `mock` so the app is fully runnable with no credentials. Setting
 * INTEGRATION_MODE=live is refused unless the corresponding credentials are
 * present, so a misconfigured deploy fails loudly at boot instead of silently
 * sending test data to a real contractor's SMS.
 */

export type IntegrationMode = "live" | "mock";

export function integrationMode(): IntegrationMode {
  return process.env.INTEGRATION_MODE === "live" ? "live" : "mock";
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `INTEGRATION_MODE=live requires ${name} to be set. ` +
        `Either provide the credential or run with INTEGRATION_MODE=mock.`,
    );
  }
  return value;
}

let cached:
  | { mode: IntegrationMode; telephony: TelephonyProvider; voice: VoiceAgentProvider; workflow: WorkflowProvider }
  | undefined;

export function getProviders() {
  const mode = integrationMode();

  // Cache per MODE, not unconditionally. An unconditional cache would return
  // the mock set even after INTEGRATION_MODE flipped to live, silently sending
  // test data to a real contractor.
  if (cached && cached.mode === mode) return cached;

  if (mode === "live") {
    // TODO[CRITICAL]: Implement the live adapters and wire them here.
    //
    // This is the single switchover point. Implement each interface in
    // twilio.ts / retell.ts / make.ts, then return them here. No caller
    // changes — the interface is the seam.
    //
    // Required credentials:
    //   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
    //   RETELL_API_KEY, RETELL_AGENT_ID
    //   MAKE_SCENARIO_WEBHOOK_URL
    //
    // Field mapping for inbound webhooks is unverified in this build
    // environment — see lib/integrations/vendor-schemas.ts.
    requireEnv("TWILIO_ACCOUNT_SID");
    requireEnv("RETELL_API_KEY");
    requireEnv("MAKE_SCENARIO_WEBHOOK_URL");
    throw new Error(
      "INTEGRATION_MODE=live but no live providers are implemented yet. " +
        "See TODO[CRITICAL] in src/lib/integrations/index.ts.",
    );
  }

  cached = {
    mode,
    telephony: mockTelephony,
    voice: mockVoiceAgent,
    workflow: mockWorkflow,
  };
  return cached;
}

/**
 * Resolves the notification channel for a dispatch type.
 *
 * Kept as a lookup rather than an index into `mockChannels` so `dispatchLead`
 * never has to know which integration mode is active: in live mode this
 * returns the real Twilio / SMTP / CRM client.
 *
 * Returns null for a channel with no implementation. `dispatchLead` treats
 * that as a permanent failure and does NOT retry it — retrying cannot conjure
 * a missing adapter.
 */
export function getNotificationChannel(
  channel: DispatchChannel,
): NotificationChannel | null {
  if (integrationMode() === "live") {
    // TODO[CRITICAL]: Return the live channel client here.
    //
    //   case "sms":   return new TwilioSmsChannel();
    //   case "email": return new SmtpEmailChannel();
    //   case "crm":   return new CrmWebhookChannel();
    //
    // Required: each must implement NotificationChannel.send() and return a
    // DeliveryReceipt, never throw on a provider error (a throw is treated as
    // a retryable failure by the caller).
    return null;
  }
  return mockChannels.find((c) => c.channel === channel) ?? null;
}

export * from "./types";
export { mockChannels, recordedCalls, clearRecordedCalls } from "./mock";
export { verifyWebhookSignature, signatureFrom } from "./signature";
