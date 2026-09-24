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
 * never has to know which integration mode is active.
 *
 * Returns null for a channel with no live implementation yet (email, CRM).
 * `dispatchLead` treats that as a permanent failure and does NOT retry it —
 * retrying cannot conjure a missing adapter. The consequence is deliberate
 * and visible: a contractor configured for SMS+CRM gets their SMS delivered
 * and a recorded CRM failure, rather than both silently failing.
 */
export async function getNotificationChannel(
  channel: DispatchChannel,
): Promise<NotificationChannel | null> {
  if (integrationMode() === "live") {
    if (channel === "sms") {
      // Imported lazily: twilio-sms is `server-only`, and a static import
      // here would drag that constraint into every consumer of this module,
      // including client-side tests and the mock path.
      const { createTwilioSmsChannel } = await import("./twilio-sms");
      // Construction throws if credentials are missing. That surfaces as a
      // failed dispatch in the portal rather than a silent no-op.
      return createTwilioSmsChannel();
    }
    // TODO[CRITICAL]: Email and CRM adapters.
    //
    //   case "email": return new SmtpEmailChannel();
    //   case "crm":   return new CrmWebhookChannel();
    //
    // Each must implement NotificationChannel.send() and follow the same
    // rule as the SMS channel: return { accepted: false } for permanent
    // failures, throw only for transient ones.
    return null;
  }
  return mockChannels.find((c) => c.channel === channel) ?? null;
}

export * from "./types";
export { mockChannels, recordedCalls, clearRecordedCalls } from "./mock";
export { verifyWebhookSignature, signatureFrom } from "./signature";
