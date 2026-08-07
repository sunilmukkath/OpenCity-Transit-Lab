"use client";

import Link from "next/link";
import {
  DashboardFilterBar,
  FilterImpactStrip,
  useFilteredUniverse,
} from "@/components/DashboardFilterBar";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";

export function HomeImpactPanel() {
  const [filters, setFilters] = useDashboardFilters({ unit: "ward" });
  const { loading, filtered, wardOptions, zoneOptions, cityMeanGap } =
    useFilteredUniverse(filters);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--yellow)]">
            Live slice
          </p>
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
            Filter the city before you decide
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--ink-muted)]">
            Ward · zone · gap · slum vs non-slum · Economic Census activity · PT index — same
            controls as Objectives and Reports.
          </p>
        </div>
        <Link href="/objectives" className="text-sm font-semibold text-[var(--accent)]">
          Continue to charts →
        </Link>
      </div>
      <DashboardFilterBar
        filters={filters}
        onChange={setFilters}
        wardOptions={wardOptions}
        zoneOptions={zoneOptions}
        resultCount={filtered.filter((u) => u.unit_type === "ward").length}
        compact
      />
      {loading ? (
        <p className="text-sm text-[var(--ink-muted)]">Loading ward universe…</p>
      ) : (
        <FilterImpactStrip units={filtered} cityMeanGap={cityMeanGap} />
      )}
    </section>
  );
}
