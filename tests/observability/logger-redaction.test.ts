import { describe, expect, it } from "vitest";
import { redact } from "@/lib/observability/logger";

/**
 * Regression guard for the contact-form leak: a sole trader's business name
 * is frequently their own name, so it must be redacted alongside `name`.
 * Found by running the endpoint, not by reading the code.
 */
describe("redact — contact PII", () => {
  it("redacts a business name", () => {
    const out = redact({ business: "Peak HVAC" }) as Record<string, unknown>;
    expect(out.business).not.toContain("Peak");
  });

  it("redacts businessName", () => {
    const out = redact({ businessName: "Peak HVAC" }) as Record<string, unknown>;
    expect(out.businessName).not.toContain("Peak");
  });

  it("redacts a whole contact payload", () => {
    const out = redact({
      name: "Dana Ruiz",
      business: "Peak HVAC",
      email: "dana@peak.com",
      phone: "5558675309",
      message: "We miss 20 calls a week",
    });
    const json = JSON.stringify(out);
    expect(json).not.toContain("Dana");
    expect(json).not.toContain("Peak");
    expect(json).not.toContain("dana@peak.com");
    expect(json).not.toContain("5558675309");
  });

  it("keeps the reference and trade so the log stays actionable", () => {
    const out = redact({
      reference: "CC-ABC123",
      trade: "hvac",
      delivered: false,
    }) as Record<string, unknown>;
    expect(out.reference).toBe("CC-ABC123");
    expect(out.trade).toBe("hvac");
    expect(out.delivered).toBe(false);
  });
});
