import { describe, expect, it } from "vitest";
import { redact, REDACTED } from "@/lib/observability/logger";

/**
 * Logs ship to third-party aggregators and are retained. This system handles
 * caller phone numbers and full transcripts by design, so redaction is the
 * difference between a log line and a data-protection incident.
 */
describe("redact", () => {
  it("removes phone numbers", () => {
    const out = redact({ phone: "555-867-5309" }) as Record<string, unknown>;
    expect(out.phone).not.toContain("867-5309");
    expect(String(out.phone)).toContain(REDACTED);
  });

  it("removes caller names and addresses", () => {
    const out = redact({
      name: "Maria Alvarez",
      address: "12 Elm St",
    }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain("Maria");
    expect(JSON.stringify(out)).not.toContain("Elm");
  });

  it("removes full transcripts", () => {
    const out = redact({
      transcript: [{ role: "caller", content: "My furnace is out" }],
    }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain("furnace");
  });

  it("removes credentials", () => {
    const out = redact({
      secret: "hunter2",
      token: "abc",
      apiKey: "sk-123",
    }) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain("hunter2");
    expect(JSON.stringify(out)).not.toContain("sk-123");
  });

  it("preserves length so a truncated capture is detectable", () => {
    // Knowing "a phone number was here" without knowing its value is enough
    // to spot a field that stopped being populated.
    const out = redact({ phone: "5558675309" }) as Record<string, string>;
    expect(out.phone).toContain("10");
  });

  it("redacts nested objects", () => {
    const out = redact({
      lead: { name: "Ana Ruiz", phone: "5558675309", urgency: "critical" },
    });
    const json = JSON.stringify(out);
    expect(json).not.toContain("Ana");
    expect(json).not.toContain("5558675309");
    // Non-sensitive fields survive, so the log stays useful.
    expect(json).toContain("critical");
  });

  it("redacts inside arrays", () => {
    const out = redact({ leads: [{ phone: "5558675309" }, { phone: "5551112222" }] });
    expect(JSON.stringify(out)).not.toContain("5558675309");
    expect(JSON.stringify(out)).not.toContain("5551112222");
  });

  it("keeps non-sensitive operational fields", () => {
    const out = redact({
      leadId: "abc-123",
      channel: "sms",
      attempts: 3,
      elapsedMs: 1200,
      withinSla: true,
    }) as Record<string, unknown>;
    expect(out).toEqual({
      leadId: "abc-123",
      channel: "sms",
      attempts: 3,
      elapsedMs: 1200,
      withinSla: true,
    });
  });

  it("preserves primitives and nulls", () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
    expect(redact(42)).toBe(42);
    expect(redact("text")).toBe("text");
  });

  it("does not blow the stack on a deeply nested object", () => {
    let deep: Record<string, unknown> = { phone: "5558675309" };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    expect(() => redact(deep)).not.toThrow();
  });

  it("does not recurse forever on a circular structure", () => {
    const cyclic: Record<string, unknown> = { name: "x" };
    cyclic.self = cyclic;
    expect(() => redact(cyclic)).not.toThrow();
  });
});
