"use client";

import { Suspense } from "react";
import { SpatialReports } from "@/components/SpatialReports";

export function AssessmentsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          Ward and zone assessments
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--ink-muted)]">
          Gap Index and inventory counts by GCC ward and zone. Filter the slice, open a unit
          brief, export CSV.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-[var(--ink-muted)]">Loading assessments…</p>}>
        <SpatialReports />
      </Suspense>
    </div>
  );
}
