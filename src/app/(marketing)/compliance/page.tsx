import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "TCPA & CASL Compliance",
  description:
    "How CrewCatch handles consent, recording disclosure, and opt-out requirements across the US and Canada.",
};

const PRINCIPLES = [
  {
    title: "Inbound only",
    body: "We answer calls that come TO you. CrewCatch makes no outbound marketing calls, so the TCPA's prior-consent requirement for telemarketing does not apply to the AI agent.",
  },
  {
    title: "Announced recording",
    body: "Where a call is recorded, the agent states that the call may be recorded and transcribed at the start of the conversation. Callers hear it before the substantive call begins.",
  },
  {
    title: "Consent to be contacted",
    body: "The agent asks permission to follow up and confirms the callback number back to the caller before ending the call. The consent and the number are both stored on the lead record.",
  },
  {
    title: "Opt-out honoured",
    body: "A caller can ask not to be called again at any point. The agent confirms the request, and the lead is flagged do-not-contact so it is not re-dialled.",
  },
  {
    title: "Data residency",
    body: "US and Canadian callers are handled under their respective regimes. CASL requires express or implied consent with a clear identification of the sender; the agent identifies the business by name in its greeting.",
  },
  {
    title: "Retention",
    body: "Transcripts are retained per contractor. Region-specific retention requirements vary, and the operational SOPs are maintained per jurisdiction rather than globally.",
  },
];

export default function CompliancePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <Badge tone="accent">Compliance</Badge>

      <h1 className="mt-4 text-3xl font-black uppercase tracking-tight sm:text-5xl">
        TCPA and CASL
      </h1>
      <p className="mt-4 max-w-2xl text-fg-muted">
        Calling a contractor is not the same as cold-calling someone. Because
        CrewCatch only answers inbound calls, the consent rules that govern
        outbound telemarketing largely do not apply — but several obligations
        still do, and we build to them.
      </p>

      <div className="mt-10 border-l-2 border-accent bg-surface-1 p-5">
        <p className="text-sm text-fg">
          <strong className="font-bold uppercase tracking-wide">Note:</strong>{" "}
          this page describes how the product is built to operate. It is not
          legal advice. Compliance obligations vary by state, province, and
          campaign. Confirm your position with counsel before you rely on any
          of it.
        </p>
      </div>

      <section className="mt-12">
        <h2 className="text-xl font-black uppercase tracking-tight">
          How the agent is built
        </h2>
        <dl className="mt-6 space-y-px bg-border-subtle">
          {PRINCIPLES.map((item, i) => (
            <div key={item.title} className="grid gap-px bg-border-subtle sm:grid-cols-4">
              <div className="bg-surface-1 p-4">
                <span className="metric text-sm font-bold text-accent-ink">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="bg-surface-1 p-4 sm:col-span-3">
                <dt className="font-bold uppercase tracking-wide">{item.title}</dt>
                <dd className="mt-1 text-sm text-fg-muted">{item.body}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-black uppercase tracking-tight">
          What you should still do
        </h2>
        <ul className="mt-4 space-y-2 text-fg-muted">
          {[
            "Keep your own record of consent for any messaging you send separately.",
            "Review state-level rules — some are stricter than the federal baseline.",
            "Do not use the captured number for marketing the caller did not ask for.",
            "Tell us if your jurisdiction has requirements we have not accounted for.",
          ].map((item) => (
            <li key={item} className="flex gap-3">
              <span aria-hidden="true" className="font-mono text-urgency-normal">
                +
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 flex flex-wrap gap-4">
        <Button href="/contact">Ask about your region</Button>
        <Button variant="secondary" href="/pricing">
          See pricing
        </Button>
      </div>
    </div>
  );
}
