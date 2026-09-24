import Link from "next/link";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/calls", label: "Calls" },
  { href: "/leads", label: "Leads" },
  { href: "/prompts", label: "Prompt" },
  { href: "/settings", label: "Settings" },
];

export function PortalShell({
  children,
  contractorName,
  tier,
  demo,
}: {
  children: React.ReactNode;
  contractorName: string;
  tier: string;
  demo: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-0 text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-accent focus:px-4 focus:py-2 focus:font-semibold focus:text-accent-fg"
      >
        Skip to content
      </a>

      <header className="border-b border-border-subtle bg-surface-1">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <Link href="/dashboard" className="flex items-baseline gap-2">
            <span className="font-extrabold uppercase tracking-tight">
              <span className="text-accent-ink">Crew</span>
              <span> Catch</span>
            </span>
          </Link>

          <span className="hidden h-5 w-px bg-border-strong sm:block" aria-hidden="true" />

          <div className="min-w-0">
            <p className="truncate text-sm font-bold uppercase tracking-wide">
              {contractorName}
            </p>
            <p className="metric text-[11px] uppercase text-fg-muted">{tier}</p>
          </div>

          <nav aria-label="Portal" className="order-3 w-full sm:order-2 sm:ml-auto sm:w-auto">
            <ul className="flex flex-wrap gap-x-1 gap-y-1">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-block border border-transparent px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-fg-muted hover:border-border-strong hover:text-fg"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      {demo && (
        <div className="border-b border-urgency-high bg-surface-1" role="status">
          <p className="mx-auto max-w-7xl px-4 py-2 text-xs text-urgency-high">
            <strong className="font-bold uppercase tracking-wide">Demo data:</strong>{" "}
            Supabase is not configured, so these are sample records — not your
            real calls.
          </p>
        </div>
      )}

      <main id="main" className="flex-1">
        {children}
      </main>
    </div>
  );
}
