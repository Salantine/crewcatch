import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import type { LegalSection } from "@/lib/content/legal";

/**
 * Renders a legal page from structured sections.
 *
 * Sections flagged `requiresLegalReview` carry a visible marker. That is
 * deliberate: an unmarked but incomplete policy reads as finished and gets
 * relied on. A visible marker says "this is not settled".
 */
export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: LegalSection[];
}) {
  const reviewCount = sections.filter((s) => s.requiresLegalReview).length;

  return (
    <article className="mx-auto max-w-3xl px-4 py-14">
      <p className="text-[11px] font-bold uppercase tracking-wider text-accent-ink">
        Legal
      </p>
      <h1 className="mt-3 text-3xl font-black uppercase tracking-tight sm:text-4xl">
        {title}
      </h1>
      <p className="mt-4 text-fg-muted">{intro}</p>

      {reviewCount > 0 && (
        <div
          role="note"
          className="mt-8 border-l-2 border-urgency-high bg-surface-1 p-5"
        >
          <Badge tone="high" className="mb-2">
            Draft — not yet reviewed
          </Badge>
          <p className="text-sm text-fg-muted">
            This page describes how the product actually behaves, so counsel
            has an accurate starting point. {reviewCount} section
            {reviewCount === 1 ? "" : "s"} below still{" "}
            {reviewCount === 1 ? "requires" : "require"} a legal decision before
            this is published to customers. It is not legal advice and should
            not be relied on as written.
          </p>
        </div>
      )}

      <div className="mt-10 space-y-px bg-border-subtle">
        {sections.map((section, i) => (
          <section key={section.id} className="bg-surface-1 p-5">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wider">
                <span className="metric mr-2 text-accent-ink">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {section.heading}
              </h2>
              {section.requiresLegalReview && (
                <span className="text-[11px] font-semibold uppercase tracking-wider text-urgency-high">
                  Needs review
                </span>
              )}
            </div>
            {section.body.map((paragraph) => (
              <p key={paragraph} className="mt-2 text-sm leading-relaxed text-fg-muted">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>

      <p className="mt-10 text-sm text-fg-muted">
        <Link href="/contact" className="font-semibold text-accent-ink underline">
          Contact us
        </Link>{" "}
        with a question about how your data is handled.
      </p>
    </article>
  );
}
