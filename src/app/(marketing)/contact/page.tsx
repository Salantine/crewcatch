import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Talk to CrewCatch about capturing missed and after-hours calls for your trade.",
};

const STEPS = [
  "Tell us your trade and the regions you cover.",
  "We walk through the call flow and the questions your callers would get.",
  "You get the number, the prompt, and the dispatch targets before anything is signed.",
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <p className="text-[11px] font-bold uppercase tracking-wider text-accent-ink">
        Contact
      </p>
      <h1 className="mt-3 text-3xl font-black uppercase tracking-tight sm:text-5xl">
        Talk to a person
      </h1>
      <p className="mt-4 text-fg-muted">
        This one is not automated. If we are not a fit for what you run, we
        will say so.
      </p>

      <div className="mt-10 grid gap-px border border-border-subtle bg-border-subtle sm:grid-cols-2">
        <div className="bg-surface-1 p-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
            Email
          </h2>
          <a
            href="mailto:sales@crewcatch.ai"
            className="metric mt-3 inline-block text-lg text-accent-ink underline underline-offset-2 hover:text-fg"
          >
            sales@crewcatch.ai
          </a>
          <p className="mt-2 text-sm text-fg-muted">
            We reply within one business day.
          </p>
        </div>
        <div className="bg-surface-1 p-6">
          <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
            Phone
          </h2>
          <a
            href="tel:+18005550142"
            className="metric mt-3 inline-block text-lg text-accent-ink underline underline-offset-2 hover:text-fg"
          >
            +1 (800) 555-0142
          </a>
          <p className="mt-2 text-sm text-fg-muted">
            Mon–Fri, 8am–6pm ET. Emergencies go through your CrewCatch line.
          </p>
        </div>
      </div>

      <section className="mt-12">
        <h2 className="text-xl font-black uppercase tracking-tight">
          What happens next
        </h2>
        <ol className="mt-5 space-y-px bg-border-subtle">
          {STEPS.map((step, i) => (
            <li key={step} className="flex gap-4 bg-surface-1 p-4">
              <span className="metric text-sm font-bold text-accent-ink">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-fg">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-black uppercase tracking-tight">
          Or send it here
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-fg-muted">
          We read every one of these. The more concrete the numbers, the more
          useful the first reply.
        </p>
        <div className="mt-6 max-w-2xl">
          <ContactForm />
        </div>
      </section>

      <div className="mt-10 flex flex-wrap gap-4">
        <Button href="/roi">Run the numbers first</Button>
        <Button variant="secondary" href="/pricing">
          See pricing
        </Button>
      </div>
    </div>
  );
}
