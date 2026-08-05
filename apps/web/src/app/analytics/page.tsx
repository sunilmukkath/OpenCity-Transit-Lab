import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";

export default function AnalyticsPage() {
  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--yellow)]">
          Analytics
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          Data sources dashboard
        </h1>
        <p className="mt-2 max-w-3xl text-[var(--ink-muted)]">
          Map and filter every ingested dataset — administrative boundaries, transit stops,
          shelters, rail hubs, catchments, realtime plugs, and known gaps. Only verified
          layers are drawn.
        </p>
      </header>
      <AnalyticsDashboard />
    </div>
  );
}
