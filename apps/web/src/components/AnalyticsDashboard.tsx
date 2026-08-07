"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SpatialReports } from "@/components/SpatialReports";
import { InsightsPanel } from "@/components/InsightsPanel";

type AnalyticsTab = "insights" | "spatial";

const TABS: { id: AnalyticsTab; label: string }[] = [
  { id: "spatial", label: "Wards" },
  { id: "insights", label: "Insights" },
];

export function AnalyticsDashboard() {
  const [tab, setTab] = useState<AnalyticsTab>("spatial");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTab(params.get("tab") === "insights" ? "insights" : "spatial");
  }, []);

  const selectTab = (next: AnalyticsTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState({}, "", url.toString());
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          className="flex gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-1"
          aria-label="Reports"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTab(t.id)}
              className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${
                tab === t.id
                  ? "bg-[rgba(255,229,102,0.14)] text-[var(--yellow)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--accent)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <Link href="/sources" className="text-xs font-semibold text-[var(--accent)] hover:underline">
          Data sources →
        </Link>
      </div>

      {tab === "insights" ? <InsightsPanel /> : <SpatialReports />}
    </div>
  );
}
