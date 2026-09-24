import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import type { UrgencyLevel } from "@/lib/domain/schemas";

export const URGENCY_TONE: Record<UrgencyLevel, "critical" | "high" | "normal" | "low"> = {
  critical: "critical",
  high: "high",
  normal: "normal",
  low: "low",
};

export const URGENCY_LABEL: Record<UrgencyLevel, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};

export function KpiTile({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "neutral" | "accent" | "normal" | "critical";
}) {
  return (
    <div className="bg-surface-1 p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
        {label}
      </p>
      <p
        className={cn(
          "metric mt-2 text-3xl font-bold",
          tone === "accent" && "text-accent-ink",
          tone === "normal" && "text-urgency-normal",
          tone === "critical" && "text-urgency-critical",
        )}
      >
        {value}
      </p>
      {note && <p className="mt-1 text-xs text-fg-muted">{note}</p>}
    </div>
  );
}

/**
 * Urgency is carried by a text label as well as colour — WCAG 1.4.1 forbids
 * relying on colour alone to convey meaning.
 */
export function UrgencyBadge({ urgency }: { urgency: UrgencyLevel }) {
  return <Badge tone={URGENCY_TONE[urgency]}>{URGENCY_LABEL[urgency]}</Badge>;
}
