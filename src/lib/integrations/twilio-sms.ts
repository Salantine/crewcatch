import "server-only";
import twilio, { type Twilio } from "twilio";
import type {
  DeliveryReceipt,
  DispatchNotification,
} from "@/lib/domain/schemas";
import type { NotificationChannel } from "./types";

/**
 * Twilio SMS dispatch channel.
 *
 * The single most important rule here: **this must never throw.**
 * `dispatchLead` treats a thrown error as retryable, so a permanent failure
 * (malformed number, blocked sender) would burn all three attempts and delay
 * the other channels. Permanent rejections return
 * `{ accepted: false, detail }`; only genuinely transient conditions are
 * allowed to throw so the retry loop engages.
 *
 * The distinction matters at 2am for a burst main with no heat: retrying an
 * invalid number three times helps nobody, and the customer is waiting.
 */

/** Twilio error codes that will never succeed on retry. */
const PERMANENT_CODES = new Set([
  21211, // to number is not a valid phone number
  21214, // 'To' not a valid phone number
  21606, // from number not owned / not SMS capable
  21610, // not authorized to send from this number
  21612, // number not SMS capable
  21614, // not a mobile number
  21217, // invalid From number
  21617, // message too long even after segmentation
]);

/** Codes worth one more attempt. */
const TRANSIENT_CODES = new Set([
  20429, // rate limited
  20003, // auth — likely rotated mid-flight
]);

export interface TwilioSmsOptions {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  /** Injected for tests; defaults to a real Twilio client. */
  client?: Twilio;
}

function classify(code: unknown): "permanent" | "transient" | "unknown" {
  const n = typeof code === "number" ? code : Number(code);
  if (PERMANENT_CODES.has(n)) return "permanent";
  if (TRANSIENT_CODES.has(n)) return "transient";
  return "unknown";
}

/** Normalises a captured number to E.164 for the `To` parameter. */
function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

/**
 * Twilio segments at 160 characters for GSM-7. A lead dispatch packs name,
 * callback, address and issue into one body, so exceeding that is normal,
 * not exceptional — Twilio will segment, but it costs multiple messages and
 * a long address can push a contractor past their plan.
 */
export function segmentCount(body: string): number {
  const gsm7 = /^[\x20-\x7E\n\r\t@£$¥èéùìòÇØøÅå]*$/.test(body);
  const limit = gsm7 ? 160 : 153; // UCS-2
  return Math.max(1, Math.ceil([...body].length / limit));
}

export class TwilioSmsChannel implements NotificationChannel {
  readonly channel = "sms" as const;
  private readonly client: Twilio;
  private readonly from: string;

  constructor(options: TwilioSmsOptions) {
    if (!options.fromNumber) {
      // Validated here rather than at send time. A missing from-number would
      // otherwise produce an identical Twilio error for every lead, all night.
      throw new Error(
        "TWILIO_FROM_NUMBER is required for SMS dispatch. Without it every send fails.",
      );
    }
    this.client =
      options.client ??
      twilio(options.accountSid, options.authToken, {
        // Never throw on a non-2xx; we inspect the error ourselves.
        autoRetry: false,
        lazyLoading: true,
      });
    this.from = options.fromNumber;
  }

  async send(notification: DispatchNotification): Promise<DeliveryReceipt> {
    let to: string;
    try {
      to = toE164(notification.recipient);
    } catch {
      return {
        channel: "sms",
        accepted: false,
        detail: "unparseable recipient number",
      };
    }

    if (to.length < 11) {
      return {
        channel: "sms",
        accepted: false,
        detail: "recipient is not a usable phone number",
      };
    }

    try {
      const message = await this.client.messages.create({
        to,
        from: this.from,
        body: notification.body,
      });

      return {
        channel: "sms",
        accepted: true,
        providerMessageId: message.sid,
      };
    } catch (err) {
      const code = (err as { code?: number })?.code;
      const status = (err as { status?: number })?.status;
      const kind = classify(code);
      const messageText = err instanceof Error ? err.message : String(err);

      // Network-level failure (no HTTP status) is transient by nature.
      const isTransient =
        kind === "transient" || (kind === "unknown" && !status);

      if (isTransient) {
        // Rethrow so dispatchLead's bounded retry can try again.
        throw err;
      }

      return {
        channel: "sms",
        accepted: false,
        detail: `twilio ${code ?? "error"}: ${messageText}`,
      };
    }
  }
}

/** Factory used by getNotificationChannel. Throws if credentials are absent. */
export function createTwilioSmsChannel(): NotificationChannel {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error(
      "SMS dispatch requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER. " +
        "Without them the contractor would silently receive nothing.",
    );
  }

  return new TwilioSmsChannel({ accountSid, authToken, fromNumber });
}
