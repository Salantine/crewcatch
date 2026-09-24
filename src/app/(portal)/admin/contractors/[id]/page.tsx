import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type TableColumn } from "@/components/ui/Table";
import { TIER_LABEL, TRADE_LABEL, type DispatchChannel } from "@/lib/domain/schemas";
import { PromptEditor } from "./PromptEditor";
import { dispatchLagMs } from "@/lib/dispatch/sla";

export const metadata: Metadata = { title: "Contractor" };

/** `params` is a Promise in Next 16 — synchronous access was removed. */
type PageProps = { params: Promise<{ id: string }> };

export default async function ContractorPage({ params }: PageProps) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = createAdminClient();

  const [{ data: contractor }, { data: numbers }, { data: profile }, { data: events }] =
    await Promise.all([
      supabase
        .from("contractors")
        .select("id, name, slug, primary_trade, tier, dispatch_channels, created_at")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("phone_numbers")
        .select("number, region_label, active")
        .eq("contractor_id", id),
      supabase
        .from("prompt_profiles")
        .select("id, trade, business_name, greeting, objections, after_hours_only, updated_at")
        .eq("contractor_id", id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("dispatch_events")
        .select("id, channel, accepted, detail, created_at, dispatched_at")
        .eq("contractor_id", id)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

  if (!contractor) notFound();

  const c = contractor as {
    id: string;
    name: string;
    slug: string;
    primary_trade: keyof typeof TRADE_LABEL;
    tier: keyof typeof TIER_LABEL;
    dispatch_channels: DispatchChannel[];
    created_at: string;
  };

  const lag = dispatchLagMs(
    (events ?? []) as { created_at: string; dispatched_at: string | null }[],
  );


  type DispatchEventRow = {
    id: string;
    channel: DispatchChannel;
    accepted: boolean;
    detail: string | null;
    created_at: string;
    dispatched_at: string | null;
  };

  const eventRows = (events ?? []) as DispatchEventRow[];

  const eventColumns: TableColumn<DispatchEventRow>[] = [
    { key: "channel", header: "Channel", render: (e) => e.channel.toUpperCase() },
    {
      key: "accepted",
      header: "Result",
      render: (e) =>
        e.accepted ? (
          <Badge tone="normal">Delivered</Badge>
        ) : (
          <Badge tone="critical">Failed</Badge>
        ),
    },
    {
      key: "detail",
      header: "Detail",
      render: (e) => <span className="text-fg-muted">{e.detail ?? "—"}</span>,
    },
    {
      key: "at",
      header: "When",
      render: (e) => (
        <span className="metric text-fg-muted">
          {new Date(e.created_at).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      ),
    },
  ];

  return (
    <>
      <Link
        href="/admin"
        className="text-sm font-semibold uppercase tracking-wide text-fg-muted hover:text-fg"
      >
        &larr; All contractors
      </Link>

      <h1 className="mt-3 text-2xl font-black uppercase tracking-tight">{c.name}</h1>
      <p className="mt-2 text-sm text-fg-muted">
        {TRADE_LABEL[c.primary_trade]} · {TIER_LABEL[c.tier]} ·{" "}
        <span className="metric">/{c.slug}</span>
      </p>

      <div className="mt-6 grid gap-px bg-border-subtle sm:grid-cols-3">
        <div className="bg-surface-1 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            Numbers
          </p>
          {(numbers ?? []).length === 0 ? (
            <p className="mt-1 text-sm text-urgency-high">
              None provisioned — this contractor cannot receive calls.
            </p>
          ) : (
            <ul className="mt-1 space-y-1">
              {(numbers as { number: string; region_label: string; active: boolean }[]).map((n) => (
                <li key={n.number} className="metric text-sm">
                  {n.number}{" "}
                  <span className="text-fg-muted">({n.region_label})</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-surface-1 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            Dispatch channels
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {c.dispatch_channels.map((ch) => (
              <Badge key={ch} tone="accent">
                {ch}
              </Badge>
            ))}
          </div>
        </div>

        <div className="bg-surface-1 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            Dispatch speed
          </p>
          {lag.count === 0 ? (
            <p className="mt-1 text-sm text-fg-muted">No dispatches yet.</p>
          ) : (
            <>
              <p className="metric mt-1 text-2xl font-bold">
                {Math.round(lag.medianMs / 1000)}s
              </p>
              <p className="text-xs text-fg-muted">
                median · p95 {Math.round(lag.p95Ms / 1000)}s ·{" "}
                <span className={lag.breaches > 0 ? "text-urgency-high" : "text-urgency-normal"}>
                  {lag.breaches} over 30s
                </span>
              </p>
            </>
          )}
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-black uppercase tracking-tight">Prompt</h2>
        <p className="mt-1 max-w-2xl text-sm text-fg-muted">
          Prompt tuning is part of the monthly retainer. Edit the greeting and
          objection scripts here; saving pushes the change to the voice agent.
        </p>
        {profile ? (
          <div className="mt-4 max-w-3xl">
            <PromptEditor
              contractorId={c.id}
              initial={{
                businessName: (profile as { business_name: string }).business_name,
                greeting: (profile as { greeting: string }).greeting,
                afterHoursOnly: (profile as { after_hours_only: boolean })
                  .after_hours_only,
                objections: (profile as { objections: Record<string, string> })
                  .objections,
              }}
            />
          </div>
        ) : (
          <p className="mt-4 border-l-2 border-urgency-high bg-surface-1 p-4 text-sm text-fg-muted">
            No prompt profile exists for this contractor. Their voice agent is
            not configured.
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-black uppercase tracking-tight">
          Recent dispatches
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Failures here are leads this contractor never heard about — the
          failure mode they would not report.
        </p>
        <div className="mt-4">
          <DataTable
            caption={`Dispatch log for ${c.name}`}
            columns={eventColumns}
            rows={eventRows}
            rowKey={(e) => e.id}
            empty="No dispatches recorded yet."
          />
        </div>
      </section>
    </>
  );
}
