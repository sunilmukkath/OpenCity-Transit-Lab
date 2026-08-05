"use client";

import { useEffect, useState } from "react";
import {
  fetchGeoJSONClient,
  fetchManifestClient,
  fetchReportsClient,
  layerIsReady,
  type Manifest,
} from "@/lib/data-client";
import { TransitMap, joinWardGapIndex } from "@/components/TransitMap";
import type { LayerData, MapLayerKey } from "@/lib/map-layers";

const MAP_HEIGHT = 560;
const LIGHT: MapLayerKey[] = [
  "metro_area_boundaries",
  "omr_corridor",
  "connectivity_need",
  "slums",
  "mrts_lines",
  "mrts_stations",
  "hubs",
];
const MEDIUM: MapLayerKey[] = ["wards", "zones", "corridor_aois"];
const POINTS: MapLayerKey[] = ["stops", "shelters"];
const HEAVY: MapLayerKey[] = ["catchment_400m", "catchment_800m"];

async function loadBatch(
  m: Manifest,
  keys: MapLayerKey[],
  gapByLabel: Map<string, { gap_index: number; gap_band: string }>
): Promise<LayerData> {
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
}: {
  visibility: Record<string, boolean>;
}) {
  const [data, setData] = useState<LayerData>({});
  const [loading, setLoading] = useState(true);
  const [loadingHeavy, setLoadingHeavy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [manifest, reports] = await Promise.all([
        fetchManifestClient(),
        fetchReportsClient(),
      ]);
      const gapByLabel = new Map<string, { gap_index: number; gap_band: string }>();
      for (const w of reports?.wards ?? []) {
        gapByLabel.set(w.label, {
          gap_index: w.gap_index ?? w.priority_score,
          gap_band: w.gap_band ?? "moderate",
        });
      }

      if (!manifest) {
        if (!cancelled) setLoading(false);
        return;
      }

      const light = await loadBatch(manifest, LIGHT, gapByLabel);
      if (cancelled) return;
      setData((prev) => ({ ...prev, ...light }));

      const medium = await loadBatch(manifest, MEDIUM, gapByLabel);
      if (cancelled) return;
      setData((prev) => ({ ...prev, ...medium }));

      const points = await loadBatch(manifest, POINTS, gapByLabel);
      if (cancelled) return;
      setData((prev) => ({ ...prev, ...points }));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const want400 = visibility.catchment_400m;
    const want800 = visibility.catchment_800m;
    if (!want400 && !want800) return;

    (async () => {
      setLoadingHeavy(true);
      const manifest = await fetchManifestClient();
      if (!manifest || cancelled) {
        if (!cancelled) setLoadingHeavy(false);
        return;
      }
      const needed = HEAVY.filter((k) => {
        if (k === "catchment_400m" && !want400) return false;
        if (k === "catchment_800m" && !want800) return false;
        return true;
      });
      const next = await loadBatch(manifest, needed, new Map());
      if (!cancelled && Object.keys(next).length) {
        setData((prev) => {
          const merged = { ...prev };
          for (const [k, v] of Object.entries(next)) {
            if (!merged[k as MapLayerKey]) merged[k as MapLayerKey] = v;
          }
          return merged;
        });
      }
      if (!cancelled) setLoadingHeavy(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [visibility.catchment_400m, visibility.catchment_800m]);

  const choropleth =
    visibility.wards && !visibility.stops ? ("gap" as const) : ("stops" as const);

  return (
    <TransitMap
      data={data}
      visibility={visibility}
      choropleth={choropleth}
      height={MAP_HEIGHT}
      loading={loading || loadingHeavy}
      interactive
    />
  );
}
