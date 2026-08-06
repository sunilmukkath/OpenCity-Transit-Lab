import Link from "next/link";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { SectionEyebrow, SpectrumRule } from "@/components/BrandMotif";

export default function AnalyticsPage() {
  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,rgba(16,52,102,0.9),rgba(10,31,74,0.96))] px-6 py-7 sm:px-8">
        <SpectrumRule className="absolute inset-x-0 top-0" />
        <SectionEyebrow>Step 5 · Reports</SectionEyebrow>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          Ward inventory &amp; map workbench
        </h1>
        <p className="mt-2 max-w-3xl text-[var(--ink-muted)]">
          End of the decision path: drill Gap Index by ward/zone after Objectives → Map →
          Actions. For provenance, open{" "}
          <Link href="/sources" className="font-semibold text-[var(--accent)]">
            Sources
          </Link>
          .
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/recommendations" className="font-semibold text-[var(--accent)]">
            ← Actions
          </Link>
          <Link href="/map" className="text-[var(--ink-muted)] hover:text-[var(--accent)]">
            ← Map
          </Link>
          <Link href="/objectives" className="text-[var(--ink-muted)] hover:text-[var(--accent)]">
            ← Objectives
          </Link>
        </div>
      </header>
      <AnalyticsDashboard />
    </div>
  );
}
