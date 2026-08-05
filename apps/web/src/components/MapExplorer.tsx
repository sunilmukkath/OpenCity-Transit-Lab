"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Map, {
  Layer,
  NavigationControl,
  Popup,
  Source,
} from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import type { FeatureCollection } from "geojson";
import {
  fetchGeoJSONClient,
  fetchManifestClient,
  layerIsReady,
  type Manifest,
} from "@/lib/data-client";
import { StatusBadge } from "@/components/StatusBadge";
import { ProvenanceStrip } from "@/components/ProvenanceStrip";

type LayerKey =
  | "wards"
  | "zones"
  | "stops"
  | "shelters"
  | "mrts_stations"
  | "mrts_lines"
  | "hubs"
  | "catchment_400m"
  | "catchment_800m";

const LAYER_META: {
  key: LayerKey;
  label: string;
  defaultOn: boolean;
}[] = [
  { key: "wards", label: "GCC wards", defaultOn: true },
  { key: "zones", label: "GCC zones", defaultOn: false },
  { key: "catchment_800m", label: "800m stop catchment", defaultOn: false },
  { key: "catchment_400m", label: "400m stop catchment", defaultOn: true },
  { key: "stops", label: "Transit stops (GTFS)", defaultOn: true },
  { key: "shelters", label: "Bus shelters", defaultOn: false },
  { key: "mrts_lines", label: "MRTS lines", defaultOn: true },
  { key: "mrts_stations", label: "MRTS stations", defaultOn: true },
  { key: "hubs", label: "Hubs", defaultOn: true },
];

const CHENNAI = { longitude: 80.2707, latitude: 13.0827, zoom: 10.4 };
const MAP_HEIGHT = 620;

export function MapExplorer({
  audienceNote,
}: {
  audienceNote?: string;
}) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [data, setData] = useState<Partial<Record<LayerKey, FeatureCollection>>>(
    {}
  );
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(LAYER_META.map((l) => [l.key, l.defaultOn]))
  );
  const [popup, setPopup] = useState<{
    lng: number;
    lat: number;
    title: string;
    body: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setMapError(null);
      try {
        const m = await fetchManifestClient();
        if (cancelled) return;
        setManifest(m);
        const next: Partial<Record<LayerKey, FeatureCollection>> = {};
        if (m) {
          await Promise.all(
            LAYER_META.map(async ({ key }) => {
              const layer = m.layers[key];
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
      } catch (err) {
        if (!cancelled) {
          setMapError(err instanceof Error ? err.message : "Failed to load map data");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((key: string) => {
    setVisibility((v) => ({ ...v, [key]: !v[key] }));
  }, []);

  const onClick = useCallback((e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (!f) {
      setPopup(null);
      return;
    }
    const props = f.properties ?? {};
    const title = String(
      props.ward_label ||
        props.zone_label ||
        props.stop_name ||
        props.hub_name ||
        props.station_name ||
        props.shelter_name ||
        props.line_name ||
        f.layer?.id ||
        "Feature"
    );
    const body = Object.entries(props)
      .filter(([k]) => !["Description", "description"].includes(k))
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    setPopup({
      lng: e.lngLat.lng,
      lat: e.lngLat.lat,
      title,
      body,
    });
  }, []);

  const interactiveLayerIds = useMemo(() => {
    const ids: string[] = [];
    if (visibility.wards && data.wards) ids.push("wards-fill");
    if (visibility.stops && data.stops) ids.push("stops-circle");
    if (visibility.shelters && data.shelters) ids.push("shelters-circle");
    if (visibility.mrts_stations && data.mrts_stations)
      ids.push("mrts-stations-circle");
    if (visibility.hubs && data.hubs) ids.push("hubs-circle");
    return ids;
  }, [visibility, data]);

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
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="no-print space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--yellow)]">
            Map layers
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Only layers successfully ingested appear as toggles. Empty = unavailable.
          </p>
          {audienceNote ? (
            <p className="mt-2 rounded-md bg-[var(--accent-soft)] px-2 py-1.5 text-sm text-[var(--accent)]">
              {audienceNote}
            </p>
          ) : null}
        </div>

        <ul className="space-y-2">
          {LAYER_META.map(({ key, label }) => {
            const layer = manifest?.layers[key];
            const ready = Boolean(data[key]);
            return (
              <li
                key={key}
                className="flex items-start justify-between gap-2 rounded-lg border border-[var(--border)] px-2 py-2"
              >
                <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--ink)]">
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={!ready}
                    checked={Boolean(visibility[key] && ready)}
                    onChange={() => toggle(key)}
                  />
                  <span>
                    <span className="font-medium">{label}</span>
                    <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">
                      {ready
                        ? `${layer?.feature_count ?? data[key]?.features.length ?? 0} features`
                        : layer?.status === "unavailable"
                          ? layer.error || "Unavailable"
                          : "Not loaded"}
                    </span>
                  </span>
                </label>
                <StatusBadge
                  status={
                    ready
                      ? "loaded"
                      : (layer?.status as "unavailable") || "unavailable"
                  }
                />
              </li>
            );
          })}
        </ul>

        {stopCountExtent ? (
          <div className="rounded-lg bg-white/[0.05] p-3 text-xs text-[var(--ink-muted)]">
            Ward colour = GTFS stops inside ward (min {stopCountExtent.min}, max{" "}
            {stopCountExtent.max}). Not an equity score.
          </div>
        ) : (
          <div className="rounded-lg bg-white/[0.05] p-3 text-xs text-[var(--ink-muted)]">
            Ward fill is neutral until stop counts are available from a loaded GTFS
            layer.
          </div>
        )}

        {manifest ? (
          <ProvenanceStrip
            source="OpenCity CKAN + ChennaiGTFS + GCC MRTS"
            fetchedAt={manifest.generated_at}
          />
        ) : null}
      </aside>

      <div
        className="relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--map-wash)] shadow-sm"
        style={{ height: MAP_HEIGHT }}
      >
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--overlay)] text-sm text-[var(--ink-muted)]">
            Loading verified layers…
          </div>
        ) : null}
        {mapError ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-6 text-center text-sm text-[var(--danger)]">
            {mapError}
          </div>
        ) : null}
        {!mounted ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--ink-muted)]">
            Preparing map…
          </div>
        ) : (
          <Map
            initialViewState={CHENNAI}
            mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
            style={{ width: "100%", height: MAP_HEIGHT }}
            interactiveLayerIds={interactiveLayerIds}
            onClick={onClick}
            onError={(e) =>
              setMapError(
                e.error?.message || "Basemap failed to load. Check network / WebGL."
              )
            }
            cursor={interactiveLayerIds.length ? "pointer" : "grab"}
          >
            <NavigationControl position="top-right" />

            {visibility.catchment_800m && data.catchment_800m ? (
              <Source id="catchment-800" type="geojson" data={data.catchment_800m}>
                <Layer
                  id="catchment-800-fill"
                  type="fill"
                  paint={{ "fill-color": "#38bdf8", "fill-opacity": 0.08 }}
                />
              </Source>
            ) : null}

            {visibility.catchment_400m && data.catchment_400m ? (
              <Source id="catchment-400" type="geojson" data={data.catchment_400m}>
                <Layer
                  id="catchment-400-fill"
                  type="fill"
                  paint={{ "fill-color": "#2dd4bf", "fill-opacity": 0.14 }}
                />
              </Source>
            ) : null}

            {visibility.wards && data.wards ? (
              <Source id="wards" type="geojson" data={data.wards}>
                <Layer
                  id="wards-fill"
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
                    "fill-opacity": 0.55,
                  }}
                />
                <Layer
                  id="wards-line"
                  type="line"
                  paint={{
                    "line-color": "#94a3b8",
                    "line-width": 0.7,
                    "line-opacity": 0.7,
                  }}
                />
              </Source>
            ) : null}

            {visibility.zones && data.zones ? (
              <Source id="zones" type="geojson" data={data.zones}>
                <Layer
                  id="zones-line"
                  type="line"
                  paint={{ "line-color": "#e8a820", "line-width": 1.5 }}
                />
              </Source>
            ) : null}

            {visibility.mrts_lines && data.mrts_lines ? (
              <Source id="mrts-lines" type="geojson" data={data.mrts_lines}>
                <Layer
                  id="mrts-lines-line"
                  type="line"
                  paint={{ "line-color": "#fb923c", "line-width": 3 }}
                />
              </Source>
            ) : null}

            {visibility.stops && data.stops ? (
              <Source id="stops" type="geojson" data={data.stops}>
                <Layer
                  id="stops-circle"
                  type="circle"
                  paint={{
                    "circle-radius": 2.2,
                    "circle-color": "#38bdf8",
                    "circle-opacity": 0.8,
                  }}
                />
              </Source>
            ) : null}

            {visibility.shelters && data.shelters ? (
              <Source id="shelters" type="geojson" data={data.shelters}>
                <Layer
                  id="shelters-circle"
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
              <Source id="mrts-stations" type="geojson" data={data.mrts_stations}>
                <Layer
                  id="mrts-stations-circle"
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
              <Source id="hubs" type="geojson" data={data.hubs}>
                <Layer
                  id="hubs-circle"
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

            {popup ? (
              <Popup
                longitude={popup.lng}
                latitude={popup.lat}
                anchor="bottom"
                onClose={() => setPopup(null)}
                closeOnClick={false}
              >
                <strong className="text-[var(--ink)]">{popup.title}</strong>
                <pre className="mt-1 max-w-xs whitespace-pre-wrap text-[11px] text-[var(--ink-muted)]">
                  {popup.body}
                </pre>
              </Popup>
            ) : null}
          </Map>
        )}
      </div>
    </div>
  );
}
