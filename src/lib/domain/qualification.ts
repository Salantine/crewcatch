import {
  type CallIntent,
  type ContractorTier,
  type Trade,
  type TranscriptMessage,
  type UrgencyLevel,
  TRADE_TIER,
} from "./schemas";

/**
 * Turns a transcript into intent + urgency. Deterministic keyword scoring rather
 * than a model call: this runs on every completed call, it must be fast and
 * testable, and the inputs are short enough that keywords are sufficient. The
 * voice agent's own classification (from Retell) takes precedence when present.
 */

/**
 * Callers contract everything — "it's freezing", not "it is freezing". Matching
 * raw text against an uncontracted term list silently misses the most urgent
 * phrases, so text is normalized to its uncontracted form before matching.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const EMERGENCY_TERMS = [
  "no heat", "not heating", "no air", "not cooling", "furnace is down",
  "furnace is out", "ac is out", "a/c is out", "unit is out", "boiler is out",
  "burst pipe", "leaking", "flood", "flooding", "water is leaking",
  "no water", "gas smell", "smell gas", "sparks", "sparking", "power outage",
  "no power", "sewage backup", "sewage", "carbon monoxide", "pilot light",
  "it is freezing", "its freezing", "freezing", "emergency", "right now",
  "asap", "as soon as possible", "no pressure", "pump failed",
];

const ESTIMATE_TERMS = [
  "estimate", "quote", "pricing", "cost", "how much", "ballpark",
  "looking to have", "want to install", "replace", "new unit",
  "remodel", "renovation", "design", "consultation", "site visit",
];

const MAINTENANCE_TERMS = [
  "every month", "monthly", "weekly", "regularly", "routine", "maintenance",
  "schedule", "recurring", "always come out", "each time", "annual",
];

/* Terms are written in NORMALIZED form (lowercase, punctuation stripped) so
 * they can actually match after `normalize()` runs. */
const WRONG_NUMBER_TERMS = [
  "wrong number", "mistaken number", "sorry wrong", "who is this",
  "what number did you call", "you have the wrong",
];

/** Tiers where the trade itself implies a safety or property risk. */
const EMERGENCY_TRADES: Trade[] = ["hvac", "plumbing", "electrical"];

export interface Classification {
  intent: CallIntent;
  urgency: UrgencyLevel;
  /** Terms that drove the decision — surfaced in the portal for auditability. */
  matchedTerms: string[];
}

function matches(text: string, terms: string[]): string[] {
  return terms.filter((t) => text.includes(t));
}

export function classifyCall(
  transcript: TranscriptMessage[],
  trade: Trade,
): Classification {
  const callerText = normalize(
    transcript
      .filter((m) => m.role === "caller")
      .map((m) => m.content)
      .join(" "),
  );

  const matched: string[] = [];

  if (callerText.trim() === "") {
    // An empty transcript cannot be qualified. Reporting it as "normal /
    // consultation" would present noise as a captured lead.
    return { intent: "consultation", urgency: "low", matchedTerms: [] };
  }

  if (matches(callerText, WRONG_NUMBER_TERMS).length > 0) {
    return {
      intent: "wrong_number",
      urgency: "low",
      matchedTerms: matches(callerText, WRONG_NUMBER_TERMS),
    };
  }

  const emergency = matches(callerText, EMERGENCY_TERMS);
  const estimate = matches(callerText, ESTIMATE_TERMS);
  const maintenance = matches(callerText, MAINTENANCE_TERMS);

  matched.push(...emergency, ...estimate, ...maintenance);

  // Urgency is driven by the caller's language first, then the trade. A
  // plumbing call in an emergency trade with no explicit urgency language is
  // still higher priority than a fencing call with the same silence.
  let urgency: UrgencyLevel = "normal";
  if (emergency.length > 0) urgency = "critical";
  else if (EMERGENCY_TRADES.includes(trade) && estimate.length === 0) {
    urgency = "high";
  }

  let intent: CallIntent;
  if (emergency.length > 0) intent = "emergency";
  else if (maintenance.length > 0) intent = "maintenance";
  else if (estimate.length > 0) intent = "estimate";
  else intent = "consultation";

  return { intent, urgency, matchedTerms: matched };
}

export function tierForTrade(trade: Trade): ContractorTier {
  return TRADE_TIER[trade];
}
