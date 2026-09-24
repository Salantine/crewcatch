import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Required when the button's only content is an icon — screen readers
   *  otherwise announce an unlabelled control. */
  iconOnly?: boolean;
  children?: ReactNode;
}

/*
 * The four measured contrast rules, encoded here so they cannot be forgotten:
 *   1. primary = orange fill + NAVY text. Never white (2.86:1, fails AA).
 *   2. secondary uses --fg-muted (5.93:1), never a raw slate.
 *   3. accent text on dark only; light surfaces use --accent-ink.
 *   4. `.btn-accent` flips the focus ring to navy — orange-on-orange is invisible.
 */
const VARIANTS: Record<Variant, string> = {
  primary: "btn-accent bg-accent text-accent-fg hover:bg-accent-hover",
  secondary:
    "bg-surface-1 text-fg border border-border-strong hover:bg-surface-3",
  ghost: "bg-transparent text-fg-muted hover:text-fg hover:bg-surface-2",
  danger: "bg-urgency-critical text-fg hover:opacity-90",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-8 text-base",
};

export function Button({
  variant = "primary",
  size = "md",
  iconOnly = false,
  className,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold uppercase tracking-wide",
        "transition-colors duration-100 select-none",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        SIZES[size],
        VARIANTS[variant],
        iconOnly && "px-0 aspect-square",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
