import { z } from "zod";

/**
 * Every entity is defined ONCE here as a zod schema; the TypeScript types are
 * inferred from it. That is why zod is a runtime dependency and not a dev one:
 * it validates the Retell transcript and the Postgres rows at the boundary AND
 * produces the types those callers use.
 */

/* ------------------------------------------------------------------ enums */

export const UrgencyLevel = z.enum(["critical", "high", "normal", "low"]);
export type UrgencyLevel = z.infer<typeof UrgencyLevel>;

export const CallIntent = z.enum([
  "emergency",
  "estimate",
  "maintenance",
  "consultation",
  "wrong_number",
]);
export type CallIntent = z.infer<typeof CallIntent>;

/** The 12 trades named in the MVP document, grouped by qualification tier. */
export const Trade = z.enum([
  // Emergency
  "hvac",
  "plumbing",
  "electrical",
  // Design & Build
  "landscaping",
  "pools",
  "hardscape",
  // Maintenance
  "pest_control",
  "cleaning",
  "property_mgmt",
  // Specialized
  "concrete",
  "carpentry",
  "fencing",
]);
export type Trade = z.infer<typeof Trade>;

export const ContractorTier = z.enum([
  "emergency",
  "design_build",
  "maintenance",
  "specialized",
]);
export type ContractorTier = z.infer<typeof ContractorTier>;

export const DispatchChannel = z.enum(["sms", "email", "crm"]);
export type DispatchChannel = z.infer<typeof DispatchChannel>;

/* ------------------------------------------------------------------ config */

export const TRADE_TIER: Record<Trade, ContractorTier> = {
  hvac: "emergency",
  plumbing: "emergency",
  electrical: "emergency",
  landscaping: "design_build",
  pools: "design_build",
  hardscape: "design_build",
  pest_control: "maintenance",
  cleaning: "maintenance",
  property_mgmt: "maintenance",
  concrete: "specialized",
  carpentry: "specialized",
  fencing: "specialized",
};

export const TRADE_LABEL: Record<Trade, string> = {
  hvac: "HVAC",
  plumbing: "Plumbing",
  electrical: "Emergency Electrical",
  landscaping: "Landscaping",
  pools: "Pool Construction",
  hardscape: "Hardscaping",
  pest_control: "Pest Control",
  cleaning: "Cleaning",
  property_mgmt: "Property Management",
  concrete: "Concrete",
  carpentry: "Custom Carpentry",
  fencing: "Fencing",
};

export const TIER_LABEL: Record<ContractorTier, string> = {
  emergency: "Emergency",
  design_build: "Design & Build",
  maintenance: "Maintenance",
  specialized: "Specialized",
};

/**
 * Qualification questions are DATA, not code. A 4–5 item vector per tier means
 * onboarding a 13th trade is a row insert, not a deploy — which is what makes
 * the "$499/mo includes prompt optimization" promise operationally true.
 */
export const TIER_QUESTIONS: Record<ContractorTier, string[]> = {
  emergency: [
    "Nature of the failure",
    "Water, gas, or electrical risk",
    "Property address",
    "Owner availability",
  ],
  design_build: [
    "Project scope",
    "Budget range",
    "Desired timeline",
    "Property footprint",
    "Permit awareness",
  ],
  maintenance: [
    "Frequency of service needed",
    "Property square footage",
    "Specific problem areas",
    "Access instructions",
  ],
  specialized: [
    "Material preferences",
    "Structural dimensions",
    "Ground and site conditions",
    "Timeline flexibility",
  ],
};

/* ------------------------------------------------------------- core records */

export const Contractor = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  primaryTrade: Trade,
  tier: ContractorTier,
  dispatchChannels: z.array(DispatchChannel).min(1),
  createdAt: z.iso.datetime(),
});
export type Contractor = z.infer<typeof Contractor>;

export const PhoneNumber = z.object({
  id: z.uuid(),
  contractorId: z.uuid(),
  /** E.164. */
  number: z.string().regex(/^\+[1-9]\d{7,14}$/, "Expected E.164 format"),
  regionLabel: z.string().min(1),
  active: z.boolean(),
});
export type PhoneNumber = z.infer<typeof PhoneNumber>;

export const PromptProfile = z.object({
  id: z.uuid(),
  contractorId: z.uuid(),
  trade: Trade,
  businessName: z.string().min(1),
  greeting: z.string().min(1),
  /** Objection-handling scripts, keyed by trigger phrase. */
  objections: z.record(z.string(), z.string()).default({}),
  afterHoursOnly: z.boolean().default(false),
  updatedAt: z.iso.datetime(),
});
export type PromptProfile = z.infer<typeof PromptProfile>;

export const TranscriptMessage = z.object({
  role: z.enum(["caller", "agent"]),
  content: z.string(),
  timestampMs: z.number().int().nonnegative(),
});
export type TranscriptMessage = z.infer<typeof TranscriptMessage>;

export const Call = z.object({
  id: z.uuid(),
  contractorId: z.uuid(),
  direction: z.literal("inbound"),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  durationSeconds: z.number().int().nonnegative(),
  intent: CallIntent,
  urgency: UrgencyLevel,
  /** Whether a contactable lead was produced. A call can be captured but
   *  unqualified — the owner still needs to see it. */
  qualified: z.boolean(),
  transcript: z.array(TranscriptMessage),
});
export type Call = z.infer<typeof Call>;

export const Lead = z.object({
  id: z.uuid(),
  contractorId: z.uuid(),
  callId: z.uuid(),
  name: z.string().min(1),
  phone: z.string().min(7),
  address: z.string().optional(),
  intent: CallIntent,
  urgency: UrgencyLevel,
  issue: z.string().min(1),
  capturedAt: z.iso.datetime(),
});
export type Lead = z.infer<typeof Lead>;

/* --------------------------------------------- transport-only contracts */

/**
 * OUR contract, not a vendor's. Deliberately free of Twilio/Retell field
 * names: the vendor payload shape is unverified in this environment, and
 * guessing it would produce a mock that silently mismatches the real webhook.
 * See lib/integrations/vendor-schemas.ts for the inbound boundary.
 */
export const CallCompletedEvent = z.object({
  externalCallId: z.string().min(1),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  durationSeconds: z.number().int().nonnegative(),
  callerNumber: z.string().min(1),
  transcript: z.array(TranscriptMessage),
  /** Free-form key/values the voice agent attached to the call. */
  metadata: z.record(z.string(), z.string()).default({}),
});
export type CallCompletedEvent = z.infer<typeof CallCompletedEvent>;

export const DispatchNotification = z.object({
  leadId: z.uuid(),
  channel: DispatchChannel,
  recipient: z.string().min(1),
  body: z.string().min(1),
});
export type DispatchNotification = z.infer<typeof DispatchNotification>;

export const DeliveryReceipt = z.object({
  channel: DispatchChannel,
  accepted: z.boolean(),
  providerMessageId: z.string().optional(),
  detail: z.string().optional(),
});
export type DeliveryReceipt = z.infer<typeof DeliveryReceipt>;
