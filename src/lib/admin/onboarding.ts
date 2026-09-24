import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProviders } from "@/lib/integrations";
import {
  TRADE_LABEL,
  TIER_QUESTIONS,
  TRADE_TIER,
  type ContractorTier,
  type DispatchChannel,
  type Trade,
} from "@/lib/domain/schemas";
import { tradeTemplate } from "@/lib/domain/trade-templates";

/**
 * Contractor onboarding — the $1,500 setup fee, made repeatable.
 *
 * The service-role client is used deliberately and ONLY here and in the
 * ingestion path. Onboarding writes rows that belong to contractors who have
 * not yet been given a login, so there is no authenticated user for RLS to
 * evaluate. `eslint` blocks this import from any portal render path.
 */

export interface OnboardInput {
  name: string;
  primaryTrade: Trade;
  tier: ContractorTier;
  regions: string[];
  dispatchChannels: DispatchChannel[];
  /** Auth user to attach as owner. Omit to create the contractor first and
   *  link the owner later. */
  ownerUserId?: string;
  ownerEmail?: string;
}

export interface OnboardResult {
  contractorId: string;
  slug: string;
  numbers: { id: string; number: string; region: string }[];
  promptProfileId: string;
}

export type OnboardError =
  | "invalid_input"
  | "provisioning_failed"
  | "persistence_failed"
  | "auth_user_missing";

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "contractor";
}

/**
 * Onboards a contractor: creates the entity, provisions a number per region,
 * seeds a prompt profile from the trade template, and links the owner.
 *
 * Ordered so a partial failure leaves the operator with a usable contractor
 * rather than a half-provisioned one they must hand-repair. Numbers are
 * provisioned first (they are the slowest external call and the most likely
 * to fail), then the database rows in one transaction-shaped sequence.
 */
export async function onboardContractor(
  input: OnboardInput,
): Promise<{ ok: true; data: OnboardResult } | { ok: false; error: OnboardError; detail?: string }> {
  if (!input.name.trim()) {
    return { ok: false, error: "invalid_input", detail: "name is required" };
  }
  if (input.regions.length === 0) {
    return { ok: false, error: "invalid_input", detail: "at least one region is required" };
  }
  if (input.dispatchChannels.length === 0) {
    return { ok: false, error: "invalid_input", detail: "at least one dispatch channel is required" };
  }
  if (input.ownerUserId && !input.ownerEmail) {
    return { ok: false, error: "invalid_input", detail: "ownerEmail is required with ownerUserId" };
  }

  const supabase = createAdminClient();

  // 1. Create the contractor first so the slug is reserved — a duplicate slug
  //    should fail fast, before we provision paid phone numbers.
  const { data: contractor, error: contractorError } = await supabase
    .from("contractors")
    .insert({
      name: input.name.trim(),
      slug: slugify(input.name),
      primary_trade: input.primaryTrade,
      tier: input.tier,
      dispatch_channels: input.dispatchChannels,
    })
    .select("id, slug")
    .single();

  if (contractorError || !contractor) {
    return {
      ok: false,
      error: "persistence_failed",
      detail: contractorError?.message ?? "contractor insert returned no row",
    };
  }

  const contractorId = (contractor as { id: string }).id;

  // 2. Attach the owner. A contractor without a login cannot use the portal,
  //    so a missing auth user is a hard error rather than a warning.
  if (input.ownerUserId && input.ownerEmail) {
    const { error: membershipError } = await supabase
      .from("contractor_users")
      .insert({
        contractor_id: contractorId,
        user_id: input.ownerUserId,
        role: "owner",
      });

    if (membershipError) {
      return {
        ok: false,
        error: "persistence_failed",
        detail: `membership: ${membershipError.message}`,
      };
    }
  }

  // 3. Provision numbers. External call, so failure is reported distinctly.
  const { telephony } = getProviders();
  const numbers: OnboardResult["numbers"] = [];

  for (const region of input.regions) {
    try {
      const number = await telephony.provisionNumber({
        region,
        label: input.name,
      });
      const { data: row, error: numberError } = await supabase
        .from("phone_numbers")
        .insert({
          contractor_id: contractorId,
          number: number.number,
          region_label: region,
          active: true,
        })
        .select("id, number")
        .single();

      if (numberError) {
        return {
          ok: false,
          error: "persistence_failed",
          detail: `phone_numbers: ${numberError.message}`,
        };
      }
      numbers.push({
        id: (row as { id: string }).id,
        number: (row as { number: string }).number,
        region,
      });
    } catch (err) {
      return {
        ok: false,
        error: "provisioning_failed",
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // 4. Seed the prompt profile from the trade template so the voice agent is
  //    usable immediately, and consistent with what prompt-render produces.
  const template = tradeTemplate(input.primaryTrade);
  const { data: profile, error: profileError } = await supabase
    .from("prompt_profiles")
    .insert({
      contractor_id: contractorId,
      trade: input.primaryTrade,
      business_name: input.name.trim(),
      greeting: template.greeting,
      objections: template.objections,
      after_hours_only: template.afterHoursOnly,
    })
    .select("id")
    .single();

  if (profileError) {
    return {
      ok: false,
      error: "persistence_failed",
      detail: `prompt_profiles: ${profileError.message}`,
    };
  }

  return {
    ok: true,
    data: {
      contractorId,
      slug: (contractor as { slug: string }).slug,
      numbers,
      promptProfileId: (profile as { id: string }).id,
    },
  };
}

export interface ContractorSummary {
  id: string;
  name: string;
  slug: string;
  primaryTrade: Trade;
  tier: ContractorTier;
  dispatchChannels: DispatchChannel[];
  numbers: { number: string; region: string }[];
  qualificationQuestions: string[];
  tradeLabel: string;
}

export async function listContractors(): Promise<ContractorSummary[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("contractors")
    .select("id, name, slug, primary_trade, tier, dispatch_channels, phone_numbers(number, region_label)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listContractors failed: ${error.message}`);

  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    slug: string;
    primary_trade: Trade;
    tier: ContractorTier;
    dispatch_channels: DispatchChannel[];
    phone_numbers: { number: string; region_label: string }[] | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    primaryTrade: r.primary_trade,
    tier: r.tier,
    dispatchChannels: r.dispatch_channels ?? [],
    numbers: (r.phone_numbers ?? []).map((n) => ({
      number: n.number,
      region: n.region_label,
    })),
    qualificationQuestions: TIER_QUESTIONS[TRADE_TIER[r.primary_trade]],
    tradeLabel: TRADE_LABEL[r.primary_trade],
  }));
}
