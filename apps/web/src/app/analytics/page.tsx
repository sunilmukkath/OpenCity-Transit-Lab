import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { SectionEyebrow, SpectrumRule } from "@/components/BrandMotif";

export default function AnalyticsPage() {
  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,rgba(16,52,102,0.9),rgba(10,31,74,0.96))] px-6 py-7 sm:px-8">
        <SpectrumRule className="absolute inset-x-0 top-0" />
        <SectionEyebrow>Supporting reports</SectionEyebrow>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          Ward inventory &amp; map workbench
        </h1>
        <p className="mt-2 max-w-3xl text-[var(--ink-muted)]">
          Use after Objectives: drill into Gap Index by ward/zone, toggle inventory layers, and
          audit sources. Primary answers to Datajam problem statements live under{" "}
          <a href="/objectives" className="font-semibold text-[var(--accent)]">
            Objectives
          </a>
          .
        </p>
      </header>
      <AnalyticsDashboard />
    </div>
  );
}
