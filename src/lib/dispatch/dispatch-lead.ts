import "server-only";
import {
  type DispatchChannel,
  type DispatchNotification,
  type Lead,
} from "@/lib/domain/schemas";
import { recordDispatchEvent } from "@/lib/portal/persistence";
import { getNotificationChannel, getProviders } from "@/lib/integrations";

/**
 * Lead dispatch — the 30-second promise.
 *
 * Two constraints shape this design:
 *
 *  1. The product promises a dispatch within 30 seconds of hangup. An
 *     unbounded retry loop breaches that promise *silently* — the call looks
 *     successful while the contractor never hears about it. Retries are
 *     therefore BOUNDED, and elapsed time is measured against the SLA.
 *  2. A failed send must be visible. Every attempt is recorded in
 *     dispatch_events, so a broken integration shows up in the portal instead
 *     of quietly costing the customer a job.
 */

/** Total attempts per channel, including the first. */
export const MAX_ATTEMPTS = 3;
/** Backoff in ms. Sum plus send time must stay well inside the SLA. */
export const BACKOFF_MS = [1_000, 4_000];
/** The advertised dispatch promise. */
export const SLA_MS = 30_000;

export interface DispatchResult {
  leadId: string;
  channel: DispatchChannel;
  delivered: boolean;
  attempts: number;
  elapsedMs: number;
  withinSla: boolean;
  detail?: string;
}

export interface DispatchInput {
  contractorId: string;
  lead: Lead;
  channels: DispatchChannel[];
  /** Injectable for tests; defaults to real time. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Jitter prevents a thundering herd when several leads fail at once. */
function jitter(base: number): number {
  return base + Math.floor(Math.random() * Math.max(250, base * 0.25));
}

export function buildMessage(lead: Lead): string {
  return [
    `[${lead.urgency.toUpperCase()}] ${lead.intent.toUpperCase()}`,
    `Name: ${lead.name}`,
    `Callback: ${lead.phone}`,
    lead.address ? `Address: ${lead.address}` : null,
    `Issue: ${lead.issue}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

/**
 * Dispatches one lead across the contractor's configured channels.
 *
 * Channels are independent: an SMS failure does not prevent the email
 * attempt. Each returns its own result so partial delivery is reported
 * honestly rather than collapsed into one all-or-nothing status.
 */
export async function dispatchLead(input: DispatchInput): Promise<DispatchResult[]> {
  const { contractorId, lead, channels } = input;
  const now = input.now ?? Date.now;
  const sleep = input.sleep ?? defaultSleep;
  const body = buildMessage(lead);
  const startedAt = now();

  // The workflow layer fans out to Make/CRM. A failure there is logged but
  // does not block direct channel delivery — those are independent paths.
  try {
    const { workflow } = getProviders();
    await workflow.dispatchLead(lead, channels);
  } catch (err) {
    console.error(
      `[dispatch] workflow fan-out failed for lead ${lead.id}:`,
      err instanceof Error ? err.message : err,
    );
  }

  return Promise.all(
    channels.map(async (channel) => {
      const channelStarted = now();
      let attempts = 0;
      let lastDetail: string | undefined;
      let delivered = false;

      const notification: DispatchNotification = {
        leadId: lead.id,
        channel,
        recipient: lead.phone,
        body,
      };

      while (attempts < MAX_ATTEMPTS) {
        attempts += 1;
        try {
          const sender = getNotificationChannel(channel);
          if (!sender) {
            lastDetail = `no channel implementation for "${channel}"`;
            break; // Retrying cannot fix a missing implementation.
          }
          const receipt = await sender.send(notification);
          if (receipt.accepted) {
            delivered = true;
            lastDetail = receipt.providerMessageId;
            break;
          }
          lastDetail = receipt.detail ?? "channel returned not-accepted";
        } catch (err) {
          lastDetail = err instanceof Error ? err.message : String(err);
        }

        if (attempts < MAX_ATTEMPTS) {
          await sleep(jitter(BACKOFF_MS[attempts - 1] ?? 1_000));
        }
      }

      const elapsedMs = now() - channelStarted;
      const overallElapsed = now() - startedAt;
      const withinSla = overallElapsed <= SLA_MS;

      await recordDispatchEvent({
        contractorId,
        leadId: lead.id,
        channel,
        accepted: delivered,
        detail: delivered
          ? `delivered in ${attempts} attempt(s)`
          : `failed after ${attempts} attempt(s): ${lastDetail ?? "unknown"}`,
        dispatchedAt: new Date(channelStarted).toISOString(),
      });

      if (!withinSla) {
        console.warn(
          `[dispatch] lead ${lead.id} took ${overallElapsed}ms — past the ${SLA_MS}ms promise.`,
        );
      }

      return {
        leadId: lead.id,
        channel,
        delivered,
        attempts,
        elapsedMs,
        withinSla,
        detail: lastDetail,
      };
    }),
  );
}
