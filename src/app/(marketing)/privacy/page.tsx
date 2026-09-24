import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/LegalPage";
import { PRIVACY_SECTIONS } from "@/lib/content/legal";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How CrewCatch collects, uses, and retains call data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      intro="What we collect when we answer a call on your behalf, and what we do with it."
      sections={PRIVACY_SECTIONS}
    />
  );
}
