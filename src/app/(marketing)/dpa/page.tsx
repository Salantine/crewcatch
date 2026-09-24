import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/LegalPage";
import { DPA_SECTIONS } from "@/lib/content/legal";

export const metadata: Metadata = {
  title: "Data processing",
  description: "How CrewCatch processes personal information on a contractor's behalf.",
};

export default function DpaPage() {
  return (
    <LegalPage
      title="Data processing"
      intro="When we act as a processor for the personal information in your callers' recordings."
      sections={DPA_SECTIONS}
    />
  );
}
