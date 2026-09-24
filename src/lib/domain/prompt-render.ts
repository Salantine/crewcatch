import {
  type PromptProfile,
  type Trade,
  TIER_LABEL,
  TIER_QUESTIONS,
  TRADE_LABEL,
  TRADE_TIER,
} from "./schemas";

/**
 * Assembles the voice agent's system prompt from data.
 *
 * This is deliberately a pure template function over `PromptProfile` + `Trade`
 * with no I/O. That is what makes "prompt optimization from transcripts" a
 * config update rather than a code release — the operator edits rows, and
 * tests/domain/prompt-render.test.ts holds the output to a golden file.
 */

export interface RenderedPrompt {
  system: string;
  /** The qualification questions, in the order they should be asked. */
  questions: string[];
}

const BASE_GUARDRAILS = [
  "You answer as a receptionist for a home-service contractor.",
  "You are not the owner. If the caller asks for the owner, do not pretend to be them.",
  "Never quote a price. Say the estimate requires a site visit.",
  "If the caller becomes distressed or threatens self-harm, tell them to call 911 immediately, then continue.",
  "Confirm the callback number by reading it back digit by digit before ending the call.",
  "End the call only after you have a name and a callback number.",
];

export function renderPrompt(
  profile: PromptProfile,
  trade: Trade,
): RenderedPrompt {
  const tier = TRADE_TIER[trade];
  const questions = TIER_QUESTIONS[tier];

  const objectionBlock =
    Object.keys(profile.objections).length > 0
      ? [
          "Objection handling:",
          ...Object.entries(profile.objections).map(
            ([trigger, response]) => `- If the caller says "${trigger}", reply: "${response}"`,
          ),
        ]
      : [];

  const hoursBlock = profile.afterHoursOnly
    ? [
        "This line is for after-hours and overflow calls only.",
        "Say so at the start of the call, and tell the caller the office will follow up.",
      ]
    : [];

  const system = [
    `You are answering calls for ${profile.businessName}, a ${TRADE_LABEL[trade]} contractor.`,
    `Qualification tier: ${TIER_LABEL[tier]}.`,
    "",
    "Greet the caller and say:",
    `"${profile.greeting}"`,
    "",
    "Ask these questions to qualify the call:",
    ...questions.map((q, i) => `${i + 1}. ${q}`),
    "",
    ...hoursBlock,
    ...objectionBlock,
    "",
    "Rules:",
    ...BASE_GUARDRAILS.map((r) => `- ${r}`),
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  return { system, questions };
}
