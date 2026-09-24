"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { TRADE_LABEL, type Trade } from "@/lib/domain/schemas";

const TRADES = Object.keys(TRADE_LABEL) as Trade[];

/**
 * Contact form.
 *
 * CrewCatch's entire pitch is "we stop you losing leads to voicemail" — and
 * the company's own contact page was static text that captured nothing. A
 * prospect who wanted to reach CrewCatch had to compose an email by hand and
 * hope it was read.
 *
 * Submits to /api/contact, which validates server-side and logs the enquiry
 * with a reference. The form never pretends success on a failed request.
 */
export function ContactForm() {
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [trade, setTrade] = useState<Trade>("hvac");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setError(null);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          business: business.trim(),
          email: email.trim(),
          phone: phone.trim(),
          trade,
          message: message.trim(),
          // Always empty for a human; bots fill hidden fields.
          company_url: "",
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string; detail?: string }
          | null;
        throw new Error(body?.detail ?? body?.error ?? `Failed (${res.status})`);
      }

      const body = (await res.json()) as { reference?: string };
      setReference(body.reference ?? null);
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <div
        role="status"
        className="border border-urgency-normal bg-surface-1 p-6"
      >
        <h2 className="text-lg font-bold uppercase tracking-wide text-urgency-normal">
          Message received
        </h2>
        <p className="mt-2 text-sm text-fg-muted">
          We reply within one business day. If it is urgent, call the number
          above.
        </p>
        {reference && (
          <p className="metric mt-3 text-xs text-fg-muted">
            Reference: {reference}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Your name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
        <Field
          label="Business"
          required
          value={business}
          onChange={(e) => setBusiness(e.target.value)}
          autoComplete="organization"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <Field
          label="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          hint="Optional, but faster."
        />
      </div>

      {/* A <legend> alone does not name a <select> — axe flagged it as
          `select-name`. The label is explicitly associated via htmlFor. */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="contact-trade"
          className="text-xs font-semibold uppercase tracking-wider text-fg-muted"
        >
          Trade
        </label>
        <select
          id="contact-trade"
          value={trade}
          onChange={(e) => setTrade(e.target.value as Trade)}
          className="h-11 w-full border border-border-strong bg-surface-1 px-3 text-sm"
        >
          {TRADES.map((t) => (
            <option key={t} value={t}>
              {TRADE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="contact-message"
          className="text-xs font-semibold uppercase tracking-wider text-fg-muted"
        >
          What are you losing calls on?
        </label>
        <textarea
          id="contact-message"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="border border-border-strong bg-surface-1 p-3 text-sm"
          placeholder="Roughly how many calls a week do you miss, and what are they worth?"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="border border-urgency-critical bg-surface-1 p-3 text-sm text-urgency-critical"
        >
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={status === "sending" || !name.trim() || !business.trim() || !email.trim()}
      >
        {status === "sending" ? "Sending…" : "Send"}
      </Button>
    </form>
  );
}
