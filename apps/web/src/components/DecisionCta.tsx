import Link from "next/link";
import { SpectrumOrbs, SpectrumRule } from "@/components/BrandMotif";
import { NextFlowLink } from "@/components/LabFlow";

export function DecisionCta() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(135deg,rgba(12,45,92,0.95),rgba(10,31,74,0.98)_50%,rgba(8,13,26,1))] px-6 py-10 sm:px-10">
      <SpectrumOrbs />
      <SpectrumRule className="absolute inset-x-0 top-0" />
      <div className="relative z-10 max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--yellow)]">
          Stay on the path
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--yellow-bright)] sm:text-4xl">
          Home → Objectives → Map → Actions → Reports
        </h2>
        <p className="mt-3 text-[var(--ink-muted)]">
          Finish the charts, then open the Map before Actions so recommendations are grounded
          in space.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <NextFlowLink />
          <Link href="/objectives" className="et-btn-ghost">
            Back to objectives
          </Link>
        </div>
      </div>
    </section>
  );
}
