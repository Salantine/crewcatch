import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-0 text-fg">
      <SiteHeader />
      <main id="main" className="flex-1">
        <ErrorBoundary label="marketing">{children}</ErrorBoundary>
      </main>
      <SiteFooter />
    </div>
  );
}
