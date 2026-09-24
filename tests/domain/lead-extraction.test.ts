import { describe, expect, it } from "vitest";
import { extractLead } from "@/lib/domain/lead-extraction";
import { CallCompletedEvent, type TranscriptMessage } from "@/lib/domain/schemas";

const msg = (content: string, role: TranscriptMessage["role"] = "caller") => ({
  role,
  content,
  timestampMs: 0,
});

const event = (transcript: TranscriptMessage[]) =>
  CallCompletedEvent.parse({
    externalCallId: "ext_1",
    startedAt: "2026-09-01T10:00:00.000Z",
    endedAt: "2026-09-01T10:02:00.000Z",
    durationSeconds: 120,
    callerNumber: "+15551230000",
    transcript,
    metadata: {},
  });

const caller = (text: string) => [
  msg("Thanks for calling."),
  msg(text),
];

describe("extractLead", () => {
  it("extracts a complete lead", () => {
    const r = extractLead(
      event(caller("This is Maria Alvarez, my number is 555-867-5309. The furnace is out and it's freezing.")),
      { trade: "hvac" },
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lead.name).toBe("Maria Alvarez");
    expect(r.lead.phone).toBe("5558675309");
    expect(r.lead.urgency).toBe("critical");
    expect(r.lead.intent).toBe("emergency");
  });

  it("fails rather than returning a partial lead when the name is missing", () => {
    const r = extractLead(
      event(caller("Call me back at 555-867-5309, the AC is broken.")),
      { trade: "hvac" },
    );
    expect(r).toEqual({ ok: false, reason: "missing_name" });
  });

  it("fails rather than returning a partial lead when the phone is missing", () => {
    const r = extractLead(
      event(caller("This is Dale Kovac, the water heater is leaking badly.")),
      { trade: "plumbing" },
    );
    expect(r).toEqual({ ok: false, reason: "missing_phone" });
  });

  it("rejects a wrong number instead of qualifying it", () => {
    const r = extractLead(
      event(caller("Sorry, wrong number. This is Jim Reiner, 555-867-5309.")),
      { trade: "hvac" },
    );
    expect(r).toEqual({ ok: false, reason: "wrong_number" });
  });

  it("rejects an empty transcript", () => {
    expect(extractLead(event([]), { trade: "hvac" })).toEqual({
      ok: false,
      reason: "no_transcript",
    });
  });

  it("rejects a transcript where only the agent spoke", () => {
    expect(
      extractLead(event([msg("Thanks for calling Northern HVAC.", "agent")]), {
        trade: "hvac",
      }),
    ).toEqual({ ok: false, reason: "empty_caller_speech" });
  });

  it("does not mistake filler phrases for a name", () => {
    const r = extractLead(
      event(caller("I'm looking for someone, my number is 5558675309.")),
      { trade: "hvac" },
    );
    expect(r).toEqual({ ok: false, reason: "missing_name" });
  });

  it("prefers the corrected number when the caller revises it", () => {
    const r = extractLead(
      event(
        caller(
          "This is Sam Ortiz, 555-111-2222 — wait, it's 555-333-4444. The pool pump is broken.",
        ),
      ),
      { trade: "pools" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lead.phone).toBe("5553334444");
  });

  it("honours a voice-agent classification over the keyword guess", () => {
    const r = extractLead(
      event(caller("This is Ana Ruiz, 5558675309. I'd like a quote for a new furnace.")),
      { trade: "hvac", intent: "estimate", urgency: "normal" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lead.intent).toBe("estimate");
    expect(r.lead.urgency).toBe("normal");
  });

  it("always supplies an issue string so the table never renders a blank cell", () => {
    const r = extractLead(
      event(caller("This is Leo Park, 5558675309.")),
      { trade: "fencing" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lead.issue.length).toBeGreaterThan(0);
  });
});
