import { notFound } from "next/navigation";
import { getAdminIdentity } from "@/lib/admin/guard";
import { PortalShell } from "@/components/portal/PortalShell";

/**
 * Admin gate — enforced HERE, independently of the proxy.
 *
 * The proxy is a routing convenience; this layout is the authorization
 * boundary. A request that reaches the admin tree without the flag gets a 404
 * rather than a redirect, so the surface is not even discoverable.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const identity = await getAdminIdentity();
  if (!identity.isAdmin) notFound();

  return (
    <PortalShell
      contractorName="Operator"
      tier="Internal"
      demo={false}
    >
      <div className="mx-auto max-w-7xl px-4 py-8">
        <p className="text-[11px] font-bold uppercase tracking-wider text-accent-ink">
          Internal
        </p>
        {children}
      </div>
    </PortalShell>
  );
}
