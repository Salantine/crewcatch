import { describe, expect, it } from "vitest";
import {
  calculateRoi,
  formatPayback,
  MONTHLY_RETAINER,
  SETUP_FEE,
  TIER_DEFAULTS,
} from "@/lib/domain/roi";
import type { ContractorTier } from "@/lib/domain/schemas";

const TIERS: ContractorTier[] = [
  "emergency",
  "design_build",
  "maintenance",
  "specialized",
];

describe("calculateRoi", () => {
  it("clears fees at default inputs for every tier", () => {
    // Regression guard. The original model valued a maintenance job as a
    // single ticket and returned -$3,449 over three years, which would have
    // shown a pest-control prospect that CrewCatch costs them money.
    for (const tier of TIERS) {
      const result = calculateRoi({ tier });
      expect(
        result.clearsFees,
        `${tier} must clear the retainer at default inputs, got ${result.firstYearNet}`,
      ).toBe(true);
      expect(result.firstYearNet).toBeGreaterThan(0);
    }
  });

  it("values maintenance on recurring revenue, not a single visit", () => {
    const d = TIER_DEFAULTS.maintenance;
    expect(d.revenueMonths).toBe(12);
    expect(d.recurring).toBe(true);

    const oneOff = calculateRoi({ tier: "maintenance", revenueMonths: 1 });
    const recurring = calculateRoi({ tier: "maintenance" });
    expect(recurring.annualCapturedRevenue).toBeGreaterThan(
      oneOff.annualCapturedRevenue * 10,
    );
  });

  it("computes the first-year cost as setup plus twelve months", () => {
    const r = calculateRoi({ tier: "emergency" });
    expect(r.firstYearCost).toBe(SETUP_FEE + MONTHLY_RETAINER * 12);
    expect(r.firstYearCost).toBe(7488);
  });

  it("multiplies call volume through missed rate and close rate", () => {
    const r = calculateRoi({
      tier: "emergency",
      monthlyCalls: 100,
      missedRate: 0.5,
      closeRate: 0.5,
    });
    expect(r.capturedCallsPerMonth).toBe(50);
    expect(r.closedJobsPerMonth).toBe(25);
  });

  it("returns zero revenue and infinite payback at zero call volume", () => {
    const r = calculateRoi({ tier: "emergency", monthlyCalls: 0 });
    expect(r.annualCapturedRevenue).toBe(0);
    expect(r.roiMultiple).toBe(0);
    expect(r.paybackMonths).toBe(Number.POSITIVE_INFINITY);
    expect(r.clearsFees).toBe(false);
  });

  it("clamps percentages to 0..1 instead of producing absurd revenue", () => {
    const r = calculateRoi({ tier: "emergency", missedRate: 5, closeRate: -3 });
    expect(r.inputs.missedRate).toBe(1);
    expect(r.inputs.closeRate).toBe(0);
    expect(Number.isFinite(r.annualCapturedRevenue)).toBe(true);
  });

  it("surfaces a negative result rather than hiding it", () => {
    // A prospect entering a $50 ticket deserves the honest answer.
    const r = calculateRoi({ tier: "maintenance", ticket: 50, revenueMonths: 1 });
    expect(r.clearsFees).toBe(false);
    expect(r.firstYearNet).toBeLessThan(0);
  });

  it("handles negative input without producing negative revenue", () => {
    const r = calculateRoi({ tier: "emergency", ticket: -100, monthlyCalls: -5 });
    expect(r.annualCapturedRevenue).toBe(0);
    expect(r.inputs.ticket).toBe(0);
  });
});

describe("formatPayback", () => {
  it("renders infinities as an honest non-number", () => {
    expect(formatPayback(Number.POSITIVE_INFINITY)).toBe("Not at these inputs");
  });

  it("singularises one month", () => {
    expect(formatPayback(1)).toBe("1 month");
    expect(formatPayback(4)).toBe("4 months");
  });
});
