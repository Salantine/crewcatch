import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { MONTHLY_RETAINER, SETUP_FEE, formatUsd } from "@/lib/domain/roi";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "$1,500 setup, $499/month. Multi-region phone provisioning, trade-specific prompts, and lead routing.",
};

const INCLUDED = [
  "Missed, after-hours, and overflow call capture",
  "Trade-specific qualification questions",
  "Objection handling tuned to your trade",
  "SMS, email, or CRM dispatch in under 30 seconds",
  "Prompt optimization from your call transcripts",
  "Multi-timezone handling across US & Canada",
  "Spam filtering and area-code aware routing",
];

const NOT_INCLUDED = [
  "Voicemail replacement for your office line",
  "Live answering by a human operator",
  "Outbound cold calling",
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <p className="text-[11px] font-bold uppercase tracking-wider text-accent-ink">
        Pricing
      </p>
      <h1 className="mt-3 text-3xl font-black uppercase tracking-tight sm:text-5xl">
        Two line items. No tiers, no seats.
      </h1>
      <p className="mt-4 max-w-2xl text-fg-muted">
        You are not buying software licenses. You are paying for calls that get
        answered and leads that get to you.
      </p>

      <div className="mt-10 grid gap-px border border-border-subtle bg-border-subtle md:grid-cols-2">
        <div className="bg-surface-1 p-8">
          <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
            Setup fee
          </h2>
          <p className="metric mt-4 text-5xl font-bold">{formatUsd(SETUP_FEE)}</p>
          <p className="mt-1 text-sm text-fg-muted">one-time</p>
          <ul className="mt-6 space-y-2 text-sm text-fg-muted">
            <li>Multi-region number provisioning</li>
            <li>Prompt engineering for your trade and region</li>
            <li>Dispatch wired to your existing systems</li>
          </ul>
        </div>

        <div className="bg-surface-1 p-8">
          <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
            Monthly retainer
          </h2>
          <p className="metric mt-4 text-5xl font-bold">
            {formatUsd(MONTHLY_RETAINER)}
          </p>
          <p className="mt-1 text-sm text-fg-muted">per month</p>
          <ul className="mt-6 space-y-2 text-sm text-fg-muted">
            <li>Lead routing and server uptime</li>
            <li>Prompt tuning from transcripts</li>
            <li>Multi-timezone handling</li>
            <li>Overage tiers for seasonal spikes</li>
          </ul>
        </div>
      </div>

      <div className="mt-10 grid gap-px border border-border-subtle bg-border-subtle md:grid-cols-2">
        <div className="bg-surface-1 p-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
            Included
          </h2>
          <ul className="mt-4 space-y-2">
            {INCLUDED.map((item) => (
              <li key={item} className="flex gap-3 text-sm">
                <span aria-hidden="true" className="font-mono text-urgency-normal">
                  +
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-surface-1 p-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
            Not included
          </h2>
          <ul className="mt-4 space-y-2">
            {NOT_INCLUDED.map((item) => (
              <li key={item} className="flex gap-3 text-sm">
                <span aria-hidden="true" className="font-mono text-fg-subtle">
                  −
                </span>
                <span className="text-fg-muted">{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-fg-muted">
            If you need a human to pick up, we are the wrong tool. Say so and we
            will point you somewhere better.
          </p>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap gap-4">
        <Button size="lg" href="/roi">
          Run the numbers
        </Button>
        <Button size="lg" variant="secondary" href="/contact">
          Talk to us
        </Button>
      </div>

      <p className="mt-8 max-w-2xl text-sm text-fg-muted">
        Most contractors are over $1,000 behind on a single missed job.{" "}
        <Link href="/roi" className="font-semibold text-accent-ink underline">
          Check yours
        </Link>
        .
      </p>
    </div>
  );
}
