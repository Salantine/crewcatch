import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  TIER_LABEL,
  TIER_QUESTIONS,
  TRADE_TIER,
  type Trade,
} from "@/lib/domain/schemas";
import { ALL_TRADES, isTrade, tradeLabel } from "@/lib/content/trades";

/**
 * Every trade page is statically generated at build time. `params` is a Promise
 * in Next 16 — synchronous access was removed in v16 after the v15
 * compatibility window.
 */
export function generateStaticParams() {
  return ALL_TRADES.map((trade) => ({ trade }));
}

type PageProps = { params: Promise<{ trade: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { trade: slug } = await params;
  if (!isTrade(slug)) return { title: "Trade not found" };

  const data = await import(`@/content/trades/${slug}.mdx`).catch(() => null);
  if (!data) {
    // Only the five authored trades have a long-form MDX page; the rest render
    // from tier data alone. That is intentional, not a missing file.
    return {
      title: `${tradeLabel(slug)} Call Capture`,
      description: `After-hours and missed-call capture for ${tradeLabel(slug).toLowerCase()} contractors.`,
    };
  }

  const fm = data.frontmatter as { title?: string; metaDescription?: string };
  return {
    title: fm.title ?? tradeLabel(slug),
    description: fm.metaDescription ?? undefined,
  };
}

export default async function TradePage({ params }: PageProps) {
  const { trade: slug } = await params;
  if (!isTrade(slug)) notFound();

  const trade = slug as Trade;
  const tier = TRADE_TIER[trade];
  const questions = TIER_QUESTIONS[tier];

  // Destructure to a COMPONENT reference. `{body}` would render the function
  // object as a child — MDX's default export must be used as <Body />.
  const Body = (await import(`@/content/trades/${slug}.mdx`).catch((e) => {
    // Only 5 of 12 trades have a long-form MDX page; the rest render from tier
    // data alone. That is intentional, not a missing file. Anything else is a
    // real error and must not be silently swallowed.
    if (!/Cannot find module|Failed to resolve/i.test(String(e))) throw e;
    return null;
  }))?.default;

  return (
    <article className="mx-auto max-w-4xl px-4 py-14">
      <Badge tone="accent">{TIER_LABEL[tier]}</Badge>

      <h1 className="mt-4 text-3xl font-black uppercase tracking-tight sm:text-5xl">
        {tradeLabel(trade)} call capture
      </h1>

      <p className="mt-4 max-w-2xl text-lg text-fg-muted">
        Calls your office cannot answer get qualified on{" "}
        {tradeLabel(trade).toLowerCase()} specifics — not a generic script —
        and pushed to you in under 30 seconds.
      </p>

      {Body && (
        <div className="mt-8 space-y-4 text-fg-muted [&_strong]:text-fg">
          <Body />
        </div>
      )}

      <section className="mt-12">
        <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
          What the agent asks
        </h2>
        <ol className="mt-4 grid gap-px bg-border-subtle">
          {questions.map((question, i) => (
            <li key={question} className="flex gap-4 bg-surface-1 p-4">
              <span className="metric text-sm font-bold text-accent-ink">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-fg">{question}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-10 flex flex-wrap gap-4">
        <Button href="/roi">Calculate your ROI</Button>
        <Button variant="secondary" href="/contact">
          Talk to us
        </Button>
      </div>

      <nav aria-label="Other trades" className="mt-12 border-t border-border-subtle pt-6">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
          Other trades
        </h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {ALL_TRADES.filter((t) => t !== trade).map((t) => (
            <li key={t}>
              <Link
                href={`/trades/${t}`}
                className="inline-block border border-border-strong px-2.5 py-1 text-sm text-fg-muted hover:border-accent hover:text-fg"
              >
                {tradeLabel(t)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </article>
  );
}
