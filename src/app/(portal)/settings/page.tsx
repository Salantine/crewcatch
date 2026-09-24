import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { StatGrid } from "@/components/ui/StatGrid";
import { formatUsd, MONTHLY_RETAINER, SETUP_FEE } from "@/lib/domain/roi";
import { getPortalData } from "@/lib/portal/data";
import { TIER_LABEL, TRADE_LABEL } from "@/lib/domain/schemas";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { contractor, prompt, demo } = await getPortalData();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-black uppercase tracking-tight">Settings</h1>

      {demo && (
        <p className="mt-4 border-l-2 border-urgency-high bg-surface-1 p-3 text-sm text-fg-muted">
          Demo mode. Nothing here is saved, and these are not your real
          settings.
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
          Account
        </h2>
        <StatGrid
          className="mt-4 sm:grid-cols-2"
          items={[
            { label: "Business", value: contractor.name },
            { label: "Primary trade", value: TRADE_LABEL[contractor.primaryTrade] },
            { label: "Tier", value: TIER_LABEL[contractor.tier] },
            { label: "Greeting", value: prompt.greeting },
          ]}
        />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
          Dispatch channels
        </h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {contractor.dispatchChannels.map((channel) => (
            <li key={channel}>
              <Badge tone="accent">{channel.toUpperCase()}</Badge>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-fg-muted">
          Every captured lead is pushed to these within 30 seconds of hangup.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
          Billing
        </h2>
        <StatGrid
          className="mt-4 sm:grid-cols-2"
          items={[
            {
              label: "Setup fee",
              value: <span className="metric text-2xl font-bold">{formatUsd(SETUP_FEE)}</span>,
              note: "one-time, already paid",
            },
            {
              label: "Monthly retainer",
              value: <span className="metric text-2xl font-bold">{formatUsd(MONTHLY_RETAINER)}</span>,
              note: "includes usage baseline",
            },
          ]}
        />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
          Changes
        </h2>
        <p className="mt-3 text-sm text-fg-muted">
          Editing settings writes to <code className="metric">prompt_profiles</code>{" "}
          and <code className="metric">phone_numbers</code>, then re-renders the
          voice agent prompt. Not wired in this build — see{" "}
          <code className="metric">TODO[CRITICAL]</code> in{" "}
          <code className="metric">src/lib/portal/data.ts</code>.
        </p>
      </section>
    </div>
  );
}
