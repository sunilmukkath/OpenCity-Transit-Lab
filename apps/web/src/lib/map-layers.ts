import type { FeatureCollection, Geometry } from "geojson";

export type MapLayerKey =
  | "wards"
  | "zones"
  | "stops"
  | "shelters"
  | "mrts_stations"
  | "mrts_lines"
  | "hubs"
  | "catchment_400m"
  | "catchment_800m"
  | "omr_corridor"
  | "metro_area_boundaries"
  | "corridor_aois";

export const MAP_LAYER_META: {
  key: MapLayerKey;
  label: string;
  defaultOn: boolean;
  heavy?: boolean;
}[] = [
  { key: "wards", label: "GCC wards", defaultOn: true },
  { key: "zones", label: "GCC zones", defaultOn: false },
  { key: "metro_area_boundaries", label: "Tambaram / Chengalpattu / Mahabalipuram", defaultOn: true },
  { key: "corridor_aois", label: "South corridor AOIs", defaultOn: false },
  { key: "omr_corridor", label: "OMR → Mahabalipuram", defaultOn: true },
  { key: "stops", label: "Transit stops (GTFS)", defaultOn: true },
  { key: "shelters", label: "Bus shelters", defaultOn: false },
  { key: "mrts_lines", label: "MRTS lines", defaultOn: true },
  { key: "mrts_stations", label: "MRTS stations", defaultOn: true },
  { key: "hubs", label: "Rail / metro hubs", defaultOn: true },
  { key: "catchment_400m", label: "400m walk catchment", defaultOn: false, heavy: true },
  { key: "catchment_800m", label: "800m walk catchment", defaultOn: false, heavy: true },
];

export const CHENNAI_VIEW = {
  longitude: 80.18,
  latitude: 12.92,
  zoom: 9.6,
};

/** Voyager first — dark navy ward fills were invisible on Dark Matter. */
export const BASEMAP_STYLES = [
  "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  "https://tiles.openfreemap.org/styles/liberty",
  "https://demotiles.maplibre.org/style.json",
] as const;

export const BASEMAP_LABELS = [
  "Streets (Voyager)",
  "Dark Matter",
  "Liberty",
  "Demo",
] as const;

export type ChoroplethMode = "stops" | "gap";

export type LayerData = Partial<Record<MapLayerKey, FeatureCollection<Geometry>>>;

export function defaultVisibility(): Record<MapLayerKey, boolean> {
  return Object.fromEntries(
    MAP_LAYER_META.map((l) => [l.key, l.defaultOn])
  ) as Record<MapLayerKey, boolean>;
}

export const LAYER_PRESETS: Record<
  string,
  {
    label: string;
    blurb: string;
    layers: Partial<Record<MapLayerKey, boolean>>;
    choropleth: ChoroplethMode;
  }
> = {
  coverage: {
    label: "Coverage",
    blurb: "Wards, stops, rail",
    choropleth: "stops",
    layers: {
      wards: true,
      zones: false,
      stops: true,
      shelters: false,
      mrts_lines: true,
      mrts_stations: true,
      hubs: true,
      catchment_400m: false,
      catchment_800m: false,
      omr_corridor: true,
      metro_area_boundaries: true,
      corridor_aois: false,
    },
  },
  gaps: {
    label: "Gap Index",
    blurb: "Ward gaps + hubs",
    choropleth: "gap",
    layers: {
      wards: true,
      zones: false,
      stops: false,
      shelters: false,
      mrts_lines: true,
      mrts_stations: false,
      hubs: true,
      catchment_400m: false,
      catchment_800m: false,
      omr_corridor: false,
      metro_area_boundaries: true,
      corridor_aois: false,
    },
  },
  hubs: {
    label: "Hubs & feeders",
    blurb: "Stations, hubs, stops",
    choropleth: "stops",
    layers: {
      wards: true,
      zones: false,
      stops: true,
      shelters: false,
      mrts_lines: true,
      mrts_stations: true,
      hubs: true,
      catchment_400m: false,
      catchment_800m: false,
      omr_corridor: true,
      metro_area_boundaries: true,
      corridor_aois: false,
    },
  },
  walk: {
    label: "Walk access",
    blurb: "400m catchment",
    choropleth: "stops",
    layers: {
      wards: false,
      zones: true,
      stops: true,
      shelters: false,
      mrts_lines: true,
      mrts_stations: true,
      hubs: true,
      catchment_400m: true,
      catchment_800m: false,
      omr_corridor: false,
      metro_area_boundaries: false,
      corridor_aois: false,
    },
  },
  south: {
    label: "OMR / South",
    blurb: "OMR, Tambaram, Chengalpattu",
    choropleth: "stops",
    layers: {
      wards: true,
      zones: false,
      stops: true,
      shelters: false,
      mrts_lines: true,
      mrts_stations: true,
      hubs: true,
      catchment_400m: false,
      catchment_800m: false,
      omr_corridor: true,
      metro_area_boundaries: true,
      corridor_aois: true,
    },
  },
};
