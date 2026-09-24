import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * A definition list where each entry is a LABELED VALUE.
 *
 * This is a <div> grid rather than <dl>/<dt>/<dd> on purpose: the visual
 * grouping puts a wrapper <div> (with the background/border) around each pair,
 * and the HTML spec only permits <div> inside <dl> if every <dt> has a <dd>
 * sibling in the SAME div. Several of our grids break that pairing, which axe
 * flags as a `definition-list` violation — and an invalid list is worse than
 * no list. A plain grid with headings is both valid and announced correctly.
 */
export function StatGrid({
  items,
  className,
}: {
  items: { label: string; value: ReactNode; note?: string }[];
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-px bg-border-subtle", className)}>
      {items.map((item) => (
        // Each dt/dd pair lives in its own <div> wrapper, keeping the markup
        // valid under the <dl> content model.
        <div key={item.label} className="bg-surface-1 p-4">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            {item.label}
          </dt>
          <dd className="mt-1 text-sm">
            {item.value}
            {item.note && <p className="mt-1 text-xs text-fg-muted">{item.note}</p>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
