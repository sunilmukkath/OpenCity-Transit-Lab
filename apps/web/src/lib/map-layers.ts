import type { FeatureCollection, Geometry } from "geojson";

/** Map layers: access standard + where to serve + south corridor context. */
export type MapLayerKey =
  | "wards"
  | "stops"
  | "mrts_stations"
  | "mrts_lines"
  | "hubs"
  | "connectivity_need"
  | "walk_distance_bands"
  | "omr_corridor"
  | "metro_area_boundaries";

export const MAP_LAYER_META: {
  key: MapLayerKey;
  label: string;
  /** Compact label for toolbar buttons */
  short: string;
  defaultOn: boolean;
  heavy?: boolean;
}[] = [
  {
    key: "walk_distance_bands",
    label: "Walk distance to stop/hub (<500m / <1km / >1km red)",
    short: "Walk km",
    defaultOn: true,
  },
  { key: "stops", label: "Transit stops (GTFS)", short: "Stops", defaultOn: true },
  { key: "hubs", label: "Rail / metro hubs (existing)", short: "Hubs", defaultOn: true },
  { key: "mrts_lines", label: "MRTS lines", short: "MRTS", defaultOn: true },
  { key: "mrts_stations", label: "MRTS stations", short: "Stations", defaultOn: true },
  {
    key: "omr_corridor",
    label: "OMR → Mahabalipuram",
    short: "OMR",
    defaultOn: true,
  },
  {
    key: "metro_area_boundaries",
    label: "Tambaram / Chengalpattu / Mahabalipuram",
    short: "South towns",
    defaultOn: true,
  },
  { key: "wards", label: "GCC wards", short: "Wards", defaultOn: false },
  {
    key: "connectivity_need",
    label: "Roads needing better connectivity",
    short: "Need lines",
    defaultOn: false,
  },
];

export const CHENNAI_VIEW = {
  longitude: 80.2,
  latitude: 12.82,
  zoom: 9.2,
};

export type ChoroplethMode = "stops" | "gap" | "sec";

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
  walkkm: {
    label: "Walk km",
    blurb: "Red = over 1km — includes OMR / Mahabs",
    choropleth: "stops",
    layers: {
      wards: false,
      stops: true,
      mrts_lines: true,
      mrts_stations: true,
      hubs: true,
      connectivity_need: false,
      walk_distance_bands: true,
      omr_corridor: true,
      metro_area_boundaries: true,
    },
  },
  serve: {
    label: "Where to serve",
    blurb: ">1km red + need lines + gap wards",
    choropleth: "gap",
    layers: {
      wards: true,
      stops: true,
      mrts_lines: true,
      mrts_stations: true,
      hubs: true,
      connectivity_need: true,
      walk_distance_bands: true,
      omr_corridor: true,
      metro_area_boundaries: true,
    },
  },
  south: {
    label: "OMR / South",
    blurb: "Kelambakkam → Mahabalipuram corridor",
    choropleth: "stops",
    layers: {
      wards: false,
      stops: true,
      mrts_lines: true,
      mrts_stations: true,
      hubs: true,
      connectivity_need: false,
      walk_distance_bands: true,
      omr_corridor: true,
      metro_area_boundaries: true,
    },
  },
  hubs: {
    label: "Hubs",
    blurb: "Existing rail / metro hubs + stops",
    choropleth: "stops",
    layers: {
      wards: true,
      stops: true,
      mrts_lines: true,
      mrts_stations: true,
      hubs: true,
      connectivity_need: false,
      walk_distance_bands: false,
      omr_corridor: false,
      metro_area_boundaries: false,
    },
  },
  sec: {
    label: "SEC",
    blurb: "Amenity proxy on wards (not income)",
    choropleth: "sec",
    layers: {
      wards: true,
      stops: false,
      mrts_lines: false,
      mrts_stations: false,
      hubs: true,
      connectivity_need: false,
      walk_distance_bands: false,
      omr_corridor: false,
      metro_area_boundaries: false,
    },
  },
};
