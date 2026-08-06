import type { FeatureCollection, Geometry } from "geojson";

/** Map layers: access + south corridor + Datajam destinations. */
export type MapLayerKey =
  | "wards"
  | "stops"
  | "mrts_stations"
  | "mrts_lines"
  | "hubs"
  | "connectivity_need"
  | "walk_distance_bands"
  | "omr_corridor"
  | "metro_area_boundaries"
  | "schools"
  | "healthcare"
  | "parks"
  | "public_toilets"
  | "anganwadis"
  | "bus_stop_audit";

export const MAP_LAYER_META: {
  key: MapLayerKey;
  label: string;
  /** Compact label for toolbar buttons */
  short: string;
  defaultOn: boolean;
  heavy?: boolean;
  group?: "core" | "amenities";
}[] = [
  {
    key: "walk_distance_bands",
    label: "Walk distance to stop/hub (<500m / <1km / >1km red)",
    short: "Walk km",
    defaultOn: true,
    group: "core",
  },
  { key: "stops", label: "Transit stops (GTFS)", short: "Stops", defaultOn: true, group: "core" },
  { key: "hubs", label: "Rail / metro hubs (existing)", short: "Hubs", defaultOn: true, group: "core" },
  { key: "mrts_lines", label: "MRTS lines", short: "MRTS", defaultOn: true, group: "core" },
  { key: "mrts_stations", label: "MRTS stations", short: "Stations", defaultOn: true, group: "core" },
  {
    key: "omr_corridor",
    label: "OMR → Mahabalipuram",
    short: "OMR",
    defaultOn: true,
    group: "core",
  },
  {
    key: "metro_area_boundaries",
    label: "Tambaram / Chengalpattu / Mahabalipuram",
    short: "South towns",
    defaultOn: true,
    group: "core",
  },
  { key: "wards", label: "GCC wards", short: "Wards", defaultOn: false, group: "core" },
  {
    key: "connectivity_need",
    label: "Need lines — roads with long stretches >400m from a GTFS stop",
    short: "Need lines",
    defaultOn: false,
    group: "core",
  },
  {
    key: "schools",
    label: "Schools (OpenCity)",
    short: "Schools",
    defaultOn: false,
    group: "amenities",
  },
  {
    key: "healthcare",
    label: "UPHC / UCHC healthcare",
    short: "Health",
    defaultOn: false,
    group: "amenities",
  },
  { key: "parks", label: "Parks", short: "Parks", defaultOn: false, group: "amenities" },
  {
    key: "public_toilets",
    label: "Public toilets",
    short: "Toilets",
    defaultOn: false,
    group: "amenities",
  },
  {
    key: "anganwadis",
    label: "Anganwadis / ICDS",
    short: "Anganwadi",
    defaultOn: false,
    group: "amenities",
  },
  {
    key: "bus_stop_audit",
    label: "Bus stop audit points",
    short: "Stop audit",
    defaultOn: false,
    group: "amenities",
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

const CORE_OFF_AMENITIES: Partial<Record<MapLayerKey, boolean>> = {
  schools: false,
  healthcare: false,
  parks: false,
  public_toilets: false,
  anganwadis: false,
  bus_stop_audit: false,
};

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
      ...CORE_OFF_AMENITIES,
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
  destinations: {
    label: "Destinations",
    blurb: "Schools + health + walk gaps",
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
      schools: true,
      healthcare: true,
      parks: false,
      public_toilets: false,
      anganwadis: false,
      bus_stop_audit: false,
    },
  },
  serve: {
    label: "Where to serve",
    blurb: ">1km red + need lines (roads far from stops) + gap wards",
    choropleth: "gap",
    layers: {
      ...CORE_OFF_AMENITIES,
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
      ...CORE_OFF_AMENITIES,
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
      ...CORE_OFF_AMENITIES,
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
      ...CORE_OFF_AMENITIES,
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
