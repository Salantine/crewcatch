import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

type Tone = "neutral" | "accent" | "critical" | "high" | "normal" | "low";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

/* Urgency tones are used on BOTH surfaces. Every foreground here clears 4.5:1
 * against its own surface — urgency color is carried by the border and a text
 * label, never by color alone (WCAG 1.4.1). */
const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-muted border-border-strong",
  accent: "bg-accent text-accent-fg border-accent",
  critical: "bg-surface-1 text-urgency-critical border-urgency-critical",
  high: "bg-surface-1 text-urgency-high border-urgency-high",
  normal: "bg-surface-1 text-urgency-normal border-urgency-normal",
  low: "bg-surface-1 text-urgency-low border-border-strong",
};

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-0.5",
        "font-mono text-[11px] font-semibold uppercase tracking-wider",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
