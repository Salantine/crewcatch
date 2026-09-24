import type {
  Call,
  CallIntent,
  Contractor,
  Lead,
  PromptProfile,
  UrgencyLevel,
} from "@/lib/domain/schemas";
import { mockVoiceAgent } from "@/lib/integrations/mock";
import { extractLead } from "@/lib/domain/lead-extraction";

/**
 * Portal data access.
 *
 * Reads go through the RLS-scoped Supabase client in production. Until a
 * Supabase project is configured, this returns a deterministic DEMO dataset so
 * the portal is fully explorable — clearly labelled as such in the UI, and never
 * presented as the contractor's real data.
 *
 * The demo path is deliberately separated from the Supabase path rather than
 * faking a database response, so swapping in the real client is a one-function
 * change.
 */

export const DEMO_CONTRACTOR: Contractor = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Northern Mechanical",
  primaryTrade: "hvac",
  tier: "emergency",
  dispatchChannels: ["sms", "email"],
  createdAt: "2026-01-15T00:00:00.000Z",
};

const SAMPLE_ISSUES: Record<UrgencyLevel, string[]> = {
  critical: [
    "No heat, gas smell suspected",
    "Burst pipe flooding the basement",
    "Carbon monoxide alarm sounding",
    "No power, panel sparking",
    "Sewage backing up into the tub",
  ],
  high: ["Furnace short-cycling", "AC not cooling above 85°", "Water heater leaking"],
  normal: ["Quote for furnace replacement", "Annual maintenance visit", "Estimate for new AC"],
  low: ["Question about a previous invoice", "Called the wrong number"],
};

const SAMPLE_INTENTS: CallIntent[] = [
  "emergency",
  "estimate",
  "maintenance",
  "consultation",
];

const SAMPLE_NAMES = [
  "Maria Alvarez", "Dale Kovac", "Ana Ruiz", "Sam Ortiz", "Nina Park",
  "Theo Nguyen", "Rita Silva", "Cole Brooks", "Imani Wright", "Petra Lang",
];

/** Deterministic pseudo-random from a seed, so the demo is stable across loads. */
function pick<T>(items: T[], seed: number): T {
  return items[seed % items.length];
}

function buildDemoCalls(count = 42): Call[] {
  const base = Date.parse("2026-09-20T12:00:00.000Z");
  return Array.from({ length: count }, (_, i) => {
    const seed = i * 2654435761;
    const urgency: UrgencyLevel =
      i % 9 === 0 ? "critical" : i % 4 === 0 ? "high" : i % 3 === 0 ? "normal" : "low";
    const startedAt = base - i * 3_600_000 * (1 + (seed % 5));
    const duration = 45 + (seed % 300);
    return {
      id: `demo-call-${i}`,
      contractorId: DEMO_CONTRACTOR.id,
      direction: "inbound" as const,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date(startedAt + duration * 1000).toISOString(),
      durationSeconds: duration,
      intent: pick(SAMPLE_INTENTS, seed),
      urgency,
      qualified: i % 5 !== 0,
      transcript: [
        { role: "agent", content: "Northern Mechanical, how can I help?", timestampMs: 0 },
        {
          role: "caller",
          content: pick(SAMPLE_NAMES, seed) + " calling about a problem.",
          timestampMs: 4000,
        },
        {
          role: "agent",
          content: "Is this urgent, and what is the property address?",
          timestampMs: 8000,
        },
      ],
    } satisfies Call;
  });
}

function buildDemoLeads(calls: Call[]): Lead[] {
  return calls
    .filter((c) => c.qualified)
    .slice(0, 28)
    .map((call, i) => {
      const seed = i * 40503;
      return {
        id: `demo-lead-${i}`,
        contractorId: DEMO_CONTRACTOR.id,
        callId: call.id,
        name: pick(SAMPLE_NAMES, seed),
        phone: `555${String(2000000 + (seed % 7999999)).slice(0, 7)}`,
        address: `${100 + (seed % 8800)} ${pick(["Elm", "Birch", "Cedar", "Aspen", "Willow"], seed)} St`,
        intent: call.intent,
        urgency: call.urgency,
        issue: pick(SAMPLE_ISSUES[call.urgency], seed),
        capturedAt: call.startedAt,
      } satisfies Lead;
    });
}

const DEMO_PROFILE: PromptProfile = {
  id: "00000000-0000-4000-8000-000000000002",
  contractorId: DEMO_CONTRACTOR.id,
  trade: "hvac",
  businessName: DEMO_CONTRACTOR.name,
  greeting: "Northern Mechanical, this is the after-hours line. How can I help?",
  objections: {
    "speak to the owner": "The owner is on a call right now. I can take your details and have them call you straight back.",
    "how much is this": "I can't quote pricing on the phone, but I can get a technician out to assess it.",
  },
  afterHoursOnly: true,
  updatedAt: "2026-09-18T00:00:00.000Z",
};

const demoCalls = buildDemoCalls();
const demoLeads = buildDemoLeads(demoCalls);

export function isDemoMode(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export interface PortalData {
  contractor: Contractor;
  calls: Call[];
  leads: Lead[];
  prompt: PromptProfile;
  demo: boolean;
  /**
   * Set when the signed-in user belongs to more than one contractor and has
   * not chosen one. RLS correctly returns zero rows in that state, so pages
   * must render the switcher rather than five empty tables.
   */
  ambiguous: { id: string; name: string }[] | null;
  /** True when the user is authenticated but has no contractor membership. */
  unassigned: boolean;
}

export async function getPortalData(): Promise<PortalData> {
  if (isDemoMode()) {
    return {
      contractor: DEMO_CONTRACTOR,
      calls: demoCalls,
      leads: demoLeads,
      prompt: DEMO_PROFILE,
      demo: true,
      ambiguous: null,
      unassigned: false,
    };
  }

  const { resolveContractor, getCalls, getLeads } = await import(
    "@/lib/portal/queries"
  );
  const resolution = await resolveContractor();

  if (resolution.kind === "none") {
    // Authenticated but not yet attached to a contractor. A legitimate state
    // during onboarding, not an error — the pages render an empty state.
    return {
      contractor: DEMO_CONTRACTOR,
      calls: [],
      leads: [],
      prompt: DEMO_PROFILE,
      demo: false,
      ambiguous: null,
      unassigned: true,
    };
  }

  if (resolution.kind === "ambiguous") {
    return {
      contractor: DEMO_CONTRACTOR,
      calls: [],
      leads: [],
      prompt: DEMO_PROFILE,
      demo: false,
      ambiguous: resolution.options.map((o) => ({ id: o.id, name: o.name })),
      unassigned: false,
    };
  }

  const [calls, leads] = await Promise.all([getCalls(), getLeads()]);

  return {
    contractor: resolution.contractor,
    calls,
    leads,
    // A contractor can exist before a prompt is seeded; fall back to a
    // rendered default rather than throwing on a missing optional relation.
    prompt: resolution.prompt ?? DEMO_PROFILE,
    demo: false,
    ambiguous: null,
    unassigned: false,
  };
}

/** KPIs derived from the call log — no separate aggregate table needed. */
export interface PortalMetrics {
  totalCalls: number;
  qualifiedRate: number;
  criticalCount: number;
  avgDurationSeconds: number;
  capturedThisWeek: number;
  monthlyRetainer: number;
  revenueAtRisk: number;
}

export function computeMetrics(calls: Call[], leads: Lead[]): PortalMetrics {
  const total = calls.length;
  const qualified = calls.filter((c) => c.qualified).length;
  const critical = calls.filter((c) => c.urgency === "critical").length;
  const avg = total
    ? Math.round(calls.reduce((sum, c) => sum + c.durationSeconds, 0) / total)
    : 0;

  const weekAgo = Date.now() - 7 * 86_400_000;
  const thisWeek = calls.filter((c) => Date.parse(c.startedAt) >= weekAgo).length;

  // Missed calls this month valued at the tier's average ticket. This is the
  // number the owner is paying to prevent — the calculator's whole argument.
  const revenueAtRisk = leads.length * 650;

  return {
    totalCalls: total,
    qualifiedRate: total ? Math.round((qualified / total) * 100) : 0,
    criticalCount: critical,
    avgDurationSeconds: avg,
    capturedThisWeek: thisWeek,
    monthlyRetainer: 499,
    revenueAtRisk,
  };
}

export { mockVoiceAgent, extractLead };
