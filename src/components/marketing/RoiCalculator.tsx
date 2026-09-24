"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import {
  calculateRoi,
  formatPayback,
  formatUsd,
  MONTHLY_RETAINER,
  SETUP_FEE,
  TIER_DEFAULTS,
} from "@/lib/domain/roi";
import {
  TIER_LABEL,
  type ContractorTier,
} from "@/lib/domain/schemas";

const TIERS = Object.keys(TIER_DEFAULTS) as ContractorTier[];

/**
 * The calculator is deliberately transparent: every assumption is visible and
 * editable, and the output shows a negative result rather than hiding it. A
 * sales tool that only ever prints flattering numbers is not a calculator.
 */
export function RoiCalculator() {
  const [tier, setTier] = useState<ContractorTier>("emergency");
  const [ticket, setTicket] = useState<string>(String(TIER_DEFAULTS.emergency.ticket));
  const [calls, setCalls] = useState<string>(
    String(TIER_DEFAULTS.emergency.monthlyCalls),
  );
  const [missed, setMissed] = useState<string>(
    String(TIER_DEFAULTS.emergency.missedRate * 100),
  );
  const [close, setClose] = useState<string>(
    String(TIER_DEFAULTS.emergency.closeRate * 100),
  );

  const defaults = TIER_DEFAULTS[tier];

  function selectTier(next: ContractorTier) {
    setTier(next);
    const d = TIER_DEFAULTS[next];
    setTicket(String(d.ticket));
    setCalls(String(d.monthlyCalls));
    setMissed(String(d.missedRate * 100));
    setClose(String(d.closeRate * 100));
  }

  const result = useMemo(
    () =>
      calculateRoi({
        tier,
        ticket: Number(ticket) || 0,
        monthlyCalls: Number(calls) || 0,
        missedRate: (Number(missed) || 0) / 100,
        closeRate: (Number(close) || 0) / 100,
        revenueMonths: defaults.revenueMonths,
      }),
    [tier, ticket, calls, missed, close, defaults.revenueMonths],
  );

  return (
    <div className="grid gap-px border border-border-subtle bg-border-subtle lg:grid-cols-2">
      {/* Inputs */}
      <div className="bg-surface-1 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
          Your numbers
        </h2>

        <fieldset className="mt-5">
          <legend className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
            Trade type
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {TIERS.map((t) => (
              <Button
                key={t}
                size="sm"
                variant={t === tier ? "primary" : "secondary"}
                onClick={() => selectTier(t)}
                aria-pressed={t === tier}
              >
                {TIER_LABEL[t]}
              </Button>
            ))}
          </div>
        </fieldset>

        <div className="mt-6 space-y-4">
          <Field
            label="Average job ticket (USD)"
            type="number"
            inputMode="numeric"
            min={0}
            value={ticket}
            onChange={(e) => setTicket(e.target.value)}
          />
          <Field
            label="Inbound calls per month"
            type="number"
            inputMode="numeric"
            min={0}
            value={calls}
            onChange={(e) => setCalls(e.target.value)}
            hint="All calls, not just the missed ones."
          />
          <Field
            label="Calls that go unanswered (%)"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={missed}
            onChange={(e) => setMissed(e.target.value)}
            hint="Industry benchmarks run 40–60%."
          />
          <Field
            label="Captured leads that close (%)"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={close}
            onChange={(e) => setClose(e.target.value)}
          />
        </div>

        {defaults.recurring && (
          <p className="mt-5 border-l-2 border-accent bg-surface-2 p-3 text-xs text-fg-muted">
            Recurring-service businesses: a captured customer is valued at 12
            months of revenue, not a single visit. That is why maintenance
            defaults use a higher call volume.
          </p>
        )}
      </div>

      {/* Output */}
      <div className="bg-surface-1 p-6">
        <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
          What that adds up to
        </h2>

        <div className="mt-5 border border-border-strong bg-surface-0 p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            First-year net
          </p>
          <p
            className={`metric mt-2 text-4xl font-bold ${
              result.clearsFees ? "text-urgency-normal" : "text-urgency-critical"
            }`}
          >
            {formatUsd(result.firstYearNet)}
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            {result.clearsFees
              ? `${result.roiMultiple.toFixed(1)}× your first-year fees`
              : "At these inputs the fees are not covered. Adjust the numbers above to match your actual volume."}
          </p>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-px bg-border-subtle">
          {[
            { label: "Captured calls / mo", value: result.capturedCallsPerMonth.toFixed(1) },
            { label: "Closed jobs / mo", value: result.closedJobsPerMonth.toFixed(1) },
            { label: "Annual captured", value: formatUsd(result.annualCapturedRevenue) },
            { label: "Payback", value: formatPayback(result.paybackMonths) },
            { label: "Setup fee", value: formatUsd(SETUP_FEE) },
            { label: "Year-one cost", value: formatUsd(result.firstYearCost) },
          ].map((row) => (
            <div key={row.label} className="bg-surface-2 p-3">
              <dt className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
                {row.label}
              </dt>
              <dd className="metric mt-1 text-lg font-bold">{row.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Badge tone={result.clearsFees ? "normal" : "critical"}>
            {result.clearsFees ? "Clears fees" : "Below fees"}
          </Badge>
          <span className="text-xs text-fg-muted">
            {formatUsd(MONTHLY_RETAINER)}/mo retainer
          </span>
        </div>

        <p className="mt-4 text-xs text-fg-muted">
          Estimates only. Actual results depend on your call volume, close rate,
          and how quickly you follow up. Nothing here is a guarantee.
        </p>
      </div>
    </div>
  );
}
