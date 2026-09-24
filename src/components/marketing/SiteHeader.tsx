import Link from "next/link";

const NAV = [
  { href: "/trades/hvac", label: "Trades" },
  { href: "/pricing", label: "Pricing" },
  { href: "/roi", label: "ROI Calculator" },
  { href: "/compliance", label: "Compliance" },
];

/**
 * Industrial chrome: a flat bar with hard rules between cells. No dropdown —
 * five destinations do not justify one, and a menu would hide the trades.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-border-subtle bg-surface-0">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-accent focus:px-4 focus:py-2 focus:font-semibold focus:text-accent-fg"
      >
        Skip to content
      </a>

      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4">
        <Link
          href="/"
          className="flex items-baseline gap-2 text-lg font-extrabold uppercase tracking-tight"
        >
          <span className="text-accent-ink">Crew</span>
          <span className="text-fg">Catch</span>
          <span className="metric text-[11px] font-medium uppercase text-fg-muted">
            AI
          </span>
        </Link>

        <nav aria-label="Primary" className="order-3 w-full sm:order-2 sm:w-auto">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-sm font-semibold uppercase tracking-wide text-fg-muted transition-colors hover:text-fg"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <Link
          href="/login"
          className="btn-accent order-2 ml-auto inline-flex h-10 items-center bg-accent px-4 text-sm font-bold uppercase tracking-wide text-accent-fg transition-colors hover:bg-accent-hover sm:order-3"
        >
          Client Login
        </Link>
      </div>
    </header>
  );
}
