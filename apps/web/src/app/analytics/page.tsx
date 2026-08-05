import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";

export default function AnalyticsPage() {
  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--yellow)]">
          Analytics
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
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
