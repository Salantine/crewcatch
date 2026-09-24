/**
 * Dispatch speed measurement.
 *
 * The 30-second promise is a headline claim the contractor pays for. It is
 * only a claim if it is measured — and measuring it is the difference between
 * "we dispatch fast" and a number the operator can look at when a customer
 * complains.
 *
 * Pure functions, no I/O, so the maths is directly testable.
 */

export const SLA_MS = 30_000;

export interface DispatchLag {
  count: number;
  medianMs: number;
  p95Ms: number;
  /** How many dispatches breached the promise. */
  breaches: number;
  worstMs: number;
}

/**
 * @param events rows carrying `created_at` (when the lead was captured) and
 *   `dispatched_at` (when the alert actually left). Rows with a null
 *   `dispatched_at` are excluded — an event that never dispatched has no lag
 *   to measure, and counting it as zero would flatter the number.
 */
export function dispatchLagMs(
  events: { created_at: string; dispatched_at: string | null }[],
): DispatchLag {
  const lags = events
    .map((e) => {
      if (!e.dispatched_at) return null;
      const captured = Date.parse(e.created_at);
      const dispatched = Date.parse(e.dispatched_at);
      if (Number.isNaN(captured) || Number.isNaN(dispatched)) return null;
      return Math.max(0, dispatched - captured);
    })
    .filter((n): n is number => n !== null);

  if (lags.length === 0) {
    return { count: 0, medianMs: 0, p95Ms: 0, breaches: 0, worstMs: 0 };
  }

  const sorted = [...lags].sort((a, b) => a - b);

  // Nearest-rank percentile: the smallest value at or above the given rank.
  // Simple, integer, and never invents a value that was not observed.
  const percentile = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  return {
    count: sorted.length,
    medianMs: median,
    p95Ms: percentile(95),
    breaches: sorted.filter((l) => l > SLA_MS).length,
    worstMs: sorted[sorted.length - 1],
  };
}

export function formatLag(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}
