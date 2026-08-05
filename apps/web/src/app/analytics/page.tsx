import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { SectionEyebrow, SpectrumRule } from "@/components/BrandMotif";

export default function AnalyticsPage() {
  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,rgba(16,52,102,0.9),rgba(10,31,74,0.96))] px-6 py-7 sm:px-8">
        <SpectrumRule className="absolute inset-x-0 top-0" />
        <SectionEyebrow>Analytics</SectionEyebrow>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          Transit analytics &amp; area reports
        </h1>
        <p className="mt-2 max-w-3xl text-[var(--ink-muted)]">
          City inventory map, ward / zone / area reports with inventory-based recommendations,
          and a filterable catalog of every verified source. Equity scores stay withheld until
          census joins are validated.
        </p>
      </header>
      <AnalyticsDashboard />
    </div>
  );
}
