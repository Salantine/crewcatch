import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  TIER_LABEL,
  TRADE_LABEL,
  type ContractorTier,
  type Trade,
} from "@/lib/domain/schemas";
import { TRADE_TIER } from "@/lib/domain/schemas";

const TIER_ORDER: ContractorTier[] = [
  "emergency",
  "design_build",
  "maintenance",
  "specialized",
];

const TRADES_BY_TIER = TIER_ORDER.reduce<Record<ContractorTier, Trade[]>>(
  (acc, tier) => {
    acc[tier] = (Object.keys(TRADE_TIER) as Trade[]).filter(
      (trade) => TRADE_TIER[trade] === tier,
    );
    return acc;
  },
  { emergency: [], design_build: [], maintenance: [], specialized: [] },
);

/* Pipeline facts, stated as a process rather than a promise. */
const STEPS = [
  {
    n: "01",
    title: "Caller rings your line",
    body: "If nobody answers, or the call lands after hours, we take it. Your number keeps ringing first — you just stop losing the caller.",
  },
  {
    n: "02",
    title: "AI qualifies the job",
    body: "Trade-specific questions. An emergency HVAC call gets failure type, water risk, and address — not a generic \"how can I help?\"",
  },
  {
    n: "03",
    title: "You get the lead in 30 seconds",
    body: "Name, number, address, urgency, issue — pushed to your phone while the caller is still hanging up.",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero — no illustration, no gradient. A terminal-style status block
          reads as instrumentation rather than marketing decoration. */}
      <section className="border-b border-border-subtle">
        <div className="mx-auto max-w-7xl px-4 py-16 lg:py-24">
          <Badge tone="accent" className="mb-6">
            US &amp; Canada · Multi-timezone
          </Badge>

          <h1 className="max-w-4xl text-4xl font-black uppercase leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            You lost that job
            <br />
            <span className="text-accent-ink">because you were busy.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg text-fg-muted">
            The caller needed an answer. You were on a roof, in the truck, or
            closed at six. They called the next contractor on the list. CrewCatch
            answers that call, qualifies it, and texts it to you before you are
            back in the truck.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <Button size="lg" href="/roi">
              Calculate your missed revenue
            </Button>
            <Button size="lg" variant="secondary" href="/trades/hvac">
              See your trade
            </Button>
          </div>

          {/* Hard numbers, not adjectives. */}
          <dl className="mt-16 grid max-w-3xl grid-cols-1 gap-px border border-border-subtle bg-border-subtle sm:grid-cols-3">
            {[
              { label: "Answer rate", value: "100%", note: "of overflow calls" },
              { label: "Dispatch target", value: "<30s", note: "after hangup" },
              { label: "Setup fee", value: "$1,500", note: "one-time" },
            ].map((stat) => (
              <div key={stat.label} className="bg-surface-1 p-5">
                <dt className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
                  {stat.label}
                </dt>
                <dd className="metric mt-2 text-3xl font-bold text-accent-ink">
                  {stat.value}
                </dd>
                <p className="mt-1 text-xs text-fg-muted">{stat.note}</p>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Pipeline */}
      <section className="border-b border-border-subtle">
        <div className="mx-auto max-w-7xl px-4 py-16">
          <h2 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">
            How the call gets handled
          </h2>
          <ol className="mt-8 grid gap-px border border-border-subtle bg-border-subtle md:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.n} className="bg-surface-1 p-6">
                <p className="metric text-sm font-bold text-accent-ink">
                  {step.n}
                </p>
                <h3 className="mt-3 text-lg font-bold uppercase tracking-wide">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-fg-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Trades — organized by qualification tier, mirroring how the AI asks
          questions rather than a generic industry list. */}
      <section className="border-b border-border-subtle">
        <div className="mx-auto max-w-7xl px-4 py-16">
          <h2 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">
            Trades we qualify
          </h2>
          <p className="mt-2 max-w-2xl text-fg-muted">
            Question sets are built per trade. A concrete pour and a furnace
            call do not get the same script.
          </p>

          <div className="mt-8 space-y-px">
            {TIER_ORDER.map((tier) => (
              <div
                key={tier}
                className="grid gap-px bg-border-subtle md:grid-cols-4"
              >
                <div className="bg-surface-2 p-4">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-accent-ink">
                    {TIER_LABEL[tier]}
                  </h3>
                </div>
                <ul className="flex flex-wrap gap-2 bg-surface-1 p-4 md:col-span-3">
                  {TRADES_BY_TIER[tier].map((trade) => (
                    <li key={trade}>
                      <Link
                        href={`/trades/${trade}`}
                        className="inline-block border border-border-strong px-2.5 py-1 text-sm text-fg-muted transition-colors hover:border-accent hover:text-fg"
                      >
                        {TRADE_LABEL[trade]}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing — flat, two line items, no "contact us for a quote". */}
      <section>
        <div className="mx-auto max-w-7xl px-4 py-16">
          <div className="grid gap-px border border-border-subtle bg-border-subtle md:grid-cols-2">
            <div className="bg-surface-1 p-8">
              <p className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
                Setup, one-time
              </p>
              <p className="metric mt-3 text-5xl font-bold">$1,500</p>
              <p className="mt-3 text-sm text-fg-muted">
                Multi-region phone provisioning, trade-specific prompt
                engineering, and wiring into your existing notifications.
              </p>
            </div>
            <div className="bg-surface-1 p-8">
              <p className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
                Monthly
              </p>
              <p className="metric mt-3 text-5xl font-bold">$499</p>
              <p className="mt-3 text-sm text-fg-muted">
                Lead routing, uptime, prompt tuning from your transcripts, and
                multi-timezone handling. Overage tiers for seasonal spikes.
              </p>
            </div>
          </div>

          <div className="mt-10 border-l-2 border-accent bg-surface-1 p-6">
            <p className="text-sm text-fg">
              <strong className="font-bold uppercase tracking-wide">
                The math:
              </strong>{" "}
              one captured emergency repair covers the month. One landscape
              build covers the year.{" "}
              <Link href="/roi" className="font-semibold text-accent-ink underline">
                Run your numbers
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
