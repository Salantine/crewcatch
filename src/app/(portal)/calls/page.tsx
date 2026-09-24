import type { Metadata } from "next";
import { UrgencyBadge } from "@/components/portal/KpiTile";
import { DataTable, type TableColumn } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { getPortalData } from "@/lib/portal/data";
import type { Call } from "@/lib/domain/schemas";

export const metadata: Metadata = { title: "Calls" };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const fmtDuration = (s: number) =>
  s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

const INTENT_LABEL: Record<Call["intent"], string> = {
  emergency: "Emergency",
  estimate: "Estimate",
  maintenance: "Maintenance",
  consultation: "Consultation",
  wrong_number: "Wrong number",
};

export default async function CallsPage() {
  const { calls } = await getPortalData();

  const columns: TableColumn<Call>[] = [
    {
      key: "started",
      header: "Started",
      render: (c) => <span className="metric text-fg-muted">{fmt(c.startedAt)}</span>,
    },
    {
      key: "duration",
      header: "Length",
      numeric: true,
      render: (c) => <span className="metric">{fmtDuration(c.durationSeconds)}</span>,
    },
    {
      key: "intent",
      header: "Intent",
      render: (c) => <span>{INTENT_LABEL[c.intent]}</span>,
    },
    {
      key: "urgency",
      header: "Urgency",
      render: (c) => <UrgencyBadge urgency={c.urgency} />,
    },
    {
      key: "qualified",
      header: "Outcome",
      render: (c) =>
        c.qualified ? (
          <Badge tone="normal">Lead captured</Badge>
        ) : (
          <Badge tone="neutral">Not qualified</Badge>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-black uppercase tracking-tight">Call log</h1>
      <p className="mt-2 max-w-2xl text-sm text-fg-muted">
        Every call the agent picked up, including the ones that did not produce
        a callback number. Those still count — a caller who hung up was a call
        you did not lose.
      </p>

      <div className="mt-6">
        <DataTable
          caption="All captured calls, newest first"
          columns={columns}
          rows={calls}
          rowKey={(c) => c.id}
          empty="No calls captured yet."
        />
      </div>
    </div>
  );
}
