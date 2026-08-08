"use client";

import { useEffect, useState } from "react";
import {
  fetchGeoJSONClient,
  fetchManifestClient,
  fetchReportsClient,
  layerIsReady,
} from "@/lib/data-client";
import { TransitMap, joinWardGapIndex } from "@/components/TransitMap";
import type { LayerData, MapLayerKey } from "@/lib/map-layers";

const CORE: MapLayerKey[] = [
  "walk_isochrones",
  "omr_corridor",
  "metro_area_boundaries",
  "connectivity_need",
  "mrts_lines",
  "mrts_stations",
  "hubs",
  "railway_stations",
  "wards",
  "stops",
  "schools",
  "healthcare",
  "parks",
  "public_toilets",
  "anganwadis",
  "bus_stop_audit",
];

async function loadBatch(
  m: Awaited<ReturnType<typeof fetchManifestClient>>,
  keys: MapLayerKey[],
  gapByLabel: Map<
    string,
    { gap_index: number; gap_band: string; mean_walk_min?: number | null }
  >
): Promise<LayerData> {
  if (!m) return {};
  const next: LayerData = {};
  await Promise.all(
    keys.map(async (key) => {
      const layer = m.layers[key];
      if (!layerIsReady(layer) || !layer.file) return;
      const fc = await fetchGeoJSONClient(layer.file);
      if (!fc) return;
      next[key] =
        key === "wards" && gapByLabel.size ? joinWardGapIndex(fc, gapByLabel) : fc;
    })
  );
  return next;
}

export function AnalyticsMap({
  visibility,
  height = 560,
  className,
}: {
  visibility: Record<string, boolean>;
  height?: number;
  className?: string;
}) {
  const [data, setData] = useState<LayerData>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [manifest, reports] = await Promise.all([
        fetchManifestClient(),
        fetchReportsClient(),
      ]);
      const gapByLabel = new Map<
        string,
        { gap_index: number; gap_band: string; mean_walk_min?: number | null }
      >();
      for (const w of reports?.wards ?? []) {
        gapByLabel.set(w.label, {
          gap_index: w.gap_index ?? w.priority_score,
          gap_band: w.gap_band ?? "moderate",
          mean_walk_min: w.mean_walk_min ?? null,
        });
      }

      if (!manifest) {
        if (!cancelled) setLoading(false);
        return;
      }

      const core = await loadBatch(manifest, CORE, gapByLabel);
      if (cancelled) return;
      setData(core);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const choropleth =
    visibility.wards && !visibility.stops ? ("gap" as const) : ("stops" as const);

  return (
    <TransitMap
      data={data}
      visibility={visibility}
      choropleth={choropleth}
      height={height}
      loading={loading}
      interactive
      className={className}
    />
  );
}
