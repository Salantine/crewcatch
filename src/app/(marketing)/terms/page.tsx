import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/LegalPage";
import { TERMS_SECTIONS } from "@/lib/content/legal";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of service for the CrewCatch AI answering service.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms"
      intro="What we provide, what we don't, and what neither of us can promise."
      sections={TERMS_SECTIONS}
    />
  );
}
