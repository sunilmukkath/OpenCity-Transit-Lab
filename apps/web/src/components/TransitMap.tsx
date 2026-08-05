"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, {
  Layer,
  NavigationControl,
  Popup,
  Source,
  type MapRef,
} from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import type { ExpressionSpecification } from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import {
  BASEMAP_LABELS,
  BASEMAP_STYLES,
  CHENNAI_VIEW,
  type ChoroplethMode,
  type LayerData,
  type MapLayerKey,
} from "@/lib/map-layers";

// Ensure MapLibre CSS is present even if global @import is stripped.
import "maplibre-gl/dist/maplibre-gl.css";

const MAP_HEIGHT_DEFAULT = 640;

type PopupState = {
  lng: number;
  lat: number;
  title: string;
  body: string;
};

function extentOf(
  fc: FeatureCollection<Geometry> | undefined,
  prop: string
): { min: number; max: number } | null {
  if (!fc) return null;
  const values = fc.features
    .map((f) => Number(f.properties?.[prop]))
    .filter((n) => Number.isFinite(n));
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return { min, max: max + 1 };
  return { min, max };
}

function ascendingStops(stops: number[]): number[] {
  const out: number[] = [];
  for (const n of stops) {
    const v = Number(n);
    if (!Number.isFinite(v)) continue;
    if (!out.length || v > out[out.length - 1]) out.push(v);
    else if (v <= out[out.length - 1]) out.push(out[out.length - 1] + 0.01);
  }
  return out;
}

function formatPopupProps(props: Record<string, unknown>): string {
  const prefer = [
    "gap_index",
    "gap_band",
    "stop_count",
    "shelter_count",
    "hub_count",
    "area_km2",
    "stops_per_km2",
    "hub_type",
    "mode",
  ];
  const lines: string[] = [];
  for (const key of prefer) {
    if (props[key] !== undefined && props[key] !== null && props[key] !== "") {
      lines.push(`${key}: ${props[key]}`);
    }
  }
  if (!lines.length) {
    return Object.entries(props)
      .filter(([k]) => !["Description", "description"].includes(k))
      .slice(0, 6)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
  }
  return lines.join("\n");
}

export function TransitMap({
  data,
  visibility,
  choropleth = "stops",
  height = MAP_HEIGHT_DEFAULT,
  loading = false,
  interactive = true,
}: {
  data: LayerData;
  visibility: Record<string, boolean>;
  choropleth?: ChoroplethMode;
  height?: number;
  loading?: boolean;
  interactive?: boolean;
}) {
  const mapRef = useRef<MapRef>(null);
  const [styleIndex, setStyleIndex] = useState(0);
  const [mapError, setMapError] = useState<string | null>(null);
  const [basemapReady, setBasemapReady] = useState(false);
  const [popup, setPopup] = useState<PopupState | null>(null);

  const stopExtent = useMemo(() => extentOf(data.wards, "stop_count"), [data.wards]);
  const gapExtent = useMemo(() => extentOf(data.wards, "gap_index"), [data.wards]);

  const interactiveLayerIds = useMemo(() => {
    if (!interactive) return [];
    const ids: string[] = [];
    if (visibility.wards && data.wards) ids.push("tm-wards-fill");
    if (visibility.zones && data.zones) ids.push("tm-zones-fill");
    if (visibility.stops && data.stops) ids.push("tm-stops-circle");
    if (visibility.shelters && data.shelters) ids.push("tm-shelters-circle");
    if (visibility.mrts_stations && data.mrts_stations) ids.push("tm-mrts-stations-circle");
    if (visibility.hubs && data.hubs) ids.push("tm-hubs-circle");
    return ids;
  }, [visibility, data, interactive]);

  const onClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!interactive) return;
      const f = e.features?.[0];
      if (!f) {
        setPopup(null);
        return;
      }
      const props = (f.properties ?? {}) as Record<string, unknown>;
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
      setPopup({
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        title,
        body: formatPopupProps(props),
      });
    },
    [interactive]
  );

  const forceResize = useCallback(() => {
    try {
      mapRef.current?.getMap()?.resize();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    forceResize();
    const onWin = () => forceResize();
    window.addEventListener("resize", onWin);
    const timers = [80, 250, 800, 1600].map((ms) => window.setTimeout(forceResize, ms));
    // Never leave the UI stuck on "Drawing basemap…"
    const readyFallback = window.setTimeout(() => setBasemapReady(true), 3500);
    return () => {
      window.removeEventListener("resize", onWin);
      timers.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(readyFallback);
    };
  }, [forceResize, height, styleIndex]);

  // High-contrast fills — previous navy (#103466) vanished on Dark Matter
  const wardFillColor = useMemo((): ExpressionSpecification | string => {
    if (choropleth === "gap" && gapExtent) {
      const [a, b, c, d] = ascendingStops([
        gapExtent.min,
        Math.min(gapExtent.max, Math.max(gapExtent.min + 1, 25)),
        Math.min(gapExtent.max, Math.max(gapExtent.min + 2, 45)),
        Math.max(gapExtent.max, 70),
      ]);
      return [
        "interpolate",
        ["linear"],
        ["coalesce", ["to-number", ["get", "gap_index"]], 0],
        a,
        "#14b8a6",
        b,
        "#eab308",
        c,
        "#f97316",
        d,
        "#f43f5e",
      ];
    }
    if (stopExtent) {
      return [
        "interpolate",
        ["linear"],
        ["coalesce", ["to-number", ["get", "stop_count"]], 0],
        stopExtent.min,
        "#bfdbfe",
        stopExtent.max,
        "#0369a1",
      ];
    }
    return "#7dd3fc";
  }, [choropleth, gapExtent, stopExtent]);

  const styleUrl = BASEMAP_STYLES[Math.min(styleIndex, BASEMAP_STYLES.length - 1)];

  const markReady = useCallback(() => {
    setBasemapReady(true);
    setMapError(null);
    forceResize();
  }, [forceResize]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[#dbe4ee] shadow-sm"
      style={{ height, minHeight: height }}
    >
      {loading ? (
        <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-md border border-[var(--border)] bg-[rgba(8,13,26,0.82)] px-3 py-1.5 text-xs text-[var(--ink)]">
          Loading layers…
        </div>
      ) : null}

      <div className="absolute bottom-3 right-3 z-20 flex flex-wrap gap-1">
        {BASEMAP_STYLES.map((_, i) => (
          <button
            key={BASEMAP_LABELS[i]}
            type="button"
            onClick={() => {
              setBasemapReady(false);
              setMapError(null);
              setStyleIndex(i);
            }}
            className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${
              styleIndex === i
                ? "border-[var(--yellow)] bg-[rgba(8,13,26,0.88)] text-[var(--yellow)]"
                : "border-[var(--border)] bg-[rgba(8,13,26,0.72)] text-[var(--ink-muted)]"
            }`}
          >
            {BASEMAP_LABELS[i]}
          </button>
        ))}
      </div>

      {mapError ? (
        <div className="absolute inset-x-3 top-3 z-30 rounded-lg border border-[var(--danger)] bg-[rgba(8,13,26,0.92)] p-3 text-sm text-[var(--danger)]">
          <p>{mapError}</p>
          {styleIndex < BASEMAP_STYLES.length - 1 ? (
            <button
              type="button"
              className="mt-2 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--ink)]"
              onClick={() => {
                setMapError(null);
                setBasemapReady(false);
                setStyleIndex((i) => i + 1);
              }}
            >
              Try next basemap
            </button>
          ) : null}
        </div>
      ) : null}

      {!basemapReady && !mapError ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[rgba(219,228,238,0.55)] text-sm font-medium text-slate-700">
          Drawing basemap…
        </div>
      ) : null}

      <Map
        key={`basemap-${styleIndex}`}
        ref={mapRef}
        initialViewState={CHENNAI_VIEW}
        mapStyle={styleUrl}
        style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
        interactiveLayerIds={interactiveLayerIds}
        onClick={onClick}
        onLoad={markReady}
        onIdle={markReady}
        onError={(e) => {
          const msg = e.error?.message || "Basemap failed to load";
          if (/tile|image|sprite|glyph|favicon/i.test(msg)) return;
          setMapError(msg);
        }}
        cursor={interactiveLayerIds.length ? "pointer" : "grab"}
        attributionControl={{ compact: true }}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {visibility.corridor_aois && data.corridor_aois ? (
          <Source id="tm-corridor-aois" type="geojson" data={data.corridor_aois}>
            <Layer
              id="tm-corridor-aois-fill"
              type="fill"
              paint={{ "fill-color": "#8b5cf6", "fill-opacity": 0.08 }}
            />
            <Layer
              id="tm-corridor-aois-line"
              type="line"
              paint={{ "line-color": "#7c3aed", "line-width": 1.5, "line-dasharray": [2, 1] }}
            />
          </Source>
        ) : null}

        {visibility.metro_area_boundaries && data.metro_area_boundaries ? (
          <Source id="tm-metro-boundaries" type="geojson" data={data.metro_area_boundaries}>
            <Layer
              id="tm-metro-boundaries-fill"
              type="fill"
              paint={{ "fill-color": "#db2777", "fill-opacity": 0.12 }}
            />
            <Layer
              id="tm-metro-boundaries-line"
              type="line"
              paint={{ "line-color": "#be185d", "line-width": 2.2 }}
            />
          </Source>
        ) : null}

        {visibility.omr_corridor && data.omr_corridor ? (
          <Source id="tm-omr" type="geojson" data={data.omr_corridor}>
            <Layer
              id="tm-omr-line"
              type="line"
              paint={{
                "line-color": "#7c3aed",
                "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 6],
              }}
            />
          </Source>
        ) : null}

        {visibility.catchment_800m && data.catchment_800m ? (
          <Source id="tm-catchment-800" type="geojson" data={data.catchment_800m}>
            <Layer
              id="tm-catchment-800-fill"
              type="fill"
              paint={{ "fill-color": "#0284c7", "fill-opacity": 0.12 }}
            />
          </Source>
        ) : null}

        {visibility.catchment_400m && data.catchment_400m ? (
          <Source id="tm-catchment-400" type="geojson" data={data.catchment_400m}>
            <Layer
              id="tm-catchment-400-fill"
              type="fill"
              paint={{ "fill-color": "#0d9488", "fill-opacity": 0.18 }}
            />
          </Source>
        ) : null}

        {visibility.wards && data.wards ? (
          <Source id="tm-wards" type="geojson" data={data.wards}>
            <Layer
              id="tm-wards-fill"
              type="fill"
              paint={{
                "fill-color": wardFillColor,
                "fill-opacity": 0.55,
              }}
            />
            <Layer
              id="tm-wards-line"
              type="line"
              paint={{
                "line-color": "#0f172a",
                "line-width": 1.1,
                "line-opacity": 0.9,
              }}
            />
          </Source>
        ) : null}

        {visibility.zones && data.zones ? (
          <Source id="tm-zones" type="geojson" data={data.zones}>
            <Layer
              id="tm-zones-fill"
              type="fill"
              paint={{ "fill-color": "#f59e0b", "fill-opacity": 0.08 }}
            />
            <Layer
              id="tm-zones-line"
              type="line"
              paint={{ "line-color": "#b45309", "line-width": 2 }}
            />
          </Source>
        ) : null}

        {visibility.mrts_lines && data.mrts_lines ? (
          <Source id="tm-mrts-lines" type="geojson" data={data.mrts_lines}>
            <Layer
              id="tm-mrts-lines-line"
              type="line"
              paint={{
                "line-color": "#ea580c",
                "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 14, 5],
              }}
            />
          </Source>
        ) : null}

        {visibility.stops && data.stops ? (
          <Source id="tm-stops" type="geojson" data={data.stops}>
            <Layer
              id="tm-stops-circle"
              type="circle"
              paint={{
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  9,
                  1.6,
                  12,
                  3,
                  15,
                  5.5,
                ],
                "circle-color": "#0369a1",
                "circle-opacity": 0.9,
                "circle-stroke-width": 1,
                "circle-stroke-color": "#ffffff",
              }}
            />
          </Source>
        ) : null}

        {visibility.shelters && data.shelters ? (
          <Source id="tm-shelters" type="geojson" data={data.shelters}>
            <Layer
              id="tm-shelters-circle"
              type="circle"
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 14, 5],
                "circle-color": "#0f766e",
                "circle-stroke-width": 1,
                "circle-stroke-color": "#ffffff",
              }}
            />
          </Source>
        ) : null}

        {visibility.mrts_stations && data.mrts_stations ? (
          <Source id="tm-mrts-stations" type="geojson" data={data.mrts_stations}>
            <Layer
              id="tm-mrts-stations-circle"
              type="circle"
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4.5, 14, 8],
                "circle-color": "#ea580c",
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
              }}
            />
          </Source>
        ) : null}

        {visibility.hubs && data.hubs ? (
          <Source id="tm-hubs" type="geojson" data={data.hubs}>
            <Layer
              id="tm-hubs-circle"
              type="circle"
              paint={{
                "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 14, 9],
                "circle-color": "#ca8a04",
                "circle-stroke-width": 2,
                "circle-stroke-color": "#ffffff",
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
            maxWidth="280px"
          >
            <strong className="text-slate-900">{popup.title}</strong>
            <pre className="mt-1 max-w-xs whitespace-pre-wrap text-[11px] text-slate-600">
              {popup.body}
            </pre>
          </Popup>
        ) : null}
      </Map>

      <div className="pointer-events-none absolute bottom-3 left-3 z-20 max-w-[240px] rounded-md border border-slate-300 bg-white/90 px-2.5 py-2 text-[10px] text-slate-700 shadow-sm">
        {choropleth === "gap" ? (
          <span>Ward colour = Gap Index (teal → red). Not census equity.</span>
        ) : (
          <span>Ward colour = GTFS stop count (light → deep blue). Click for details.</span>
        )}
      </div>
    </div>
  );
}

/** Attach gap_index / gap_band from reports onto ward features. */
export function joinWardGapIndex(
  wards: FeatureCollection<Geometry>,
  gapByLabel: Map<string, { gap_index: number; gap_band: string }>
): FeatureCollection<Geometry> {
  return {
    ...wards,
    features: wards.features.map((f) => {
      const label = String(f.properties?.ward_label ?? "");
      const gap = gapByLabel.get(label);
      if (!gap) return f;
      return {
        ...f,
        properties: {
          ...f.properties,
          gap_index: gap.gap_index,
          gap_band: gap.gap_band,
        },
      };
    }),
  };
}

export type { MapLayerKey };
