import { Suspense } from "react";
import Link from "next/link";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { SectionEyebrow, SpectrumRule } from "@/components/BrandMotif";

export default function AnalyticsPage() {
  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,rgba(16,52,102,0.9),rgba(10,31,74,0.96))] px-6 py-7 sm:px-8">
        <SpectrumRule className="absolute inset-x-0 top-0" />
        <SectionEyebrow>Reports</SectionEyebrow>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          Ward inventory &amp; map workbench
        </h1>
        <p className="mt-2 max-w-3xl text-[var(--ink-muted)]">
          Gap Index by ward/zone, feeder insights, and layer inventory. Provenance lives on{" "}
          <Link href="/sources" className="font-semibold text-[var(--accent)]">
            Sources
          </Link>
          .
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/for/planner" className="font-semibold text-[var(--accent)]">
            ← Planner hub
          </Link>
        </div>
      </header>
      <Suspense fallback={<p className="text-sm text-[var(--ink-muted)]">Loading reports…</p>}>
        <AnalyticsDashboard />
      </Suspense>
    </div>
  );
}
