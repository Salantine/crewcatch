import { describe, expect, it } from "vitest";
import { classifyCall, tierForTrade } from "@/lib/domain/qualification";
import type { TranscriptMessage } from "@/lib/domain/schemas";

const msg = (content: string, role: TranscriptMessage["role"] = "caller") => ({
  role,
  content,
  timestampMs: 0,
});

describe("classifyCall", () => {
  it("flags an emergency from caller language", () => {
    const r = classifyCall(
      [msg("My furnace is out and it's freezing right now")],
      "hvac",
    );
    expect(r.intent).toBe("emergency");
    expect(r.urgency).toBe("critical");
    expect(r.matchedTerms.length).toBeGreaterThan(0);
  });

  it("reads the trade as urgency when the caller is merely vague", () => {
    const vague = [msg("I need someone to come take a look at something")];

    // A silent plumbing call still outranks a silent fencing call.
    expect(classifyCall(vague, "plumbing").urgency).toBe("high");
    expect(classifyCall(vague, "fencing").urgency).toBe("normal");
  });

  it("does not let trade default override an estimate request", () => {
    const r = classifyCall([msg("How much would a new AC unit cost?")], "hvac");
    expect(r.intent).toBe("estimate");
    expect(r.urgency).toBe("normal");
  });

  it("classifies recurring service as maintenance", () => {
    const r = classifyCall(
      [msg("I need this done every month, it's routine maintenance")],
      "pest_control",
    );
    expect(r.intent).toBe("maintenance");
  });

  it("matches contracted phrasing callers actually use", () => {
    // Regression: the term list held "it is freezing" but callers say
    // "it's freezing", so the most urgent phrase silently failed to match.
    const contracted = classifyCall([msg("It's freezing in here")], "hvac");
    const spelledOut = classifyCall([msg("it is freezing in here")], "hvac");
    expect(contracted.urgency).toBe("critical");
    expect(contracted.intent).toBe("emergency");
    expect(contracted.intent).toBe(spelledOut.intent);
  });

  it("matches across smart quotes and stray punctuation", () => {
    const r = classifyCall([msg("Furnace is down — it’s freezing!")], "hvac");
    expect(r.urgency).toBe("critical");
  });

  it("detects a wrong number and does not qualify it as a lead", () => {
    const r = classifyCall([msg("Oh sorry, wrong number")], "hvac");
    expect(r.intent).toBe("wrong_number");
    expect(r.urgency).toBe("low");
  });

  it("does not invent an intent from an empty transcript", () => {
    const r = classifyCall([], "hvac");
    expect(r.matchedTerms).toEqual([]);
    expect(r.intent).toBe("consultation");
    expect(r.urgency).toBe("low");
  });

  it("ignores agent speech when scoring intent", () => {
    // The agent repeating "no heat" must not manufacture an emergency.
    const r = classifyCall(
      [msg("I wanted to talk to the owner"), msg("Is the furnace broken?", "agent")],
      "hvac",
    );
    expect(r.intent).toBe("consultation");
  });

  it("only reads caller turns, not empty agent turns", () => {
    const r = classifyCall([msg("", "agent")], "hvac");
    expect(r.intent).toBe("consultation");
  });
});

describe("tierForTrade", () => {
  it("maps each trade to its tier", () => {
    expect(tierForTrade("hvac")).toBe("emergency");
    expect(tierForTrade("landscaping")).toBe("design_build");
    expect(tierForTrade("cleaning")).toBe("maintenance");
    expect(tierForTrade("concrete")).toBe("specialized");
  });
});
