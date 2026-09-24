"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import {
  TIER_LABEL,
  TRADE_LABEL,
  TRADE_TIER,
  type ContractorTier,
  type DispatchChannel,
  type Trade,
} from "@/lib/domain/schemas";

const TRADES = Object.keys(TRADE_LABEL) as Trade[];
const TIERS = Object.keys(TIER_LABEL) as ContractorTier[];
const CHANNELS: DispatchChannel[] = ["sms", "email", "crm"];

export function OnboardForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [trade, setTrade] = useState<Trade>("hvac");
  const [tier, setTier] = useState<ContractorTier>(TRADE_TIER.hvac);
  const [regions, setRegions] = useState("");
  const [channels, setChannels] = useState<DispatchChannel[]>(["sms"]);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  function pickTrade(next: Trade) {
    setTrade(next);
    setTier(TRADE_TIER[next]); // tier follows the trade, editable after
  }

  function toggleChannel(channel: DispatchChannel) {
    setChannels((prev) =>
      prev.includes(channel)
        ? prev.filter((c) => c !== channel)
        : [...prev, channel],
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");
    setError(null);

    const regionList = regions
      .split(",")
      .map((r) => r.trim().toUpperCase())
      .filter(Boolean);

    try {
      const res = await fetch("/api/admin/contractors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          primaryTrade: trade,
          tier,
          regions: regionList,
          dispatchChannels: channels,
          ownerEmail: ownerEmail.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string; detail?: string }
          | null;
        throw new Error(
          body?.detail ?? body?.error ?? `Request failed (${res.status})`,
        );
      }
      setStatus("done");
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Field
        label="Business name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Northern Mechanical"
      />

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
          Primary trade
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {TRADES.map((t) => (
            <Button
              key={t}
              type="button"
              size="sm"
              variant={t === trade ? "primary" : "secondary"}
              aria-pressed={t === trade}
              onClick={() => pickTrade(t)}
            >
              {TRADE_LABEL[t]}
            </Button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
          Qualification tier
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {TIERS.map((t) => (
            <Button
              key={t}
              type="button"
              size="sm"
              variant={t === tier ? "primary" : "secondary"}
              aria-pressed={t === tier}
              onClick={() => setTier(t)}
            >
              {TIER_LABEL[t]}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-fg-muted">
          Sets the question set the agent asks.
        </p>
      </fieldset>

      <Field
        label="Regions"
        required
        value={regions}
        onChange={(e) => setRegions(e.target.value)}
        placeholder="US-CO, US-MT"
        hint="Comma-separated. One number is provisioned per region."
      />

      <fieldset>
        <legend className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
          Dispatch channels
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CHANNELS.map((c) => (
            <Button
              key={c}
              type="button"
              size="sm"
              variant={channels.includes(c) ? "primary" : "secondary"}
              aria-pressed={channels.includes(c)}
              onClick={() => toggleChannel(c)}
            >
              {c.toUpperCase()}
            </Button>
          ))}
        </div>
      </fieldset>

      <Field
        label="Owner email (optional)"
        type="email"
        value={ownerEmail}
        onChange={(e) => setOwnerEmail(e.target.value)}
        placeholder="owner@example.com"
        hint="The owner signs in with a magic link once the contractor exists."
      />

      {error && (
        <p role="alert" className="border border-urgency-critical bg-surface-1 p-3 text-sm text-urgency-critical">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={status === "saving" || name.trim() === ""}>
        {status === "saving" ? "Provisioning…" : "Onboard contractor"}
      </Button>
    </form>
  );
}
