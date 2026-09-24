import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { renderPrompt } from "@/lib/domain/prompt-render";
import { getPortalData } from "@/lib/portal/data";
import { TIER_QUESTIONS, TRADE_LABEL, TRADE_TIER } from "@/lib/domain/schemas";

export const metadata: Metadata = { title: "Prompt" };

export default async function PromptsPage() {
  const { prompt } = await getPortalData();
  const rendered = renderPrompt(prompt, prompt.trade);
  const tier = TRADE_TIER[prompt.trade];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black uppercase tracking-tight">
          Voice agent prompt
        </h1>
        {prompt.afterHoursOnly && <Badge tone="accent">After hours only</Badge>}
      </div>

      <p className="mt-2 max-w-2xl text-sm text-fg-muted">
        This is the exact system prompt running on the voice agent. Prompt
        changes are part of your monthly retainer — we tune it from your call
        transcripts, and you see every change.
      </p>

      <div className="mt-6 grid gap-px bg-border-subtle sm:grid-cols-3">
        <div className="bg-surface-1 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            Business
          </p>
          <p className="mt-1 font-semibold">{prompt.businessName}</p>
        </div>
        <div className="bg-surface-1 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            Trade
          </p>
          <p className="mt-1 font-semibold">{TRADE_LABEL[prompt.trade]}</p>
        </div>
        <div className="bg-surface-1 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            Qualification tier
          </p>
          <p className="mt-1 font-semibold capitalize">{tier.replace("_", " ")}</p>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
          Qualification questions
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Set by tier, not per contractor. Adding a trade adds a question set — it
          does not need custom code.
        </p>
        <ol className="mt-4 space-y-px bg-border-subtle">
          {TIER_QUESTIONS[tier].map((q, i) => (
            <li key={q} className="flex gap-4 bg-surface-1 p-3">
              <span className="metric text-sm font-bold text-accent-ink">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{q}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
          Objection handling
        </h2>
        <dl className="mt-4 space-y-px bg-border-subtle">
          {Object.entries(prompt.objections).map(([trigger, response]) => (
            <div key={trigger} className="bg-surface-1 p-4">
              <dt className="text-xs font-bold uppercase tracking-wide text-accent-ink">
                If the caller says &ldquo;{trigger}&rdquo;
              </dt>
              <dd className="mt-1 text-sm text-fg-muted">&ldquo;{response}&rdquo;</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
          Rendered system prompt
        </h2>
        {/* tabIndex + role: a scrollable region must be keyboard-reachable, or
            a keyboard-only user cannot read the rest of the prompt. */}
        <pre
          tabIndex={0}
          role="region"
          aria-label="Rendered voice agent system prompt"
          className="mt-4 max-h-96 overflow-auto border border-border-subtle bg-surface-1 p-4 text-sm leading-relaxed text-fg-muted"
        >
          {rendered.system}
        </pre>
      </section>
    </div>
  );
}
