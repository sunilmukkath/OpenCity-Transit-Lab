import Link from "next/link";
import { MapExplorerClient } from "@/components/MapExplorerClient";
import { ExportBar } from "@/components/ExportBar";
import { NextFlowLink } from "@/components/LabFlow";
import { SectionEyebrow, SpectrumRule } from "@/components/BrandMotif";
import { fetchManifest, fetchMetrics } from "@/lib/data";

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ audience?: string }>;
}) {
  const params = await searchParams;
  const audience = params.audience;
  const [manifest, metrics] = await Promise.all([fetchManifest(), fetchMetrics()]);

  const note =
    audience === "traffic"
      ? "Traffic view: focus on hubs, stop density, and catchment overlays. Export GeoJSON for GIS."
      : undefined;

  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,rgba(16,52,102,0.9),rgba(10,31,74,0.96))] px-6 py-7">
        <SpectrumRule className="absolute inset-x-0 top-0" />
        <SectionEyebrow>Step 3 · Map</SectionEyebrow>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          See gaps spatially
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">
          After Objectives: filter wards, toggle layers, then continue to Actions.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <NextFlowLink />
          <Link href="/objectives" className="et-btn-ghost">
            ← Objectives
          </Link>
        </div>
      </header>
      <MapExplorerClient audienceNote={note} />
      <div className="flex flex-wrap gap-3">
        <NextFlowLink />
        <Link href="/objectives" className="et-btn-ghost">
          ← Objectives
        </Link>
      </div>
      <ExportBar manifest={manifest} metrics={metrics} />
    </div>
  );
}
