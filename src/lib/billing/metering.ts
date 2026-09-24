import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/observability/logger";

/**
 * Usage metering for overage tiers.
 *
 * The retainer includes a baseline of usage with overage charged past it, but
 * the thresholds were never defined in the product doc and `usage_records` was
 * never written. This records usage so the number becomes computable; the
 * THRESHOLDS themselves are a pricing decision and are called out below rather
 * than invented.
 */

export const BASELINE_MINUTES_PER_MONTH = 500;

export interface UsageRecord {
  contractorId: string;
  periodStart: string; // YYYY-MM-DD
  callsAnswered: number;
  minutesUsed: number;
}

function periodStartFor(date = new Date()): string {
  const month = date.toISOString().slice(0, 7); // YYYY-MM
  return `${month}-01`;
}

/**
 * Records usage for the current period, accumulating onto any existing row.
 *
 * Idempotent per (contractor, period): a retried webhook must not inflate the
 * bill. It adds minutes/calls rather than overwriting, and the caller passes
 * the delta from THIS call only.
 */
export async function recordUsage(
  contractorId: string,
  delta: { callsAnswered: number; minutesUsed: number },
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const supabase = createAdminClient();
    const periodStart = periodStartFor();

    // The table has unique (contractor_id, period_start), so an upsert is the
    // natural accumulate-or-create.
    const { error } = await supabase.from("usage_records").upsert(
      {
        contractor_id: contractorId,
        period_start: periodStart,
        calls_answered: delta.callsAnswered,
        minutes_used: delta.minutesUsed,
      },
      { onConflict: "contractor_id,period_start", ignoreDuplicates: false },
    );

    if (error) {
      log.error("metering.upsert_failed", {
        contractorId,
        periodStart,
        detail: error.message,
      });
      return { ok: false, reason: error.message };
    }

    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    log.error("metering.upsert_threw", { contractorId, detail });
    return { ok: false, reason: detail };
  }
}

export interface OverageSummary {
  periodStart: string;
  callsAnswered: number;
  minutesUsed: number;
  baselineMinutes: number;
  overageMinutes: number;
  /** Undefined until the overage rate is agreed — see the note below. */
  overageCost: number | null;
}

/**
 * Summarises the current period.
 *
 * ⚠ `overageCost` is intentionally null. The retainer is $499/mo "with
 * scalable overage tiers for seasonal spikes", but the tier rates have never
 * been set. Inventing a rate here would produce an invoice number that looks
 * authoritative and is fiction. This returns the raw overage MINUTES so a
 * pricing decision can be applied on top, and reports the cost as unknown
 * rather than guessing.
 */
export async function getOverageSummary(
  contractorId: string,
): Promise<OverageSummary> {
  const supabase = createAdminClient();
  const periodStart = periodStartFor();

  const { data, error } = await supabase
    .from("usage_records")
    .select("calls_answered, minutes_used")
    .eq("contractor_id", contractorId)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (error) {
    log.error("metering.read_failed", { contractorId, detail: error.message });
    return {
      periodStart,
      callsAnswered: 0,
      minutesUsed: 0,
      baselineMinutes: BASELINE_MINUTES_PER_MONTH,
      overageMinutes: 0,
      overageCost: null,
    };
  }

  const row = data as { calls_answered: number; minutes_used: number } | null;
  const minutesUsed = Number(row?.minutes_used ?? 0);
  const overageMinutes = Math.max(0, minutesUsed - BASELINE_MINUTES_PER_MONTH);

  return {
    periodStart,
    callsAnswered: Number(row?.calls_answered ?? 0),
    minutesUsed,
    baselineMinutes: BASELINE_MINUTES_PER_MONTH,
    overageMinutes,
    // TODO[CRITICAL]: set once the overage tier rate is agreed. Until then the
    // portal shows "—" rather than a fabricated charge.
    overageCost: null,
  };
}
