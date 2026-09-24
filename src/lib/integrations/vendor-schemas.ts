import { z } from "zod";

/**
 * INBOUND VENDOR BOUNDARY
 *
 * ⚠ These schemas deliberately do NOT name Twilio or Retell fields.
 *
 * Outbound requests to twilio.com/docs and docs.retellai.com returned HTTP 404
 * from the build environment, so the authoritative payload shapes could not be
 * read. A schema that guessed field names would look production-correct while
 * silently mismatching the real webhook at launch — the exact failure the
 * no-hallucination mandate exists to prevent.
 *
 * What is implemented here is the part that does NOT depend on the vendor:
 *   • passthrough ingestion of an arbitrary JSON body,
 *   • a typed mapper from that body to OUR CallCompletedEvent,
 *   • generic HMAC-SHA256 verification over the raw body.
 *
 * What the operator must complete: the field mapping inside each mapper, taken
 * from the vendor dashboard's "webhook settings → sample payload", which every
 * vendor publishes and which is the authoritative source. See
 * docs/integrations/*.md.
 */

/* ---------------------------------------------------------- inbound payloads */

/**
 * A raw vendor body. We accept the envelope and preserve everything, so nothing
 * is lost before mapping. Strict schemas are added at the mapping boundary once
 * the real field names are confirmed.
 */
export const RawWebhookBody = z.record(z.string(), z.unknown());
export type RawWebhookBody = z.infer<typeof RawWebhookBody>;

/**
 * TODO[CRITICAL]: Confirm the Retell call-ended payload field names.
 *
 * Source of truth: Retell dashboard → your agent → Webhook settings →
 *   "Sample payload" (operator-supplied; docs.retellai.com unreachable from
 *   the build environment — DO NOT GUESS THESE FIELDS).
 *
 * Required from the payload to build a CallCompletedEvent:
 *   - call identifier
 *   - start timestamp, end timestamp, duration
 *   - transcript messages[] (each: role, content, timestamp)
 *   - call metadata / custom variables
 *
 * Signature: verify HMAC-SHA256 over the RAW request body BEFORE JSON.parse;
 * the header name is read from RETELL_SIGNATURE_HEADER. Confirm the header name
 * and any `sha256=` prefix format against the dashboard — currently unverified.
 */
export const RetellCallEndedPayload = RawWebhookBody;

/**
 * TODO[CRITICAL]: Confirm the Twilio call-status callback field names.
 *
 * Source of truth: Twilio console → your number → Voice → Call Recording
 *   settings, or the "a call completed" webhook log on a real number.
 *
 * Required from the payload:
 *   - call identifier, call status, call duration
 *   - caller number, dialled number
 *   - recording URL (if recordings are enabled)
 *
 * Signature: Twilio signs with HMAC-SHA1 of (url + sorted POST params) and
 * sends it in a custom header; the exact header name must be confirmed.
 */
export const TwilioStatusCallbackPayload = RawWebhookBody;

/* ------------------------------------------------------------- outbound docs */

/**
 * TODO[CRITICAL]: Document the Make.com scenario contract.
 *
 * CrewCatch should notify a Make scenario which then fans out to SMS / email /
 * CRM. Define and document the POST body CrewCatch sends so the scenario can
 * be built against it. Recommended shape (validate once agreed):
 *
 *   {
 *     "event": "lead.captured",
 *     "contractorId": "<uuid>",
 *     "lead": { "id", "name", "phone", "address", "urgency", "intent", "issue" },
 *     "occurredAt": "<iso8601>"
 *   }
 *
 * Response: Make returns 2xx on receipt; any non-2xx must be retried with
 * backoff and surfaced in the portal rather than silently dropped.
 */
export const MakeDispatchPayload = z.object({
  event: z.literal("lead.captured"),
  contractorId: z.uuid(),
  lead: z.object({
    id: z.uuid(),
    name: z.string(),
    phone: z.string(),
    address: z.string().optional(),
    urgency: z.string(),
    intent: z.string(),
    issue: z.string(),
  }),
  occurredAt: z.iso.datetime(),
});
export type MakeDispatchPayload = z.infer<typeof MakeDispatchPayload>;
