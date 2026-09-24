import type { Metadata } from "next";
import { RoiCalculator } from "@/components/marketing/RoiCalculator";

export const metadata: Metadata = {
  title: "ROI Calculator",
  description:
    "Work out what missed calls cost your business, and what capturing them is worth.",
};

export default function RoiPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-14">
      <p className="text-[11px] font-bold uppercase tracking-wider text-accent-ink">
        Calculator
      </p>
      <h1 className="mt-3 max-w-3xl text-3xl font-black uppercase tracking-tight sm:text-5xl">
        What are missed calls costing you?
      </h1>
      <p className="mt-4 max-w-2xl text-fg-muted">
        Every field is editable and every assumption is shown. If the numbers do
        not clear the retainer, the calculator says so — we would rather you
        find that out before you sign than after.
      </p>

      <div className="mt-10">
        <RoiCalculator />
      </div>
    </div>
  );
}
