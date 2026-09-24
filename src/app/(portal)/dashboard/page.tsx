import type { Metadata } from "next";
import { KpiTile, UrgencyBadge } from "@/components/portal/KpiTile";
import { DataTable, type TableColumn } from "@/components/ui/Table";
import { formatUsd } from "@/lib/domain/roi";
import { computeMetrics, getPortalData } from "@/lib/portal/data";
import type { Lead } from "@/lib/domain/schemas";
import { formatLag } from "@/lib/dispatch/sla";
import { getSlaAndUsage } from "@/lib/portal/queries";

export const metadata: Metadata = { title: "Dashboard" };

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const fmtDuration = (s: number) =>
  s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

export default async function DashboardPage() {
  const { calls, leads, contractor } = await getPortalData();
  const metrics = computeMetrics(calls, leads);
  const critical = leads.filter((l) => l.urgency === "critical").slice(0, 8);

  // SLA + usage come from the database, not from the loaded call rows: they
  // are about DISPATCH timing, which the call log does not record.
  const { lag, usage } = await getSlaAndUsage(contractor.id);

  const columns: TableColumn<Lead>[] = [
    { key: "name", header: "Caller", render: (l) => <span className="font-semibold">{l.name}</span> },
    { key: "phone", header: "Callback", render: (l) => <span className="metric text-fg-muted">{l.phone}</span> },
    { key: "issue", header: "Issue", render: (l) => <span className="text-fg-muted">{l.issue}</span> },
    { key: "urgency", header: "Urgency", render: (l) => <UrgencyBadge urgency={l.urgency} /> },
    { key: "captured", header: "Captured", render: (l) => <span className="metric text-fg-muted">{fmtTime(l.capturedAt)}</span> },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-black uppercase tracking-tight">Dashboard</h1>

      {/* A KPI row is a set of independent figures, not term/definition pairs,
          so a plain grid is the correct structure (a <dl> here was invalid). */}
      <div className="mt-6 grid gap-px bg-border-subtle sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Calls captured" value={String(metrics.totalCalls)} note="All time" />
        <KpiTile label="Qualified rate" value={`${metrics.qualifiedRate}%`} note="Leads with a callback number" tone="normal" />
        <KpiTile label="Critical this period" value={String(metrics.criticalCount)} note="Pushed immediately" tone="critical" />
        <KpiTile label="Avg call length" value={fmtDuration(metrics.avgDurationSeconds)} note="Answered by the agent" />
      </div>

      <div className="mt-8 grid gap-px bg-border-subtle lg:grid-cols-3">
        <div className="bg-surface-1 p-5 lg:col-span-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
            Critical leads
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Highest-urgency callers, newest first. These are the ones where a
            missed callback costs the job.
          </p>
        </div>
        <div className="bg-surface-1 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-fg-muted">
            Revenue protected
          </h2>
          <p className="metric mt-3 text-3xl font-bold text-accent-ink">
            {formatUsd(metrics.revenueAtRisk)}
          </p>
          <p className="mt-2 text-xs text-fg-muted">
            {leads.length} qualified leads at the {formatUsd(650)} emergency
            average ticket. Against a {formatUsd(metrics.monthlyRetainer)}
            /month retainer.
          </p>
        </div>
      </div>

      <section className="mt-8" aria-labelledby="dispatch-speed">
        <h2
          id="dispatch-speed"
          className="text-sm font-bold uppercase tracking-wider text-fg-muted"
        >
          Dispatch speed
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Measured from the moment a lead was captured to the moment the alert
          left. The promise is 30 seconds.
        </p>

        <div className="mt-4 grid gap-px bg-border-subtle sm:grid-cols-4">
          <div className="bg-surface-1 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
              Median
            </p>
            <p className="metric mt-1 text-2xl font-bold text-accent-ink">
              {lag.count === 0 ? "—" : formatLag(lag.medianMs)}
            </p>
          </div>
          <div className="bg-surface-1 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
              p95
            </p>
            <p className="metric mt-1 text-2xl font-bold">
              {lag.count === 0 ? "—" : formatLag(lag.p95Ms)}
            </p>
          </div>
          <div className="bg-surface-1 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
              Over 30s
            </p>
            <p
              className={`metric mt-1 text-2xl font-bold ${
                lag.breaches > 0 ? "text-urgency-high" : "text-urgency-normal"
              }`}
            >
              {lag.count === 0 ? "—" : lag.breaches}
            </p>
          </div>
          <div className="bg-surface-1 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
              Minutes this month
            </p>
            <p className="metric mt-1 text-2xl font-bold">
              {Math.round(usage.minutesUsed)}
              <span className="text-sm text-fg-muted">
                {" "}
                / {usage.baselineMinutes}
              </span>
            </p>
            {usage.overageMinutes > 0 && (
              <p className="mt-1 text-xs text-urgency-high">
                {Math.round(usage.overageMinutes)} min over baseline
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="mt-8">
        <DataTable
          caption="Critical leads requiring callback"
          columns={columns}
          rows={critical}
          rowKey={(l) => l.id}
          empty="No critical leads. Nothing is on fire."
        />
      </div>
    </div>
  );
}
