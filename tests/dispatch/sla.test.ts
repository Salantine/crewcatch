import { describe, expect, it } from "vitest";
import { dispatchLagMs, formatLag, SLA_MS } from "@/lib/dispatch/sla";

/**
 * The 30-second promise is sold to the customer. These tests exist so the
 * number shown in the portal cannot silently drift into flattering territory.
 */

const at = (ms: number) => new Date(Date.parse("2026-09-20T12:00:00.000Z") + ms).toISOString();

describe("dispatchLagMs", () => {
  it("returns zeroes for no events", () => {
    const r = dispatchLagMs([]);
    expect(r).toEqual({ count: 0, medianMs: 0, p95Ms: 0, breaches: 0, worstMs: 0 });
  });

  it("measures lag between capture and dispatch", () => {
    const r = dispatchLagMs([
      { created_at: at(0), dispatched_at: at(12_000) },
    ]);
    expect(r.medianMs).toBe(12_000);
    expect(r.breaches).toBe(0);
  });

  it("excludes events that never dispatched", () => {
    // A null dispatched_at has no lag to measure. Counting it as zero would
    // make a broken integration look like the fastest one on the board.
    const r = dispatchLagMs([
      { created_at: at(0), dispatched_at: null },
      { created_at: at(0), dispatched_at: at(10_000) },
    ]);
    expect(r.count).toBe(1);
    expect(r.medianMs).toBe(10_000);
  });

  it("counts breaches without dropping them from the stats", () => {
    const r = dispatchLagMs([
      { created_at: at(0), dispatched_at: at(5_000) },
      { created_at: at(0), dispatched_at: at(45_000) },
      { created_at: at(0), dispatched_at: at(60_000) },
    ]);
    expect(r.count).toBe(3);
    expect(r.breaches).toBe(2);
    // The breach still counts toward the median — hiding it would be the
    // whole failure mode.
    expect(r.medianMs).toBe(45_000);
  });

  it("treats exactly 30s as within the promise", () => {
    const r = dispatchLagMs([{ created_at: at(0), dispatched_at: at(SLA_MS) }]);
    expect(r.breaches).toBe(0);
  });

  it("treats one millisecond over as a breach", () => {
    const r = dispatchLagMs([
      { created_at: at(0), dispatched_at: at(SLA_MS + 1) },
    ]);
    expect(r.breaches).toBe(1);
  });

  it("averages the middle pair for an even count", () => {
    const r = dispatchLagMs([
      { created_at: at(0), dispatched_at: at(10_000) },
      { created_at: at(0), dispatched_at: at(20_000) },
      { created_at: at(0), dispatched_at: at(30_000) },
      { created_at: at(0), dispatched_at: at(40_000) },
    ]);
    expect(r.medianMs).toBe(25_000);
  });

  it("reports p95 by nearest rank — an observed value, not an interpolation", () => {
    // 20 values, 1000..20000. Nearest-rank p95 is the ceil(0.95*20)=19th
    // smallest, i.e. 19000. It is deliberately not the maximum: p95 is a
    // high-but-typical figure, and `worstMs` carries the maximum separately.
    const r = dispatchLagMs(
      Array.from({ length: 20 }, (_, i) => ({
        created_at: at(0),
        dispatched_at: at((i + 1) * 1_000),
      })),
    );
    expect(r.p95Ms).toBe(19_000);
    expect(r.worstMs).toBe(20_000);
  });

  it("p95 equals the maximum when every value is identical", () => {
    const r = dispatchLagMs(
      Array.from({ length: 10 }, () => ({
        created_at: at(0),
        dispatched_at: at(8_000),
      })),
    );
    expect(r.p95Ms).toBe(8_000);
    expect(r.worstMs).toBe(8_000);
  });

  it("clamps a negative lag rather than reporting nonsense", () => {
    // Clock skew or a bad write could produce dispatched_at < created_at.
    const r = dispatchLagMs([{ created_at: at(10_000), dispatched_at: at(0) }]);
    expect(r.medianMs).toBe(0);
  });

  it("ignores unparseable timestamps", () => {
    const r = dispatchLagMs([
      { created_at: "not-a-date", dispatched_at: at(5_000) },
      { created_at: at(0), dispatched_at: at(5_000) },
    ]);
    expect(r.count).toBe(1);
  });
});

describe("formatLag", () => {
  it("formats sub-second, second, and minute scales", () => {
    expect(formatLag(450)).toBe("450ms");
    expect(formatLag(1_500)).toBe("1.5s");
    expect(formatLag(95_000)).toBe("1m 35s");
  });
});
