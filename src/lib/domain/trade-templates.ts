import { TRADE_TIER, type ContractorTier, type Trade } from "./schemas";

/**
 * Per-trade prompt seeds for onboarding.
 *
 * Derived from the same tier model the renderer already uses, so a seeded
 * profile and a hand-written one produce the same shape of prompt. The
 * objection scripts are deliberately trade-flavoured rather than generic —
 * "how much is this" is answered differently for a concrete pour than for a
 * furnace call, and that difference is the product.
 */

export interface TradeTemplate {
  greeting: string;
  objections: Record<string, string>;
  afterHoursOnly: boolean;
}

const BASE_GREETING =
  "{business}, this is the answering line. How can I help?";

const AFTER_HOURS_GREETING =
  "{business}, this is the after-hours line. How can I help?";

const TIER_QUESTIONS_HINT: Record<ContractorTier, string> = {
  emergency:
    "If they mention a gas smell, carbon monoxide, sparks, or standing water near electricity, tell them to get to safety and call 911 first — then continue.",
  design_build:
    "Nobody quotes a landscape or build job on the phone. Set the site visit; note scope, budget range, and timeline so the visit is productive.",
  maintenance:
    "These callers are recurring. Confirm frequency and property size so the annual contract can be quoted without a second call.",
  specialized:
    "Material, dimensions, and site conditions decide the price. Capture all three or the quote becomes a change-order conversation later.",
};

const TIER_OBJECTIONS: Record<ContractorTier, Record<string, string>> = {
  emergency: {
    "speak to the owner":
      "The owner is out on a job right now. I can take your details and have them call you back within the hour.",
    "how much is this":
      "I can't quote over the phone, but I can get a technician out to assess it today. What's the address?",
    "are you open right now":
      "We're on the emergency line now, which means we're taking jobs. I can still get someone out today.",
  },
  design_build: {
    "speak to the owner":
      "They do all the estimating personally. I'll take the project details and have them call you to schedule a site visit.",
    "how much is this":
      "Every site is different, so the number comes after a walkthrough. Tell me the scope and I'll get the visit booked.",
    "get a quote":
      "I can start that now. What's the project, roughly when do you want it done, and is there a budget range in mind?",
  },
  maintenance: {
    "speak to the owner":
      "The office is closed right now, but I handle all the scheduling. What's the property address and what service do you need?",
    "how much is this":
      "It depends on property size and service type. Let me get those two details and someone can confirm a price.",
    "just wondering":
      "No problem. What's the property like, and how often are you looking at service?",
  },
  specialized: {
    "speak to the owner":
      "They handle all the quoting. I'll take the project details and have them call you back.",
    "how much is this":
      "Price depends on materials and dimensions, so it needs a look. Tell me roughly what you're planning and I'll book the estimate.",
    "get an estimate":
      "I can do that. What are the dimensions, and do you have a material preference?",
  },
};

export function tradeTemplate(trade: Trade): TradeTemplate {
  const tier = TRADE_TIER[trade];
  return {
    greeting: AFTER_HOURS_GREETING,
    objections: {
      ...TIER_OBJECTIONS[tier],
      "__hint": TIER_QUESTIONS_HINT[tier],
    },
    afterHoursOnly: true,
  };
}

/** Starter greeting for a specific business, used at onboarding time. */
export function renderGreeting(template: TradeTemplate, businessName: string): string {
  return template.greeting.replace("{business}", businessName);
}

export const BASE_TEMPLATES = { BASE_GREETING };

export type { Trade };
