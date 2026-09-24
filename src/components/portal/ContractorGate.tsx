"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Shown when the signed-in user belongs to more than one contractor and has
 * not selected one.
 *
 * Migration 0002 makes `current_contractor_id()` return NULL in that state, so
 * RLS matches no rows and every portal query legitimately returns nothing.
 * Without this screen the user sees five empty tables and no explanation —
 * the exact ambiguity that made the old `LIMIT 1` behaviour dangerous.
 *
 * Selection is recorded via POST, which sets an httpOnly cookie. The cookie
 * is a convenience; `current_contractor_id()` re-verifies it against the
 * caller's memberships before honouring it.
 */
export function ContractorSwitcher({
  options,
}: {
  options: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function select(contractorId: string, name: string) {
    setBusy(contractorId);
    setError(null);
    try {
      const res = await fetch("/api/contractor/select", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contractorId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? `Failed (${res.status})`);
      }
      router.push("/dashboard");
      router.refresh();
      void name;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <p className="text-[11px] font-bold uppercase tracking-wider text-accent-ink">
        Multiple accounts
      </p>
      <h1 className="mt-3 text-2xl font-black uppercase tracking-tight">
        Choose a business
      </h1>
      <p className="mt-3 text-sm text-fg-muted">
        You have access to more than one CrewCatch account. Pick the one you
        want to work in.
      </p>

      {error && (
        <p role="alert" className="mt-4 border border-urgency-critical bg-surface-1 p-3 text-sm text-urgency-critical">
          {error}
        </p>
      )}

      <ul className="mt-8 space-y-px bg-border-subtle">
        {options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              onClick={() => select(option.id, option.name)}
              disabled={busy !== null}
              className="flex w-full items-center justify-between bg-surface-1 p-5 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <span className="text-lg font-bold uppercase tracking-wide">
                {option.name}
              </span>
              <span aria-hidden="true" className="metric text-accent-ink">
                {busy === option.id ? "…" : "→"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Shown when a user is authenticated but has no contractor membership yet. */
export function UnassignedNotice() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <p className="text-[11px] font-bold uppercase tracking-wider text-accent-ink">
        No account yet
      </p>
      <h1 className="mt-3 text-2xl font-black uppercase tracking-tight">
        Nothing here yet
      </h1>
      <p className="mt-3 text-sm text-fg-muted">
        Your login is working, but it is not linked to a CrewCatch account yet.
        If you recently signed up, your number is still being provisioned —
        check back shortly, or email sales@crewcatch.ai.
      </p>
    </div>
  );
}
