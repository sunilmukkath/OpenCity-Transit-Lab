"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapMouseEvent,
} from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import {
  CHENNAI_VIEW,
  type ChoroplethMode,
  type LayerData,
  type MapLayerKey,
} from "@/lib/map-layers";
import {
  RASTER_BASEMAP,
  VECTOR_BASEMAPS,
  ensureMapLibreWorker,
} from "@/lib/maplibre-setup";

import "maplibre-gl/dist/maplibre-gl.css";

const MAP_HEIGHT_DEFAULT = 640;

type PopupState = {
  lng: number;
  lat: number;
  title: string;
  body: string;
};

type BasemapChoice = "osm" | (typeof VECTOR_BASEMAPS)[number]["id"];

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
    else out.push(out[out.length - 1] + 0.01);
  }
  return out;
}

function formatPopupProps(props: Record<string, unknown>): string {
  const prefer = [
    "gap_index",
    "gap_band",
    "need_band",
    "need_score",
    "unmet_length_m",
    "pct_outside_400m",
    "recommendation",
    "stop_count",
    "shelter_count",
    "hub_count",
    "area_km2",
    "stops_per_km2",
    "hub_type",
    "mode",
    "highway",
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

function safeRemoveLayer(map: MapLibreMap, id: string) {
  if (map.getLayer(id)) map.removeLayer(id);
}

function safeRemoveSource(map: MapLibreMap, id: string) {
  if (map.getSource(id)) map.removeSource(id);
}

function setGeoJsonSource(
  map: MapLibreMap,
  id: string,
  data: FeatureCollection<Geometry>
) {
  const existing = map.getSource(id) as GeoJSONSource | undefined;
  if (existing) {
    existing.setData(data);
    return;
  }
  map.addSource(id, { type: "geojson", data });
}

function wardFillExpression(
  choropleth: ChoroplethMode,
  stopExtent: { min: number; max: number } | null,
  gapExtent: { min: number; max: number } | null
): ExpressionSpecification | string {
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
}

/** Layer stack order (bottom → top). */
const LAYER_STACK: {
  key: MapLayerKey;
  sourceId: string;
  layers: { id: string; type: "fill" | "line" | "circle"; paint: Record<string, unknown> }[];
}[] = [
  {
    key: "corridor_aois",
    sourceId: "tm-corridor-aois",
    layers: [
      { id: "tm-corridor-aois-fill", type: "fill", paint: { "fill-color": "#8b5cf6", "fill-opacity": 0.08 } },
      { id: "tm-corridor-aois-line", type: "line", paint: { "line-color": "#7c3aed", "line-width": 1.5, "line-dasharray": [2, 1] } },
    ],
  },
  {
    key: "metro_area_boundaries",
    sourceId: "tm-metro-boundaries",
    layers: [
      { id: "tm-metro-boundaries-fill", type: "fill", paint: { "fill-color": "#db2777", "fill-opacity": 0.12 } },
      { id: "tm-metro-boundaries-line", type: "line", paint: { "line-color": "#be185d", "line-width": 2.2 } },
    ],
  },
  {
    key: "omr_corridor",
    sourceId: "tm-omr",
    layers: [
      {
        id: "tm-omr-line",
        type: "line",
        paint: {
          "line-color": "#7c3aed",
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 3, 14, 6],
        },
      },
    ],
  },
  {
    key: "connectivity_need",
    sourceId: "tm-connectivity-need",
    layers: [
      {
        id: "tm-connectivity-need-line",
        type: "line",
        paint: {
          "line-color": [
            "match",
            ["get", "need_band"],
            "urgent",
            "#e11d48",
            "priority",
            "#f97316",
            "#ca8a04",
          ],
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 13, 5.5],
          "line-opacity": 0.92,
          "line-dasharray": [2, 1.2],
        },
      },
    ],
  },
  {
    key: "catchment_800m",
    sourceId: "tm-catchment-800",
    layers: [
      { id: "tm-catchment-800-fill", type: "fill", paint: { "fill-color": "#0284c7", "fill-opacity": 0.12 } },
    ],
  },
  {
    key: "catchment_400m",
    sourceId: "tm-catchment-400",
    layers: [
      { id: "tm-catchment-400-fill", type: "fill", paint: { "fill-color": "#0d9488", "fill-opacity": 0.18 } },
    ],
  },
  {
    key: "wards",
    sourceId: "tm-wards",
    layers: [
      { id: "tm-wards-fill", type: "fill", paint: { "fill-color": "#7dd3fc", "fill-opacity": 0.55 } },
      { id: "tm-wards-line", type: "line", paint: { "line-color": "#0f172a", "line-width": 1.1, "line-opacity": 0.9 } },
    ],
  },
  {
    key: "zones",
    sourceId: "tm-zones",
    layers: [
      { id: "tm-zones-fill", type: "fill", paint: { "fill-color": "#f59e0b", "fill-opacity": 0.08 } },
      { id: "tm-zones-line", type: "line", paint: { "line-color": "#b45309", "line-width": 2 } },
    ],
  },
  {
    key: "mrts_lines",
    sourceId: "tm-mrts-lines",
    layers: [
      {
        id: "tm-mrts-lines-line",
        type: "line",
        paint: {
          "line-color": "#ea580c",
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 2.5, 14, 5],
        },
      },
    ],
  },
  {
    key: "stops",
    sourceId: "tm-stops",
    layers: [
      {
        id: "tm-stops-circle",
        type: "circle",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 1.6, 12, 3, 15, 5.5],
          "circle-color": "#0369a1",
          "circle-opacity": 0.9,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      },
    ],
  },
  {
    key: "shelters",
    sourceId: "tm-shelters",
    layers: [
      {
        id: "tm-shelters-circle",
        type: "circle",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 14, 5],
          "circle-color": "#0f766e",
          "circle-stroke-width": 1,
          "circle-stroke-color": "#ffffff",
        },
      },
    ],
  },
  {
    key: "mrts_stations",
    sourceId: "tm-mrts-stations",
    layers: [
      {
        id: "tm-mrts-stations-circle",
        type: "circle",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4.5, 14, 8],
          "circle-color": "#ea580c",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      },
    ],
  },
  {
    key: "hubs",
    sourceId: "tm-hubs",
    layers: [
      {
        id: "tm-hubs-circle",
        type: "circle",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 14, 9],
          "circle-color": "#ca8a04",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      },
    ],
  },
];

const INTERACTIVE_LAYER_IDS = [
  "tm-wards-fill",
  "tm-zones-fill",
  "tm-stops-circle",
  "tm-shelters-circle",
  "tm-mrts-stations-circle",
  "tm-hubs-circle",
  "tm-connectivity-need-line",
];

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
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const [basemap, setBasemap] = useState<BasemapChoice>("osm");
  const [mapError, setMapError] = useState<string | null>(null);
  const [basemapReady, setBasemapReady] = useState(false);
  const [popup, setPopup] = useState<PopupState | null>(null);

  const stopExtent = useMemo(() => extentOf(data.wards, "stop_count"), [data.wards]);
  const gapExtent = useMemo(() => extentOf(data.wards, "gap_index"), [data.wards]);

  const dataRef = useRef(data);
  const visibilityRef = useRef(visibility);
  const choroplethRef = useRef(choropleth);
  const stopExtentRef = useRef(stopExtent);
  const gapExtentRef = useRef(gapExtent);
  const interactiveRef = useRef(interactive);

  dataRef.current = data;
  visibilityRef.current = visibility;
  choroplethRef.current = choropleth;
  stopExtentRef.current = stopExtent;
  gapExtentRef.current = gapExtent;
  interactiveRef.current = interactive;

  const syncLayers = useCallback((map: MapLibreMap) => {
    if (!map.isStyleLoaded()) return false;

    const vis = visibilityRef.current;
    const layerData = dataRef.current;
    const fill = wardFillExpression(
      choroplethRef.current,
      stopExtentRef.current,
      gapExtentRef.current
    );

    for (const entry of LAYER_STACK) {
      const show = Boolean(vis[entry.key] && layerData[entry.key]);
      if (!show) {
        for (const layer of entry.layers) safeRemoveLayer(map, layer.id);
        safeRemoveSource(map, entry.sourceId);
        continue;
      }

      try {
        setGeoJsonSource(map, entry.sourceId, layerData[entry.key]!);
      } catch (err) {
        console.warn("Failed to set source", entry.sourceId, err);
        continue;
      }

      for (const layer of entry.layers) {
        const paint =
          layer.id === "tm-wards-fill"
            ? { ...layer.paint, "fill-color": fill }
            : layer.paint;

        if (map.getLayer(layer.id)) {
          for (const [k, v] of Object.entries(paint)) {
            try {
              map.setPaintProperty(layer.id, k as never, v as never);
            } catch {
              /* ignore invalid paint updates during style swap */
            }
          }
          continue;
        }

        try {
          map.addLayer({
            id: layer.id,
            type: layer.type,
            source: entry.sourceId,
            paint: paint as never,
          } as never);
        } catch (err) {
          console.warn("Failed to add layer", layer.id, err);
        }
      }
    }
    return true;
  }, []);

  const scheduleSync = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const attempt = (n: number) => {
      if (syncLayers(map)) return;
      if (n <= 0) return;
      window.setTimeout(() => attempt(n - 1), 200);
    };
    attempt(10);
  }, [syncLayers]);

  // Create map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    ensureMapLibreWorker();
    setMapError(null);
    setBasemapReady(false);

    let cancelled = false;
    let map: MapLibreMap;

    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: RASTER_BASEMAP,
        center: [CHENNAI_VIEW.longitude, CHENNAI_VIEW.latitude],
        zoom: CHENNAI_VIEW.zoom,
        attributionControl: { compact: true },
      });
    } catch (err) {
      setMapError(err instanceof Error ? err.message : "Failed to create map");
      return;
    }

    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");

    const onLoad = () => {
      if (cancelled) return;
      setBasemapReady(true);
      setMapError(null);
      map.resize();
      scheduleSync();
    };

    const onIdle = () => {
      if (cancelled) return;
      setBasemapReady(true);
      map.resize();
    };

    const onError = (e: { error?: Error }) => {
      const msg = e.error?.message || "Map error";
      if (/tile|image|sprite|glyph|favicon|AbortError/i.test(msg)) return;
      console.error("MapLibre error", e.error);
      setMapError(msg);
    };

    const onClick = (e: MapMouseEvent) => {
      if (!interactiveRef.current) return;
      const layerIds = INTERACTIVE_LAYER_IDS.filter((id) => map.getLayer(id));
      const features = layerIds.length
        ? map.queryRenderedFeatures(e.point, { layers: layerIds })
        : [];
      const f = features[0];
      if (!f) {
        setPopup(null);
        return;
      }
      const props = (f.properties ?? {}) as Record<string, unknown>;
      const title = String(
        props.ward_label ||
          props.zone_label ||
          props.road_name ||
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
    };

    map.on("load", onLoad);
    map.on("idle", onIdle);
    map.on("error", onError);
    map.on("click", onClick);

    // Fallback if load event is delayed
    const readyFallback = window.setTimeout(() => {
      if (!cancelled) {
        setBasemapReady(true);
        try {
          map.resize();
          scheduleSync();
        } catch {
          /* ignore */
        }
      }
    }, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(readyFallback);
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [scheduleSync]);

  // Resize when height changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = window.setTimeout(() => map.resize(), 50);
    return () => window.clearTimeout(t);
  }, [height]);

  // Sync data / visibility / choropleth onto the live map
  useEffect(() => {
    if (!basemapReady) return;
    scheduleSync();
  }, [data, visibility, choropleth, basemapReady, scheduleSync]);

  // Update interactive cursor / query targets
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !basemapReady) return;
    const ids = interactive
      ? INTERACTIVE_LAYER_IDS.filter((id) => map.getLayer(id))
      : [];
    map.getCanvas().style.cursor = ids.length ? "pointer" : "grab";
  }, [data, visibility, basemapReady, interactive]);

  // Popup DOM
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!popup) {
      popupRef.current?.remove();
      popupRef.current = null;
      return;
    }

    if (!popupRef.current) {
      popupRef.current = new Popup({
        closeOnClick: false,
        maxWidth: "280px",
        anchor: "bottom",
      });
    }

    const el = document.createElement("div");
    el.innerHTML = `<strong style="color:#0f172a">${escapeHtml(popup.title)}</strong>
      <pre style="margin-top:4px;max-width:16rem;white-space:pre-wrap;font-size:11px;color:#475569">${escapeHtml(popup.body)}</pre>`;

    popupRef.current
      .setLngLat([popup.lng, popup.lat])
      .setDOMContent(el)
      .addTo(map);

    const p = popupRef.current;
    const onClose = () => setPopup(null);
    p.on("close", onClose);
    return () => {
      p.off("close", onClose);
    };
  }, [popup]);

  const switchBasemap = useCallback(
    async (next: BasemapChoice) => {
      const map = mapRef.current;
      if (!map || next === basemap) return;
      setBasemap(next);
      setBasemapReady(false);
      setMapError(null);

      const style: string | typeof RASTER_BASEMAP =
        next === "osm"
          ? RASTER_BASEMAP
          : VECTOR_BASEMAPS.find((b) => b.id === next)?.style || RASTER_BASEMAP;

      try {
        map.setStyle(style);
        map.once("style.load", () => {
          setBasemapReady(true);
          scheduleSync();
          map.resize();
        });
        window.setTimeout(() => {
          setBasemapReady(true);
          try {
            scheduleSync();
            map.resize();
          } catch {
            /* ignore */
          }
        }, 3000);
      } catch (err) {
        setMapError(err instanceof Error ? err.message : "Basemap switch failed");
        setBasemap("osm");
        map.setStyle(RASTER_BASEMAP);
      }
    },
    [basemap, scheduleSync]
  );

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
        <button
          type="button"
          onClick={() => switchBasemap("osm")}
          className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${
            basemap === "osm"
              ? "border-[var(--yellow)] bg-[rgba(8,13,26,0.88)] text-[var(--yellow)]"
              : "border-[var(--border)] bg-[rgba(8,13,26,0.72)] text-[var(--ink-muted)]"
          }`}
        >
          Basemap
        </button>
        {VECTOR_BASEMAPS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => switchBasemap(b.id)}
            className={`rounded-md border px-2 py-1 text-[10px] font-semibold ${
              basemap === b.id
                ? "border-[var(--yellow)] bg-[rgba(8,13,26,0.88)] text-[var(--yellow)]"
                : "border-[var(--border)] bg-[rgba(8,13,26,0.72)] text-[var(--ink-muted)]"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {mapError ? (
        <div className="absolute inset-x-3 top-3 z-30 rounded-lg border border-[var(--danger)] bg-[rgba(8,13,26,0.92)] p-3 text-sm text-[var(--danger)]">
          <p>{mapError}</p>
          <button
            type="button"
            className="mt-2 rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--ink)]"
            onClick={() => switchBasemap("osm")}
          >
            Reset to OSM basemap
          </button>
        </div>
      ) : null}

      {!basemapReady && !mapError ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[rgba(219,228,238,0.45)] text-sm font-medium text-slate-700">
          Drawing basemap…
        </div>
      ) : null}

      <div ref={containerRef} className="absolute inset-0 h-full w-full" />

      <div className="pointer-events-none absolute bottom-3 left-3 z-20 max-w-[260px] rounded-md border border-slate-300 bg-white/90 px-2.5 py-2 text-[10px] text-slate-700 shadow-sm">
        {choropleth === "gap" ? (
          <span>Ward colour = Gap Index (teal → red). Dashed lines = roads needing better connectivity.</span>
        ) : (
          <span>Ward colour = GTFS stop count. Dashed lines = roads outside 400m stop catchments.</span>
        )}
      </div>
    </div>
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
