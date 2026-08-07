import { Suspense } from "react";
import { MapExplorerClient } from "@/components/MapExplorerClient";
import { ExportBar } from "@/components/ExportBar";
import { fetchManifest, fetchMetrics } from "@/lib/data";

export default async function MapPage() {
  const [manifest, metrics] = await Promise.all([fetchManifest(), fetchMetrics()]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          Map
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--ink-muted)]">
          Pick a view, filter wards, export GIS layers.
        </p>
      </header>
      <Suspense
        fallback={
          <div className="flex h-[620px] items-center justify-center rounded-xl border border-[var(--border)] text-sm text-[var(--ink-muted)]">
            Loading map…
          </div>
        }
      >
        <MapExplorerClient />
      </Suspense>
      <ExportBar manifest={manifest} metrics={metrics} />
    </div>
  );
}
