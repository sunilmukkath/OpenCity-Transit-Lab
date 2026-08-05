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
  | "corridor_aois"
  | "connectivity_need"
  | "slums";

export const MAP_LAYER_META: {
  key: MapLayerKey;
  label: string;
  /** Compact label for toolbar buttons */
  short: string;
  defaultOn: boolean;
  heavy?: boolean;
}[] = [
  { key: "wards", label: "GCC wards", short: "Wards", defaultOn: true },
  { key: "zones", label: "GCC zones", short: "Zones", defaultOn: false },
  {
    key: "metro_area_boundaries",
    label: "Tambaram / Chengalpattu / Mahabalipuram",
    short: "South towns",
    defaultOn: false,
  },
  { key: "corridor_aois", label: "South corridor AOIs", short: "AOIs", defaultOn: false },
  { key: "omr_corridor", label: "OMR → Mahabalipuram", short: "OMR", defaultOn: true },
  {
    key: "connectivity_need",
    label: "Roads needing better connectivity",
    short: "Need lines",
    defaultOn: true,
  },
  { key: "slums", label: "Slum boundaries (OpenCity)", short: "Slums", defaultOn: false },
  { key: "stops", label: "Transit stops (GTFS)", short: "Stops", defaultOn: true },
  { key: "shelters", label: "Bus shelters", short: "Shelters", defaultOn: false },
  { key: "mrts_lines", label: "MRTS lines", short: "MRTS", defaultOn: true },
  { key: "mrts_stations", label: "MRTS stations", short: "Stations", defaultOn: true },
  { key: "hubs", label: "Rail / metro hubs", short: "Hubs", defaultOn: true },
  { key: "catchment_400m", label: "400m walk catchment", short: "400m", defaultOn: false, heavy: true },
  { key: "catchment_800m", label: "800m walk catchment", short: "800m", defaultOn: false, heavy: true },
];

export const CHENNAI_VIEW = {
  longitude: 80.18,
  latitude: 12.92,
  zoom: 9.6,
};

export type ChoroplethMode = "stops" | "gap" | "sec" | "slum";

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
      connectivity_need: false,
      slums: false,
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
      connectivity_need: true,
      slums: false,
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
      connectivity_need: true,
      slums: false,
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
      connectivity_need: false,
      slums: false,
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
      connectivity_need: true,
      slums: false,
    },
  },
  connect: {
    label: "Need lines",
    blurb: "Roads outside stop catchments",
    choropleth: "gap",
    layers: {
      wards: true,
      zones: false,
      stops: false,
      shelters: false,
      mrts_lines: true,
      mrts_stations: true,
      hubs: true,
      catchment_400m: false,
      catchment_800m: false,
      omr_corridor: false,
      metro_area_boundaries: false,
      corridor_aois: false,
      connectivity_need: true,
      slums: false,
    },
  },
  sec: {
    label: "SEC / Slum",
    blurb: "Amenity proxy + slum share",
    choropleth: "sec",
    layers: {
      wards: true,
      zones: false,
      stops: false,
      shelters: false,
      mrts_lines: false,
      mrts_stations: false,
      hubs: true,
      catchment_400m: false,
      catchment_800m: false,
      omr_corridor: false,
      metro_area_boundaries: false,
      corridor_aois: false,
      connectivity_need: false,
      slums: true,
    },
  },
};
