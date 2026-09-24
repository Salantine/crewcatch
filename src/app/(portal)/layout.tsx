import { PortalShell } from "@/components/portal/PortalShell";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { TIER_LABEL } from "@/lib/domain/schemas";
import { getPortalData } from "@/lib/portal/data";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Layouts do not re-render on navigation between child routes, so this fetch
  // is shared by every portal page for the session.
  const { contractor, demo } = await getPortalData();

  return (
    <PortalShell
      contractorName={contractor.name}
      tier={TIER_LABEL[contractor.tier]}
      demo={demo}
    >
      <ErrorBoundary label="portal">{children}</ErrorBoundary>
    </PortalShell>
  );
}
