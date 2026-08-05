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

const MAP_HEIGHT = 560;
const CORE: MapLayerKey[] = [
  "wards",
  "zones",
  "metro_area_boundaries",
  "corridor_aois",
  "omr_corridor",
  "stops",
  "shelters",
  "mrts_stations",
  "mrts_lines",
  "hubs",
];
const HEAVY: MapLayerKey[] = ["catchment_400m", "catchment_800m"];

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

      const next: LayerData = {};
      if (manifest) {
        await Promise.all(
          CORE.map(async (key) => {
            const layer = manifest.layers[key];
            if (layerIsReady(layer) && layer.file) {
              const fc = await fetchGeoJSONClient(layer.file);
              if (!fc) return;
              next[key] =
                key === "wards" && gapByLabel.size
                  ? joinWardGapIndex(fc, gapByLabel)
                  : fc;
            }
          })
        );
      }
      if (!cancelled) {
        setData(next);
        setLoading(false);
      }
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
      const next: LayerData = {};
      await Promise.all(
        needed.map(async (key) => {
          const layer = manifest.layers[key];
          if (layerIsReady(layer) && layer.file) {
            const fc = await fetchGeoJSONClient(layer.file);
            if (fc) next[key] = fc;
          }
        })
      );
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
