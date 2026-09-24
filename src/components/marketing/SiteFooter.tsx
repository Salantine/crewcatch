import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border-subtle bg-surface-1">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-tight">
            <span className="text-accent-ink">Crew</span>
            <span className="text-fg">Catch</span>
          </p>
          <p className="mt-2 max-w-xs text-sm text-fg-muted">
            Voice automation for North American contractors. Built for the
            trucks, not the pitch deck.
          </p>
        </div>

        <nav aria-label="Product">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            Product
          </h2>
          <ul className="mt-3 space-y-2">
            {[
              ["/pricing", "Pricing"],
              ["/roi", "ROI Calculator"],
              ["/trades/hvac", "Trades We Cover"],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="text-sm text-fg-muted hover:text-fg">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Company">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            Company
          </h2>
          <ul className="mt-3 space-y-2">
            {[
              ["/compliance", "TCPA & CASL Compliance"],
              ["/contact", "Contact"],
              ["/login", "Client Login"],
            ].map(([href, label]) => (
              <li key={href}>
                <Link href={href} className="text-sm text-fg-muted hover:text-fg">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
            Coverage
          </h2>
          <p className="mt-3 text-sm text-fg-muted">
            United States &amp; Canada. Multi-timezone routing, area-code aware.
          </p>
        </div>
      </div>

      <div className="border-t border-border-subtle">
        <p className="mx-auto max-w-7xl px-4 py-4 text-xs text-fg-muted">
          © {new Date().getFullYear()} CrewCatch AI. Results depend on call
          volume and lead value; calculator figures are estimates, not
          guarantees.
        </p>
      </div>
    </footer>
  );
}
