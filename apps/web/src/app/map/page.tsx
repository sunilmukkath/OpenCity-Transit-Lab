import { MapExplorerClient } from "@/components/MapExplorerClient";
import { ExportBar } from "@/components/ExportBar";
import { fetchManifest, fetchMetrics } from "@/lib/data";
import { SectionEyebrow, SpectrumRule } from "@/components/BrandMotif";

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
      <header className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,rgba(16,52,102,0.9),rgba(10,31,74,0.96))] px-6 py-7 sm:px-8">
        <SpectrumRule className="absolute inset-x-0 top-0" />
        <SectionEyebrow>Network map</SectionEyebrow>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          See coverage as it actually loaded
        </h1>
        <p className="mt-2 max-w-3xl text-[var(--ink-muted)]">
          Basemap first, then verified layers. Use presets for coverage, Gap Index, hubs, or
          walk catchments. Click any feature for inventory details.
        </p>
      </header>
      <MapExplorerClient audienceNote={note} />
      <ExportBar manifest={manifest} metrics={metrics} />
    </div>
  );
}
