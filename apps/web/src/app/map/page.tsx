import { MapExplorerClient } from "@/components/MapExplorerClient";
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
    <div className="space-y-5">
      <MapExplorerClient audienceNote={note} />
      <ExportBar manifest={manifest} metrics={metrics} />
    </div>
  );
}
