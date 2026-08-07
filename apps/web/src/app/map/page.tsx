import Link from "next/link";
import { Suspense } from "react";
import { MapExplorerClient } from "@/components/MapExplorerClient";
import { ExportBar } from "@/components/ExportBar";
import { SectionEyebrow, SpectrumRule } from "@/components/BrandMotif";
import { fetchManifest, fetchMetrics } from "@/lib/data";

export default async function MapPage() {
  const [manifest, metrics] = await Promise.all([fetchManifest(), fetchMetrics()]);

  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,rgba(16,52,102,0.9),rgba(10,31,74,0.96))] px-6 py-7">
        <SpectrumRule className="absolute inset-x-0 top-0" />
        <SectionEyebrow>Map</SectionEyebrow>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          See gaps spatially
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">
          Audience presets, filters, and GIS export. Filters sync via the URL across hubs.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/" className="et-btn-ghost">
            ← Hubs
          </Link>
        </div>
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
