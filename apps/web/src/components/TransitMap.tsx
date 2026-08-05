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
import type { FeatureCollection, Geometry } from "geojson";
import {
  BASEMAP_STYLES,
  CHENNAI_VIEW,
  type ChoroplethMode,
  type LayerData,
  type MapLayerKey,
} from "@/lib/map-layers";

const MAP_HEIGHT_DEFAULT = 620;

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

  const stopExtent = useMemo(
    () => extentOf(data.wards, "stop_count"),
    [data.wards]
  );
  const gapExtent = useMemo(() => extentOf(data.wards, "gap_index"), [data.wards]);

  const interactiveLayerIds = useMemo(() => {
    if (!interactive) return [];
    const ids: string[] = [];
    if (visibility.wards && data.wards) ids.push("tm-wards-fill");
    if (visibility.zones && data.zones) ids.push("tm-zones-fill");
    if (visibility.stops && data.stops) ids.push("tm-stops-circle");
    if (visibility.shelters && data.shelters) ids.push("tm-shelters-circle");
    if (visibility.mrts_stations && data.mrts_stations)
      ids.push("tm-mrts-stations-circle");
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
    const map = mapRef.current?.getMap();
    if (!map) return;
    requestAnimationFrame(() => {
      map.resize();
    });
  }, []);

  useEffect(() => {
    forceResize();
    const onWin = () => forceResize();
    window.addEventListener("resize", onWin);
    const t1 = window.setTimeout(forceResize, 120);
    const t2 = window.setTimeout(forceResize, 500);
    return () => {
      window.removeEventListener("resize", onWin);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [forceResize, height, visibility, data]);

  const wardFillColor = useMemo(() => {
    if (choropleth === "gap" && gapExtent) {
      return [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "gap_index"], 0],
        gapExtent.min,
        "#0f766e",
        Math.max(gapExtent.min + 1, 25),
        "#e8a820",
        Math.max(45, gapExtent.min + 2),
        "#fb923c",
        Math.max(70, gapExtent.max),
        "#fb7185",
      ] as unknown as string;
    }
    if (stopExtent) {
      return [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "stop_count"], 0],
        stopExtent.min,
        "#103466",
        stopExtent.max,
        "#38bdf8",
      ] as unknown as string;
    }
    return "#1a3a6e";
  }, [choropleth, gapExtent, stopExtent]);

  const styleUrl = BASEMAP_STYLES[Math.min(styleIndex, BASEMAP_STYLES.length - 1)];

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--map-wash)] shadow-sm"
      style={{ height }}
    >
      {loading ? (
        <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-md border border-[var(--border)] bg-[var(--overlay)] px-3 py-1.5 text-xs text-[var(--ink-muted)]">
          Loading layers…
        </div>
      ) : null}

      {mapError ? (
        <div className="absolute inset-x-3 top-3 z-30 rounded-lg border border-[var(--danger)] bg-[var(--overlay)] p-3 text-sm text-[var(--danger)]">
          <p>{mapError}</p>
          {styleIndex < BASEMAP_STYLES.length - 1 ? (
            <button
              type="button"
              className="mt-2 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--ink)] hover:border-[var(--accent)]"
              onClick={() => {
                setMapError(null);
                setBasemapReady(false);
                setStyleIndex((i) => i + 1);
              }}
            >
              Try fallback basemap
            </button>
          ) : null}
        </div>
      ) : null}

      {!basemapReady && !mapError ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[var(--map-wash)] text-sm text-[var(--ink-muted)]">
          Drawing basemap…
        </div>
      ) : null}

      <Map
        key={styleUrl}
        ref={mapRef}
        initialViewState={CHENNAI_VIEW}
        mapStyle={styleUrl}
        style={{ width: "100%", height }}
        interactiveLayerIds={interactiveLayerIds}
        onClick={onClick}
        onLoad={() => {
          setBasemapReady(true);
          setMapError(null);
          forceResize();
        }}
        onError={(e) => {
          const msg = e.error?.message || "Basemap failed to load";
          // Ignore benign tile/sprite noise once style is up
          if (basemapReady && /tile|image|sprite/i.test(msg)) return;
          setMapError(msg);
        }}
        cursor={interactiveLayerIds.length ? "pointer" : "grab"}
        attributionControl={{ compact: true }}
        reuseMaps
      >
        <NavigationControl position="top-right" showCompass={false} />

        {visibility.catchment_800m && data.catchment_800m ? (
          <Source id="tm-catchment-800" type="geojson" data={data.catchment_800m}>
            <Layer
              id="tm-catchment-800-fill"
              type="fill"
              paint={{ "fill-color": "#38bdf8", "fill-opacity": 0.07 }}
            />
          </Source>
        ) : null}

        {visibility.catchment_400m && data.catchment_400m ? (
          <Source id="tm-catchment-400" type="geojson" data={data.catchment_400m}>
            <Layer
              id="tm-catchment-400-fill"
              type="fill"
              paint={{ "fill-color": "#2dd4bf", "fill-opacity": 0.12 }}
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
                "fill-opacity": 0.58,
              }}
            />
            <Layer
              id="tm-wards-line"
              type="line"
              paint={{
                "line-color": "#cbd5e1",
                "line-width": 0.8,
                "line-opacity": 0.75,
              }}
            />
          </Source>
        ) : null}

        {visibility.zones && data.zones ? (
          <Source id="tm-zones" type="geojson" data={data.zones}>
            <Layer
              id="tm-zones-fill"
              type="fill"
              paint={{ "fill-color": "#e8a820", "fill-opacity": 0.06 }}
            />
            <Layer
              id="tm-zones-line"
              type="line"
              paint={{ "line-color": "#e8a820", "line-width": 1.6 }}
            />
          </Source>
        ) : null}

        {visibility.mrts_lines && data.mrts_lines ? (
          <Source id="tm-mrts-lines" type="geojson" data={data.mrts_lines}>
            <Layer
              id="tm-mrts-lines-line"
              type="line"
              paint={{
                "line-color": "#fb923c",
                "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2, 14, 4],
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
                  1.2,
                  12,
                  2.4,
                  15,
                  4.5,
                ],
                "circle-color": "#38bdf8",
                "circle-opacity": 0.82,
                "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 11, 0, 14, 1],
                "circle-stroke-color": "#0a1f4a",
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
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  10,
                  2,
                  14,
                  4,
                ],
                "circle-color": "#2dd4bf",
                "circle-stroke-width": 1,
                "circle-stroke-color": "#0a1f4a",
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
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  9,
                  3.5,
                  14,
                  7,
                ],
                "circle-color": "#fb923c",
                "circle-stroke-width": 1.5,
                "circle-stroke-color": "#0a1f4a",
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
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  9,
                  4,
                  14,
                  8,
                ],
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
            maxWidth="280px"
          >
            <strong className="text-[var(--ink)]">{popup.title}</strong>
            <pre className="mt-1 max-w-xs whitespace-pre-wrap text-[11px] text-[var(--ink-muted)]">
              {popup.body}
            </pre>
          </Popup>
        ) : null}
      </Map>

      <div className="pointer-events-none absolute bottom-3 left-3 z-20 max-w-[220px] rounded-md border border-[var(--border)] bg-[var(--overlay)] px-2.5 py-2 text-[10px] text-[var(--ink-muted)]">
        {choropleth === "gap" ? (
          <span>Ward colour = Gap Index (teal → red). Not census equity.</span>
        ) : (
          <span>Ward colour = GTFS stop count. Click a feature for details.</span>
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
