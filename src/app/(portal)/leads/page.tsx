import type { Metadata } from "next";
import { UrgencyBadge } from "@/components/portal/KpiTile";
import { DataTable, type TableColumn } from "@/components/ui/Table";
import { getPortalData } from "@/lib/portal/data";
import type { Lead } from "@/lib/domain/schemas";

export const metadata: Metadata = { title: "Leads" };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export default async function LeadsPage() {
  const { leads } = await getPortalData();

  const columns: TableColumn<Lead>[] = [
    {
      key: "name",
      header: "Caller",
      render: (l) => <span className="font-semibold">{l.name}</span>,
    },
    {
      key: "phone",
      header: "Callback",
      render: (l) => <span className="metric">{l.phone}</span>,
    },
    {
      key: "address",
      header: "Address",
      render: (l) => <span className="text-fg-muted">{l.address ?? "—"}</span>,
    },
    {
      key: "issue",
      header: "Issue",
      render: (l) => <span className="text-fg-muted">{l.issue}</span>,
    },
    {
      key: "urgency",
      header: "Urgency",
      render: (l) => <UrgencyBadge urgency={l.urgency} />,
    },
    {
      key: "captured",
      header: "Captured",
      render: (l) => <span className="metric text-fg-muted">{fmt(l.capturedAt)}</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-black uppercase tracking-tight">Leads</h1>
      <p className="mt-2 max-w-2xl text-sm text-fg-muted">
        Calls that produced a name and a callback number, dispatched to you
        within 30 seconds of hangup.
      </p>

      <div className="mt-6">
        <DataTable
          caption="Captured leads, newest first"
          columns={columns}
          rows={leads}
          rowKey={(l) => l.id}
          empty="No leads captured yet."
        />
      </div>
    </div>
  );
}
