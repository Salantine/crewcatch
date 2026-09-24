import { cn } from "@/lib/cn";
import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type BaseProps = {
  variant?: Variant;
  size?: Size;
  /** Required when the button's only content is an icon — screen readers
   *  otherwise announce an unlabelled control. */
  iconOnly?: boolean;
  children?: ReactNode;
  className?: string;
};

type ButtonAsButton = BaseProps & ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: undefined;
};
type ButtonAsLink = BaseProps & AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

export type ButtonProps = ButtonAsButton | ButtonAsLink;

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

const BASE = [
  "inline-flex items-center justify-center gap-2 font-semibold uppercase tracking-wide",
  "transition-colors duration-100 select-none",
  "disabled:opacity-50 disabled:cursor-not-allowed",
].join(" ");

function classes(
  variant: Variant,
  size: Size,
  iconOnly: boolean,
  className?: string,
) {
  return cn(
    BASE,
    SIZES[size],
    VARIANTS[variant],
    iconOnly && "px-0 aspect-square",
    className,
  );
}

export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", iconOnly = false, className, children } = props;
  const cls = classes(variant, size, iconOnly, className);

  // Polymorphic: a link renders an <a>, a button renders a <button>. Never
  // nest a Link inside a button — that is invalid HTML and breaks keyboard
  // and screen-reader semantics.
  if ("href" in props && props.href !== undefined) {
    const { href, variant: _v, size: _s, iconOnly: _i, children: _c, className: _cl, ...rest } = props;
    return (
      <Link href={href} className={cls} {...rest}>
        {children}
      </Link>
    );
  }

  const { type = "button", variant: _v2, size: _s2, iconOnly: _i2, className: _cl2, children: _c2, ...rest } = props;
  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}
