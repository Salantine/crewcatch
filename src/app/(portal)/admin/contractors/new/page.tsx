import type { Metadata } from "next";

import { OnboardForm } from "./OnboardForm";

export const metadata: Metadata = { title: "Onboard contractor" };

export default function NewContractorPage() {
  return (
    <>
      <h1 className="text-2xl font-black uppercase tracking-tight">
        Onboard contractor
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-fg-muted">
        Creates the account, provisions a number per region, and seeds the
        prompt profile from the trade template. This is the $1,500 setup fee,
        performed repeatably.
      </p>

      <div className="mt-8 max-w-2xl">
        <OnboardForm />
      </div>
    </>
  );
}
