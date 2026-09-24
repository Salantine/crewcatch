"use client";

/**
 * Root error boundary.
 *
 * Catches a render or data-fetch failure anywhere in the route segment below
 * it and shows a recoverable panel instead of a stack trace. This exists
 * because the portal layout performs the Supabase query: without a boundary,
 * one failed query takes down every page under /dashboard, /calls, /leads,
 * /prompts, and /settings at once.
 *
 * The error itself is deliberately NOT rendered. Messages from a data layer
 * can contain column names, query fragments, or row contents.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div role="alert" className="border border-urgency-critical bg-surface-1 p-6">
        <h1 className="text-lg font-bold uppercase tracking-wide text-urgency-critical">
          This page failed to load
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          Something went wrong fetching your data. Nothing was changed. Try
          again — if it keeps happening, contact support and quote the reference
          below.
        </p>

        {error.digest && (
          <p className="metric mt-3 text-xs text-fg-muted">
            Reference: {error.digest}
          </p>
        )}

        <button
          type="button"
          onClick={reset}
          className="btn-accent mt-5 inline-flex h-11 items-center bg-accent px-5 text-sm font-bold uppercase tracking-wide text-accent-fg hover:bg-accent-hover"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
