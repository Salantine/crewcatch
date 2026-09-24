"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

/**
 * Magic-link sign-in. Supabase sends a one-time link; there is no password to
 * phish, which matters for contractors on job sites who will inevitably reuse
 * credentials they should not.
 *
 * If Supabase is not configured the form is disabled and the missing-setup
 * reason is shown, rather than throwing a raw client error at the user.
 */
function LoginForm() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const next = searchParams.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const configured =
    reason !== "supabase-unconfigured" &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setError(null);

    try {
      const { createClient } = await import("@/lib/supabase/browser");
      const supabase = createClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}` },
      });
      if (otpError) throw otpError;
      setStatus("sent");
    } catch (err) {
      console.error("[login] magic link failed:", err);
      setError(
        "We could not send the link. Check the address and try again, or email sales@crewcatch.ai.",
      );
      setStatus("error");
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <p className="text-[11px] font-bold uppercase tracking-wider text-accent-ink">
        Client portal
      </p>
      <h1 className="mt-3 text-3xl font-black uppercase tracking-tight">
        Sign in
      </h1>
      <p className="mt-3 text-sm text-fg-muted">
        No password. We email you a link that signs you in once.
      </p>

      {reason === "supabase-unconfigured" && (
        <div role="alert" className="mt-6 border border-urgency-high bg-surface-1 p-4">
          <p className="text-sm font-bold uppercase tracking-wide text-urgency-high">
            Portal not configured
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            Supabase credentials are not set in this environment. The marketing
            site works; the portal needs a project before anyone can sign in.
          </p>
        </div>
      )}

      {status === "sent" ? (
        <div role="status" className="mt-6 border border-urgency-normal bg-surface-1 p-4">
          <p className="text-sm font-bold uppercase tracking-wide text-urgency-normal">
            Check your email
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            We sent a sign-in link to {email}. It expires shortly.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <Field
            label="Work email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!configured || status === "sending"}
            error={error ?? undefined}
          />
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={!configured || status === "sending" || email.length === 0}
          >
            {status === "sending" ? "Sending…" : "Email me a link"}
          </Button>
        </form>
      )}

      <p className="mt-8 text-sm text-fg-muted">
        <Link href="/" className="font-semibold text-accent-ink underline">
          Back to the site
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-20" />}>
      <LoginForm />
    </Suspense>
  );
}
