"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

export interface PromptDraft {
  businessName: string;
  greeting: string;
  afterHoursOnly: boolean;
  objections: Record<string, string>;
}

/**
 * Edits a contractor's prompt profile.
 *
 * The monthly retainer literally sells "prompt optimization from your
 * transcripts" — this is where that promise becomes actionable. Saving calls
 * the admin API, which writes the row AND pushes the change to the voice
 * agent, so the portal never shows a prompt the agent is not actually using.
 */
export function PromptEditor({
  contractorId,
  initial,
}: {
  contractorId: string;
  initial: PromptDraft;
}) {
  const router = useRouter();
  const [greeting, setGreeting] = useState(initial.greeting);
  const [afterHoursOnly, setAfterHoursOnly] = useState(initial.afterHoursOnly);
  const [pairs, setPairs] = useState<[string, string][]>(
    Object.entries(initial.objections ?? {}),
  );
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  function updatePair(index: number, side: 0 | 1, value: string) {
    setPairs((prev) =>
      prev.map((pair, i) => {
        if (i !== index) return pair;
        // Replace one side, keep the other.
        return side === 0 ? [value, pair[1]] : [pair[0], value];
      }),
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setError(null);

    const objections = Object.fromEntries(
      pairs.filter(([k, v]) => k.trim() && v.trim()),
    );

    try {
      const res = await fetch(`/api/admin/contractors/${contractorId}/prompt`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ greeting, afterHoursOnly, objections }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string; detail?: string }
          | null;
        throw new Error(body?.detail ?? body?.error ?? `Failed (${res.status})`);
      }
      setStatus("saved");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <Field
        label="Greeting"
        value={greeting}
        onChange={(e) => setGreeting(e.target.value)}
        hint="What the agent says first. Lead with the business name."
        required
      />

      <div className="flex items-center gap-3">
        <input
          id="after-hours-only"
          type="checkbox"
          checked={afterHoursOnly}
          onChange={(e) => setAfterHoursOnly(e.target.checked)}
          className="h-5 w-5 accent-accent"
        />
        <label
          htmlFor="after-hours-only"
          className="text-sm font-semibold uppercase tracking-wide"
        >
          After-hours and overflow only
        </label>
      </div>

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
          Objection handling
        </legend>
        <p className="mt-1 text-xs text-fg-muted">
          If the caller says the phrase on the left, the agent replies with the
          text on the right.
        </p>

        <div className="mt-3 space-y-2">
          {pairs.map(([key, value], i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-2">
              <input
                aria-label={`Trigger phrase ${i + 1}`}
                value={key}
                onChange={(e) => updatePair(i, 0, e.target.value)}
                placeholder="speak to the owner"
                className="h-11 border border-border-strong bg-surface-1 px-3 text-sm"
              />
              <input
                aria-label={`Agent reply ${i + 1}`}
                value={value}
                onChange={(e) => updatePair(i, 1, e.target.value)}
                placeholder="The owner is on a call, I'll take your details."
                className="h-11 border border-border-strong bg-surface-1 px-3 text-sm"
              />
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => setPairs((prev) => [...prev, ["", ""]])}
        >
          Add phrase
        </Button>
      </fieldset>

      {error && (
        <p role="alert" className="border border-urgency-critical bg-surface-1 p-3 text-sm text-urgency-critical">
          {error}
        </p>
      )}

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={status === "saving"}>
          {status === "saving" ? "Saving…" : "Save and push to agent"}
        </Button>
        {status === "saved" && (
          <span role="status" className="text-sm text-urgency-normal">
            Saved and pushed.
          </span>
        )}
      </div>
    </form>
  );
}
