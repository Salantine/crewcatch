import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type TableColumn } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { listContractors, type ContractorSummary } from "@/lib/admin/onboarding";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export const metadata: Metadata = { title: "Operators" };

export default async function AdminPage() {
  let contractors: ContractorSummary[] = [];
  let error: string | null = null;
  try {
    contractors = await listContractors();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const columns: TableColumn<ContractorSummary>[] = [
    {
      key: "name",
      header: "Contractor",
      render: (c) => (
        <Link
          href={`/admin/contractors/${c.id}`}
          className="font-semibold text-accent-ink underline"
        >
          {c.name}
        </Link>
      ),
    },
    { key: "trade", header: "Trade", render: (c) => c.tradeLabel },
    {
      key: "tier",
      header: "Tier",
      render: (c) => <Badge tone="neutral">{c.tier.replace("_", " ")}</Badge>,
    },
    {
      key: "numbers",
      header: "Numbers",
      render: (c) =>
        c.numbers.length ? (
          <span className="metric text-fg-muted">
            {c.numbers.map((n) => n.number).join(", ")}
          </span>
        ) : (
          <span className="text-urgency-high">none provisioned</span>
        ),
    },
    {
      key: "channels",
      header: "Dispatch",
      render: (c) => (
        <span className="flex flex-wrap gap-1">
          {c.dispatchChannels.map((ch) => (
            <Badge key={ch} tone="accent">
              {ch}
            </Badge>
          ))}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-black uppercase tracking-tight">Contractors</h1>
        <Button href="/admin/contractors/new">Onboard contractor</Button>
      </div>

      <p className="mt-2 max-w-2xl text-sm text-fg-muted">
        Provisioning, prompt seeding, and dispatch configuration for each
        account. One contractor here equals one live customer.
      </p>

      <div className="mt-6">
        <ErrorBoundary label="admin-contractor-list">
          {error ? (
            <div role="alert" className="border border-urgency-critical bg-surface-1 p-4">
              <p className="font-semibold text-urgency-critical">
                Could not load contractors
              </p>
              <p className="mt-1 text-sm text-fg-muted">{error}</p>
            </div>
          ) : (
            <DataTable
              caption="All onboarded contractors"
              columns={columns}
              rows={contractors}
              rowKey={(c) => c.id}
              empty="No contractors yet. Onboard the first one to get started."
            />
          )}
        </ErrorBoundary>
      </div>
    </>
  );
}
