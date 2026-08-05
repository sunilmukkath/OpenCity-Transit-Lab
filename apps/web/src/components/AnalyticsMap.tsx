"use client";

import { useEffect, useMemo, useState } from "react";
import Map, { Layer, NavigationControl, Source } from "react-map-gl/maplibre";
import type { FeatureCollection } from "geojson";
import { fetchGeoJSONClient, fetchManifestClient, layerIsReady } from "@/lib/data-client";

const CHENNAI = { longitude: 80.2707, latitude: 13.0827, zoom: 10.2 };
const MAP_HEIGHT = 560;

const LAYER_FILES = [
  "wards",
  "zones",
  "stops",
  "shelters",
  "mrts_stations",
  "mrts_lines",
  "hubs",
  "catchment_400m",
  "catchment_800m",
] as const;

type LayerId = (typeof LAYER_FILES)[number];

export function AnalyticsMap({
  visibility,
}: {
  visibility: Record<string, boolean>;
}) {
  const [data, setData] = useState<Partial<Record<LayerId, FeatureCollection>>>({});
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const manifest = await fetchManifestClient();
      const next: Partial<Record<LayerId, FeatureCollection>> = {};
      if (manifest) {
        await Promise.all(
          LAYER_FILES.map(async (key) => {
            const layer = manifest.layers[key];
            if (layerIsReady(layer) && layer.file) {
              const fc = await fetchGeoJSONClient(layer.file);
              if (fc) next[key] = fc;
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

  const stopCountExtent = useMemo(() => {
    const wards = data.wards;
    if (!wards) return null;
    const counts = wards.features
      .map((f) => Number(f.properties?.stop_count))
      .filter((n) => Number.isFinite(n));
    if (!counts.length) return null;
    return { min: Math.min(...counts), max: Math.max(...counts) };
  }, [data.wards]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--map-wash)] shadow-sm"
      style={{ height: MAP_HEIGHT }}
    >
      {loading || !mounted ? (
        <div className="flex h-full items-center justify-center text-sm text-[var(--ink-muted)]">
          {loading ? "Loading layer geometries…" : "Preparing map…"}
        </div>
      ) : (
        <Map
          initialViewState={CHENNAI}
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
          style={{ width: "100%", height: MAP_HEIGHT }}
          cursor="grab"
        >
          <NavigationControl position="top-right" />

          {visibility.catchment_800m && data.catchment_800m ? (
            <Source id="a-catchment-800" type="geojson" data={data.catchment_800m}>
              <Layer
                id="a-catchment-800-fill"
                type="fill"
                paint={{ "fill-color": "#38bdf8", "fill-opacity": 0.08 }}
              />
            </Source>
          ) : null}

          {visibility.catchment_400m && data.catchment_400m ? (
            <Source id="a-catchment-400" type="geojson" data={data.catchment_400m}>
              <Layer
                id="a-catchment-400-fill"
                type="fill"
                paint={{ "fill-color": "#2dd4bf", "fill-opacity": 0.14 }}
              />
            </Source>
          ) : null}

          {visibility.wards && data.wards ? (
            <Source id="a-wards" type="geojson" data={data.wards}>
              <Layer
                id="a-wards-fill"
                type="fill"
                paint={{
                  "fill-color": stopCountExtent
                    ? [
                        "interpolate",
                        ["linear"],
                        ["coalesce", ["get", "stop_count"], 0],
                        stopCountExtent.min,
                        "#103466",
                        stopCountExtent.max,
                        "#38bdf8",
                      ]
                    : "#1a3a6e",
                  "fill-opacity": 0.5,
                }}
              />
              <Layer
                id="a-wards-line"
                type="line"
                paint={{ "line-color": "#94a3b8", "line-width": 0.7 }}
              />
            </Source>
          ) : null}

          {visibility.zones && data.zones ? (
            <Source id="a-zones" type="geojson" data={data.zones}>
              <Layer
                id="a-zones-line"
                type="line"
                paint={{ "line-color": "#e8a820", "line-width": 1.5 }}
              />
            </Source>
          ) : null}

          {visibility.mrts_lines && data.mrts_lines ? (
            <Source id="a-mrts-lines" type="geojson" data={data.mrts_lines}>
              <Layer
                id="a-mrts-lines-line"
                type="line"
                paint={{ "line-color": "#fb923c", "line-width": 3 }}
              />
            </Source>
          ) : null}

          {visibility.stops && data.stops ? (
            <Source id="a-stops" type="geojson" data={data.stops}>
              <Layer
                id="a-stops-circle"
                type="circle"
                paint={{
                  "circle-radius": 2,
                  "circle-color": "#38bdf8",
                  "circle-opacity": 0.75,
                }}
              />
            </Source>
          ) : null}

          {visibility.shelters && data.shelters ? (
            <Source id="a-shelters" type="geojson" data={data.shelters}>
              <Layer
                id="a-shelters-circle"
                type="circle"
                paint={{
                  "circle-radius": 3,
                  "circle-color": "#2dd4bf",
                  "circle-stroke-width": 1,
                  "circle-stroke-color": "#0a1f4a",
                }}
              />
            </Source>
          ) : null}

          {visibility.mrts_stations && data.mrts_stations ? (
            <Source id="a-mrts-stations" type="geojson" data={data.mrts_stations}>
              <Layer
                id="a-mrts-stations-circle"
                type="circle"
                paint={{
                  "circle-radius": 5,
                  "circle-color": "#fb923c",
                  "circle-stroke-width": 1.5,
                  "circle-stroke-color": "#0a1f4a",
                }}
              />
            </Source>
          ) : null}

          {visibility.hubs && data.hubs ? (
            <Source id="a-hubs" type="geojson" data={data.hubs}>
              <Layer
                id="a-hubs-circle"
                type="circle"
                paint={{
                  "circle-radius": 6,
                  "circle-color": "#e8a820",
                  "circle-stroke-width": 2,
                  "circle-stroke-color": "#0a1f4a",
                }}
              />
            </Source>
          ) : null}
        </Map>
      )}
    </div>
  );
}
