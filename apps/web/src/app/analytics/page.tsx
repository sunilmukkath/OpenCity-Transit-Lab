import { Suspense } from "react";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";

export default function AnalyticsPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          Reports
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--ink-muted)]">
          Ward Gap Index workbench and feeder insights. Filters sync in the URL.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-[var(--ink-muted)]">Loading reports…</p>}>
        <AnalyticsDashboard />
      </Suspense>
    </div>
  );
}
