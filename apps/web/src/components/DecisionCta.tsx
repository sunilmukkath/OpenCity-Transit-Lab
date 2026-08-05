import Link from "next/link";
import { SpectrumOrbs, SpectrumRule } from "@/components/BrandMotif";

export function DecisionCta() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(135deg,rgba(12,45,92,0.95),rgba(10,31,74,0.98)_50%,rgba(8,13,26,1))] px-6 py-10 sm:px-10">
      <SpectrumOrbs />
      <SpectrumRule className="absolute inset-x-0 top-0" />
      <div className="relative z-10 max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--yellow)]">
          From inventory to action
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--yellow-bright)] sm:text-4xl">
          Ready to turn coverage data into decisions?
        </h2>
        <p className="mt-3 text-[var(--ink-muted)]">
          Open ward and zone Gap Index reports, inspect verified layers on the map, or audit
          every source — without invented equity scores.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/analytics?tab=spatial" className="et-btn-primary">
            Open Gap Index reports
          </Link>
          <Link href="/map" className="et-btn-ghost">
            Explore the network map
          </Link>
        </div>
      </div>
    </section>
  );
}
