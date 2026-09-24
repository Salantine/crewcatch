import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import {
  Call as CallSchema,
  CallIntent,
  Contractor as ContractorSchema,
  DispatchChannel,
  Lead as LeadSchema,
  PromptProfile as PromptProfileSchema,
  Trade,
  ContractorTier,
  type Call,
  type Contractor,
  type Lead,
  type PromptProfile,
  type TranscriptMessage,
  type UrgencyLevel,
} from "@/lib/domain/schemas";

/**
 * RLS-scoped reads for the client portal.
 *
 * Uses the anon/session client, NEVER the service-role admin client. RLS is
 * the authorization boundary: these queries deliberately carry no
 * `contractor_id` filter, because the policies in 0001/0002 already scope
 * every row to `auth.uid()`. Adding a redundant filter here would be a
 * false sense of extra safety; the isolation is the database's job.
 *
 * The dangerous part of this module is the snake_case → camelCase mapping.
 * A mismapped field renders an empty table rather than throwing, so every
 * mapper validates its row with zod first and is tested against a realistic
 * DB-shaped fixture.
 */

/* ------------------------------------------------------------------ rows */

const ContractorRow = z.object({
  id: z.uuid(),
  name: z.string(),
  primary_trade: Trade,
  tier: ContractorTier,
  dispatch_channels: z.array(DispatchChannel),
  created_at: z.iso.datetime(),
});

const CallRow = z.object({
  id: z.uuid(),
  contractor_id: z.uuid(),
  started_at: z.iso.datetime(),
  ended_at: z.iso.datetime(),
  duration_seconds: z.number().int(),
  intent: CallIntent,
  urgency: z.enum(["critical", "high", "normal", "low"]),
  qualified: z.boolean(),
  transcript: z.array(
    z.object({
      role: z.enum(["caller", "agent"]),
      content: z.string(),
      timestampMs: z.number(),
    }),
  ),
});

const LeadRow = z.object({
  id: z.uuid(),
  contractor_id: z.uuid(),
  call_id: z.uuid().nullable(),
  name: z.string(),
  phone: z.string(),
  address: z.string().nullable(),
  intent: CallIntent,
  urgency: z.enum(["critical", "high", "normal", "low"]),
  issue: z.string(),
  captured_at: z.iso.datetime(),
});

const PromptProfileRow = z.object({
  id: z.uuid(),
  contractor_id: z.uuid(),
  trade: Trade,
  business_name: z.string(),
  greeting: z.string(),
  objections: z.record(z.string(), z.string()),
  after_hours_only: z.boolean(),
  updated_at: z.iso.datetime(),
});

/* --------------------------------------------------------------- mappers */

export function toContractor(row: unknown): Contractor {
  const r = ContractorRow.parse(row);
  return ContractorSchema.parse({
    id: r.id,
    name: r.name,
    primaryTrade: r.primary_trade,
    tier: r.tier,
    dispatchChannels: r.dispatch_channels,
    createdAt: r.created_at,
  });
}

export function toCall(row: unknown): Call {
  const r = CallRow.parse(row);
  return CallSchema.parse({
    id: r.id,
    contractorId: r.contractor_id,
    direction: "inbound",
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationSeconds: r.duration_seconds,
    intent: r.intent,
    urgency: r.urgency as UrgencyLevel,
    qualified: r.qualified,
    transcript: r.transcript as TranscriptMessage[],
  });
}

export function toLead(row: unknown): Lead {
  const r = LeadRow.parse(row);
  return LeadSchema.parse({
    id: r.id,
    contractorId: r.contractor_id,
    // calls.call_id is nullable (a lead can outlive its call row).
    callId: r.call_id ?? "00000000-0000-4000-8000-000000000000",
    name: r.name,
    phone: r.phone,
    address: r.address ?? undefined,
    intent: r.intent,
    urgency: r.urgency as UrgencyLevel,
    issue: r.issue,
    capturedAt: r.captured_at,
  });
}

export function toPromptProfile(row: unknown): PromptProfile {
  const r = PromptProfileRow.parse(row);
  return PromptProfileSchema.parse({
    id: r.id,
    contractorId: r.contractor_id,
    trade: r.trade,
    businessName: r.business_name,
    greeting: r.greeting,
    objections: r.objections,
    afterHoursOnly: r.after_hours_only,
    updatedAt: r.updated_at,
  });
}

/* ---------------------------------------------------- contractor resolution */

/**
 * The result of resolving which contractor a signed-in user is looking at.
 *
 * `ambiguous` exists because migration 0002 makes `current_contractor_id()`
 * return NULL when a user holds more than one membership — the policies then
 * match no rows. Without this union the portal would render five empty
 * tables and the user would have no idea why. The alternative (picking the
 * first) is what the old `LIMIT 1` did, and it showed one entity's leads to
 * someone who asked for another.
 */
export type ContractorResolution =
  | { kind: "resolved"; contractor: Contractor; prompt: PromptProfile | null }
  | { kind: "ambiguous"; options: { id: string; name: string; trade: Trade }[] }
  | { kind: "none" };

/**
 * The contractor the user explicitly selected, if any.
 *
 * `current_contractor_id()` reads the `x-contractor-id` request header (see
 * migration 0002) and verifies it against the caller's memberships before
 * honouring it, so a forged value grants nothing. That header is set by
 * `proxy.ts` from this cookie.
 */
async function selectedContractorId(): Promise<string | null> {
  const store = await cookies();
  return store.get("contractor")?.value ?? null;
}

export async function resolveContractor(): Promise<ContractorResolution> {
  const supabase = await createClient();

  // The memberships function is SECURITY DEFINER and returns only the
  // caller's own rows.
  const { data: memberships, error: membershipError } = await supabase.rpc(
    "contractor_memberships",
  );

  if (membershipError) {
    throw new Error(`contractor_memberships failed: ${membershipError.message}`);
  }

  const ids = (memberships ?? []) as string[];

  if (ids.length === 0) {
    return { kind: "none" };
  }

  if (ids.length > 1) {
    // A selection resolves the ambiguity. It is validated against `ids` here
    // AND again inside the SQL function, so neither layer is trusted alone.
    const selected = await selectedContractorId();
    if (!selected || !ids.includes(selected)) {
      const { data, error } = await supabase
        .from("contractors")
        .select("id, name, primary_trade")
        .in("id", ids);

      if (error) {
        throw new Error(`contractor list failed: ${error.message}`);
      }

      return {
        kind: "ambiguous",
        options: ((data ?? []) as {
          id: string;
          name: string;
          primary_trade: Trade;
        }[])
          .map((r) => ({ id: r.id, name: r.name, trade: r.primary_trade }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    }
  }

  const selected = await selectedContractorId();
  const contractorId =
    selected && ids.includes(selected) ? selected : ids[0];

  const [{ data: contractorRow, error: contractorError }, { data: promptRow }] =
    await Promise.all([
      supabase
        .from("contractors")
        .select("id, name, primary_trade, tier, dispatch_channels, created_at")
        .eq("id", contractorId)
        .single(),
      supabase
        .from("prompt_profiles")
        .select(
          "id, contractor_id, trade, business_name, greeting, objections, after_hours_only, updated_at",
        )
        .eq("contractor_id", contractorId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (contractorError || !contractorRow) {
    return { kind: "none" };
  }

  return {
    kind: "resolved",
    contractor: toContractor(contractorRow),
    prompt: promptRow ? toPromptProfile(promptRow) : null,
  };
}

/* ---------------------------------------------------------------- queries */

export async function getCalls(limit = 200): Promise<Call[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calls")
    .select(
      "id, contractor_id, started_at, ended_at, duration_seconds, intent, urgency, qualified, transcript",
    )
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getCalls failed: ${error.message}`);
  return (data ?? []).map(toCall);
}

export async function getLeads(limit = 200): Promise<Lead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, contractor_id, call_id, name, phone, address, intent, urgency, issue, captured_at",
    )
    .order("captured_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getLeads failed: ${error.message}`);
  return (data ?? []).map(toLead);
}
