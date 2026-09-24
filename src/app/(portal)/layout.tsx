import { PortalShell } from "@/components/portal/PortalShell";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ContractorSwitcher, UnassignedNotice } from "@/components/portal/ContractorGate";
import { TIER_LABEL } from "@/lib/domain/schemas";
import { getPortalData } from "@/lib/portal/data";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await getPortalData();

  // Ambiguous membership: RLS is correctly returning nothing, so explain it
  // rather than rendering a portal full of empty tables.
  if (data.ambiguous) {
    return <ContractorSwitcher options={data.ambiguous} />;
  }

  if (data.unassigned) {
    return <UnassignedNotice />;
  }

  return (
    <PortalShell
      contractorName={data.contractor.name}
      tier={TIER_LABEL[data.contractor.tier]}
      demo={data.demo}
    >
      <ErrorBoundary label="portal">{children}</ErrorBoundary>
    </PortalShell>
  );
}
