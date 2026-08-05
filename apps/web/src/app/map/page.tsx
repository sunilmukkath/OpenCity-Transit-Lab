import { MapExplorer } from "@/components/MapExplorer";
import { ExportBar } from "@/components/ExportBar";
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
    <div className="space-y-4">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          Network map
        </h1>
        <p className="mt-1 text-[var(--ink-muted)]">
          Real GCC / transit / shelter geometries only. Toggle layers that loaded successfully.
        </p>
      </header>
      <MapExplorer audienceNote={note} />
      <ExportBar manifest={manifest} metrics={metrics} />
    </div>
  );
}
