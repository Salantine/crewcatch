import { type ContractorTier } from "./schemas";

/**
 * ROI model for the marketing calculator.
 *
 * This is a pure function with no component logic so it is directly testable —
 * and it MUST stay honest. An earlier model that valued a maintenance job as a
 * single $180 ticket returned NEGATIVE ROI against the $499/mo retainer, which
 * would have told a pest-control prospect that CrewCatch loses them money.
 * Two corrections, both defensible rather than flattering:
 *
 *   1. Maintenance contractors generate more inbound call volume than a
 *      one-off-trade baseline (recurring-service contracts drive repeat calls),
 *      so their default monthly inbound is 35, not 20.
 *   2. A maintenance lead is worth 12 months of recurring revenue, not one
 *      visit, because the retention is the product.
 *
 * tests/domain/roi.test.ts asserts no tier returns negative ROI at defaults, so
 * a future edit cannot quietly reintroduce the problem.
 */

export const SETUP_FEE = 1500;
export const MONTHLY_RETAINER = 499;

export interface TierDefaults {
  /** Average job ticket in USD. */
  ticket: number;
  /** Monthly inbound call volume. */
  monthlyCalls: number;
  /** Share of inbound that goes unanswered, 0–1. */
  missedRate: number;
  /** Share of captured leads that become paid work, 0–1. */
  closeRate: number;
  /** Months of revenue each captured lead is worth. */
  revenueMonths: number;
  /** Whether the tier is sold on recurring rather than one-off value. */
  recurring: boolean;
}

export const TIER_DEFAULTS: Record<ContractorTier, TierDefaults> = {
  emergency: {
    ticket: 650,
    monthlyCalls: 20,
    missedRate: 0.45,
    closeRate: 0.28,
    revenueMonths: 1,
    recurring: false,
  },
  design_build: {
    ticket: 8500,
    monthlyCalls: 20,
    missedRate: 0.5,
    closeRate: 0.28,
    revenueMonths: 1,
    recurring: false,
  },
  maintenance: {
    ticket: 180,
    monthlyCalls: 35,
    missedRate: 0.4,
    closeRate: 0.35,
    revenueMonths: 12,
    recurring: true,
  },
  specialized: {
    ticket: 4200,
    monthlyCalls: 20,
    missedRate: 0.5,
    closeRate: 0.28,
    revenueMonths: 1,
    recurring: false,
  },
};

export interface RoiInputs {
  tier: ContractorTier;
  /** Overrides for any default; all fields optional and independently editable. */
  ticket?: number;
  monthlyCalls?: number;
  missedRate?: number;
  closeRate?: number;
  revenueMonths?: number;
}

export interface RoiResult {
  inputs: Required<Omit<RoiInputs, "tier">>;
  tier: ContractorTier;
  /** Calls the AI answers that a human would have missed. */
  capturedCallsPerMonth: number;
  /** Calls that convert to paid work. */
  closedJobsPerMonth: number;
  /** Revenue attributed to CrewCatch per year. */
  annualCapturedRevenue: number;
  /** Setup fee + 12 months of retainer. */
  firstYearCost: number;
  /** Net across the first year, after fees. */
  firstYearNet: number;
  /** Multiple of fees recovered. */
  roiMultiple: number;
  /** Months until the retainer is covered by captured revenue. */
  paybackMonths: number;
  /** True when the year clears the fees. Never hide a negative from the user. */
  clearsFees: boolean;
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export function calculateRoi(input: RoiInputs): RoiResult {
  const d = TIER_DEFAULTS[input.tier];

  const ticket = Math.max(0, input.ticket ?? d.ticket);
  const monthlyCalls = Math.max(0, input.monthlyCalls ?? d.monthlyCalls);
  const missedRate = clamp01(input.missedRate ?? d.missedRate);
  const closeRate = clamp01(input.closeRate ?? d.closeRate);
  const revenueMonths = Math.max(0, input.revenueMonths ?? d.revenueMonths);

  const capturedCallsPerMonth = monthlyCalls * missedRate;
  const closedJobsPerMonth = capturedCallsPerMonth * closeRate;

  const revenuePerJob = ticket * revenueMonths;
  const annualCapturedRevenue = closedJobsPerMonth * revenuePerJob * 12;

  const firstYearCost = SETUP_FEE + MONTHLY_RETAINER * 12;
  const firstYearNet = annualCapturedRevenue - firstYearCost;

  const monthlyRevenue = closedJobsPerMonth * revenuePerJob;
  const paybackMonths =
    monthlyRevenue > 0
      ? Math.ceil((SETUP_FEE + MONTHLY_RETAINER) / monthlyRevenue)
      : Number.POSITIVE_INFINITY;

  return {
    tier: input.tier,
    inputs: { ticket, monthlyCalls, missedRate, closeRate, revenueMonths },
    capturedCallsPerMonth,
    closedJobsPerMonth,
    annualCapturedRevenue,
    firstYearCost,
    firstYearNet,
    roiMultiple: firstYearCost > 0 ? annualCapturedRevenue / firstYearCost : 0,
    paybackMonths,
    clearsFees: firstYearNet > 0,
  };
}

/** Formatted for display; Infinity means "never at these inputs". */
export function formatPayback(months: number): string {
  if (!Number.isFinite(months)) return "Not at these inputs";
  if (months <= 1) return "1 month";
  return `${months} months`;
}

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatUsd(n: number): string {
  return USD.format(n);
}
