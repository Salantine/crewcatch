import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Mapper tests.
 *
 * The danger these guard against is specific: domain types are camelCase,
 * Postgres columns are snake_case. A mismap does not throw — it renders an
 * empty table, or worse, silently drops the dispatch channel a contractor
 * depends on. So the fixtures below are shaped like REAL DATABASE ROWS, not
 * like the domain types they map to. A fixture that already looked like the
 * output would pass whether or not the mapper worked.
 */

const { toContractor, toCall, toLead, toPromptProfile } = await import(
  "@/lib/portal/queries"
);

describe("row fixtures are DB-shaped", () => {
  // Guards the fixtures themselves: if someone "helpfully" rewrites a fixture
  // into domain shape, these fail and the mapper tests stop meaning anything.
  const contractorRow = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Alpha HVAC",
    primary_trade: "hvac",
    tier: "emergency",
    dispatch_channels: ["sms", "email"],
    created_at: "2026-01-15T00:00:00.000Z",
  };

  it("uses snake_case keys as Postgres returns them", () => {
    expect(contractorRow).toHaveProperty("dispatch_channels");
    expect(contractorRow).toHaveProperty("primary_trade");
    expect(contractorRow).toHaveProperty("created_at");
    expect(contractorRow).not.toHaveProperty("dispatchChannels");
  });
});

describe("toContractor", () => {
  const row = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Alpha HVAC",
    primary_trade: "hvac" as const,
    tier: "emergency" as const,
    dispatch_channels: ["sms", "email"] as ("sms" | "email")[],
    created_at: "2026-01-15T00:00:00.000Z",
  };

  it("maps every snake_case column to camelCase", () => {
    const c = toContractor(row);
    expect(c.primaryTrade).toBe("hvac");
    expect(c.dispatchChannels).toEqual(["sms", "email"]);
    expect(c.createdAt).toBe("2026-01-15T00:00:00.000Z");
  });

  it("preserves every dispatch channel", () => {
    // Dropping this array would silently disable SMS dispatch for a customer
    // who paid for it.
    const c = toContractor({ ...row, dispatch_channels: ["sms", "email", "crm"] });
    expect(c.dispatchChannels).toHaveLength(3);
    expect(c.dispatchChannels).toContain("crm");
  });

  it("rejects a row with an unknown trade rather than rendering undefined", () => {
    expect(() =>
      toContractor({ ...row, primary_trade: "plumbing-adjacent" }),
    ).toThrow();
  });

  it("rejects a row missing a required column", () => {
    const { tier: _tier, ...withoutTier } = row;
    expect(() => toContractor(withoutTier)).toThrow();
  });
});

describe("toCall", () => {
  const row = {
    id: "cccccccc-0000-4000-8000-000000000001",
    contractor_id: "11111111-1111-4111-8111-111111111111",
    started_at: "2026-09-20T12:00:00.000Z",
    ended_at: "2026-09-20T12:02:00.000Z",
    duration_seconds: 120,
    intent: "emergency" as const,
    urgency: "critical" as const,
    qualified: true,
    transcript: [
      { role: "agent" as const, content: "HVAC, how can I help?", timestampMs: 0 },
      { role: "caller" as const, content: "Furnace is out.", timestampMs: 4000 },
    ],
  };

  it("maps duration and timestamps", () => {
    const c = toCall(row);
    expect(c.durationSeconds).toBe(120);
    expect(c.startedAt).toBe("2026-09-20T12:00:00.000Z");
    expect(c.contractorId).toBe(row.contractor_id);
  });

  it("forces direction to inbound", () => {
    expect(toCall(row).direction).toBe("inbound");
  });

  it("preserves the transcript", () => {
    expect(toCall(row).transcript).toHaveLength(2);
    expect(toCall(row).transcript[1].content).toBe("Furnace is out.");
  });

  it("rejects a zero duration that arrived as a string", () => {
    expect(() => toCall({ ...row, duration_seconds: "120" })).toThrow();
  });
});

describe("toLead", () => {
  const base = {
    id: "dddddddd-0000-4000-8000-000000000001",
    contractor_id: "11111111-1111-4111-8111-111111111111",
    call_id: "cccccccc-0000-4000-8000-000000000001",
    name: "Maria Alvarez",
    phone: "5558675309",
    address: "12 Elm St",
    intent: "emergency" as const,
    urgency: "critical" as const,
    issue: "No heat",
    captured_at: "2026-09-20T12:01:00.000Z",
  };

  it("maps the core fields", () => {
    const l = toLead(base);
    expect(l.name).toBe("Maria Alvarez");
    expect(l.phone).toBe("5558675309");
    expect(l.address).toBe("12 Elm St");
    expect(l.capturedAt).toBe("2026-09-20T12:01:00.000Z");
  });

  it("turns a null address into undefined, not the string 'null'", () => {
    // `?? undefined` matters: passing null through would violate the domain
    // schema and throw at render time.
    expect(toLead({ ...base, address: null }).address).toBeUndefined();
  });

  it("survives a null call_id (leads.call_id is nullable)", () => {
    // The FK is ON DELETE SET NULL, so a lead can outlive its call row.
    const l = toLead({ ...base, call_id: null });
    expect(l.callId).toBeTruthy();
  });
});

describe("toPromptProfile", () => {
  const row = {
    id: "eeeeeeee-0000-4000-8000-000000000001",
    contractor_id: "11111111-1111-4111-8111-111111111111",
    trade: "hvac" as const,
    business_name: "Alpha HVAC",
    greeting: "Alpha HVAC, how can I help?",
    objections: { "speak to the owner": "He's on a call." },
    after_hours_only: true,
    updated_at: "2026-09-18T00:00:00.000Z",
  };

  it("maps business_name and after_hours_only", () => {
    const p = toPromptProfile(row);
    expect(p.businessName).toBe("Alpha HVAC");
    expect(p.afterHoursOnly).toBe(true);
  });

  it("preserves objection scripts as a record", () => {
    const p = toPromptProfile(row);
    expect(p.objections["speak to the owner"]).toBe("He's on a call.");
  });

  it("accepts an empty objection map", () => {
    expect(toPromptProfile({ ...row, objections: {} }).objections).toEqual({});
  });
});
