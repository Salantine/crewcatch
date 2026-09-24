import {
  CallCompletedEvent,
  type CallIntent,
  type Lead,
  type TranscriptMessage,
  type UrgencyLevel,
} from "./schemas";
import { classifyCall } from "./qualification";
import { z } from "zod";

/**
 * Extracts a structured lead from a completed call.
 *
 * The critical rule: a lead missing a name or callback number is NOT returned
 * as a partial lead. The portal shows a captured call with a clear "not
 * qualified" state instead. A half-lead rendered as a complete one is worse
 * than no lead — the owner calls back a number that was never captured and
 * loses the trust the product is selling.
 */

export type ExtractionResult =
  | { ok: true; lead: Omit<Lead, "id" | "contractorId" | "capturedAt"> }
  | { ok: false; reason: ExtractionFailure };

export type ExtractionFailure =
  | "no_transcript"
  | "missing_name"
  | "missing_phone"
  | "wrong_number"
  | "empty_caller_speech";

/* A callback number is 10+ digits once punctuation and country code are stripped. */
const PHONE_CANDIDATE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

const NAME_PATTERNS = [
  /\b(?:my name is|this is|name's|it's|i'm|im)\s+([a-z][a-z'’-]{1,20}(?:\s+[a-z][a-z'’-]{1,20})?)/i,
  /\b(?:thanks,? thanks for calling,? this is)\s+([a-z][a-z'’-]{1,20}(?:\s+[a-z][a-z'’-]{1,20})?)/i,
];

/** Rejects the agent's own phrases being mistaken for a caller name. */
const NOT_NAMES = new Set([
  "nobody", "no one", "a name", "the owner", "someone", "somebody",
  "you", "we", "i", "calling", "looking", "trying", "wondering", "sorry",
  "here", "there", "help", "quick", "good", "fine", "okay", "yes", "no",
]);

function extractPhone(text: string): string | undefined {
  const found = text.match(PHONE_CANDIDATE);
  if (!found || found.length === 0) return undefined;
  // Prefer the last-stated number: callers often correct themselves
  // ("that's 555... no, 556...").
  return found[found.length - 1].replace(/\D/g, "");
}

function extractName(text: string): string | undefined {
  for (const pattern of NAME_PATTERNS) {
    const m = text.match(pattern);
    const candidate = m?.[1]?.trim();
    if (!candidate) continue;
    const first = candidate.split(/\s+/)[0].toLowerCase();
    if (NOT_NAMES.has(first)) continue;
    // A name is a name, not a sentence fragment.
    if (candidate.split(/\s+/).length > 3) continue;
    return candidate.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return undefined;
}

const ADDRESS_CUE =
  /\b(?:address is|i'm at|located at|sit is at|property is at|we're at)\s+(.{5,80}?)(?:[.,;]|$|\s+in\s)/i;

function extractAddress(text: string): string | undefined {
  const m = text.match(ADDRESS_CUE);
  const value = m?.[1]?.trim();
  return value ? value.replace(/\b\w/g, (c) => c.toUpperCase()) : undefined;
}

const ISSUE_CUE =
  /\b(?:it(?:'s| is)|the (?:unit|system|pipe|slab|fence)|my \w+)\s+(.+?)(?:[.?!]|$)/i;

function extractIssue(text: string): string | undefined {
  const m = text.match(ISSUE_CUE);
  const value = m?.[1]?.trim();
  if (!value || value.length < 3) return undefined;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export interface ExtractOptions {
  /** Overrides the keyword classifier when the voice agent already classified. */
  intent?: CallIntent;
  urgency?: UrgencyLevel;
  trade: Parameters<typeof classifyCall>[1];
}

export function extractLead(
  event: CallCompletedEvent,
  options: ExtractOptions,
): ExtractionResult {
  const callerTurns = event.transcript.filter((m) => m.role === "caller");
  const callerText = callerTurns.map((m) => m.content).join(" ").trim();

  if (event.transcript.length === 0) return { ok: false, reason: "no_transcript" };
  if (callerText.length === 0)
    return { ok: false, reason: "empty_caller_speech" };

  const classified = classifyCall(event.transcript, options.trade);
  const intent = options.intent ?? classified.intent;
  const urgency = options.urgency ?? classified.urgency;

  if (intent === "wrong_number")
    return { ok: false, reason: "wrong_number" };

  const name = extractName(callerText);
  if (!name) return { ok: false, reason: "missing_name" };

  const phone = extractPhone(callerText);
  if (!phone || phone.length < 10)
    return { ok: false, reason: "missing_phone" };

  return {
    ok: true,
    lead: {
      callId: "", // assigned by the persistence layer
      name,
      phone,
      address: extractAddress(callerText),
      intent,
      urgency,
      issue: extractIssue(callerText) ?? "Not specified",
    },
  };
}

/** Runtime-validates a completed call before it reaches any downstream stage. */
export function parseCallCompleted(raw: unknown) {
  return CallCompletedEvent.safeParse(raw);
}

/** Narrow helper used by route handlers. */
export const RawEvent = z.record(z.string(), z.unknown());
export type RawEvent = z.infer<typeof RawEvent>;

export type { TranscriptMessage };
