import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
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
        <dl className="mt-4 grid gap-px bg-border-subtle sm:grid-cols-2">
          {[
            ["Business", contractor.name],
            ["Primary trade", TRADE_LABEL[contractor.primaryTrade]],
            ["Tier", TIER_LABEL[contractor.tier]],
            ["Greeting", prompt.greeting],
          ].map(([label, value]) => (
            <div key={label} className="bg-surface-1 p-4">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
                {label}
              </dt>
              <dd className="mt-1 text-sm">{value}</dd>
            </div>
          ))}
        </dl>
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
        <dl className="mt-4 grid gap-px bg-border-subtle sm:grid-cols-2">
          <div className="bg-surface-1 p-4">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
              Setup fee
            </dt>
            <dd className="metric mt-1 text-2xl font-bold">
              {formatUsd(SETUP_FEE)}
            </dd>
            <p className="mt-1 text-xs text-fg-muted">one-time, already paid</p>
          </div>
          <div className="bg-surface-1 p-4">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
              Monthly retainer
            </dt>
            <dd className="metric mt-1 text-2xl font-bold">
              {formatUsd(MONTHLY_RETAINER)}
            </dd>
            <p className="mt-1 text-xs text-fg-muted">includes usage baseline</p>
          </div>
        </dl>
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
