import type { FeatureCollection, Geometry } from "geojson";

/** Map layers: access + south corridor + Datajam destinations. */
export type MapLayerKey =
  | "wards"
  | "stops"
  | "mrts_stations"
  | "mrts_lines"
  | "hubs"
  | "railway_stations"
  | "connectivity_need"
  | "walk_isochrones"
  | "omr_corridor"
  | "metro_area_boundaries"
  | "schools"
  | "healthcare"
  | "parks"
  | "public_toilets"
  | "anganwadis"
  | "bus_stop_audit"
  | "nmt_network"
  | "cmp_corridors"
  | "tngis_settlement_area"
  | "tngis_habitation";

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
    key: "walk_isochrones",
    label: "Walk isochrones 5/10/15 min (OSM network)",
    short: "Isochrones",
    defaultOn: true,
    group: "core",
  },
  { key: "stops", label: "Transit stops (GTFS)", short: "Stops", defaultOn: true, group: "core" },
  { key: "hubs", label: "Rail / metro hubs (existing)", short: "Hubs", defaultOn: true, group: "core" },
  {
    key: "railway_stations",
    label: "Suburban / IR railway stations (OSM download)",
    short: "Rail stns",
    defaultOn: false,
    group: "core",
  },
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
  {
    key: "nmt_network",
    label: "NMT footways / cycleways (OSM, Partial)",
    short: "NMT paths",
    defaultOn: false,
    heavy: true,
    group: "core",
  },
  {
    key: "cmp_corridors",
    label: "CMP named corridors (geocoded)",
    short: "CMP",
    defaultOn: false,
    group: "core",
  },
  {
    key: "tngis_settlement_area",
    label: "TNGIS settlement / built-up (WFS, Partial bbox)",
    short: "Settlements",
    defaultOn: false,
    heavy: true,
    group: "core",
  },
  {
    key: "tngis_habitation",
    label: "TNGIS habitation points (WFS, Partial bbox)",
    short: "Habitation",
    defaultOn: false,
    group: "core",
  },
];

export const CHENNAI_VIEW = {
  longitude: 80.2,
  latitude: 12.82,
  zoom: 9.2,
};

export type ChoroplethMode = "stops" | "gap" | "slum" | "walk";

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
  railway_stations: false,
  nmt_network: false,
  cmp_corridors: false,
  tngis_settlement_area: false,
  tngis_habitation: false,
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
    label: "Isochrones",
    blurb: "OSM walk isochrones 5/10/15 min + ward walk colour",
    choropleth: "walk",
    layers: {
      ...CORE_OFF_AMENITIES,
      wards: true,
      stops: true,
      mrts_lines: true,
      mrts_stations: true,
      hubs: true,
      connectivity_need: false,
      walk_isochrones: true,
      omr_corridor: true,
      metro_area_boundaries: true,
    },
  },
  destinations: {
    label: "Destinations",
    blurb: "Schools + health · check ≤5–15 min walk isochrones",
    choropleth: "stops",
    layers: {
      wards: false,
      stops: true,
      mrts_lines: true,
      mrts_stations: true,
      hubs: true,
      railway_stations: false,
      connectivity_need: false,
      walk_isochrones: true,
      omr_corridor: true,
      metro_area_boundaries: true,
      schools: true,
      healthcare: true,
      parks: false,
      public_toilets: false,
      anganwadis: false,
      bus_stop_audit: false,
      nmt_network: true,
      cmp_corridors: false,
    },
  },
  serve: {
    label: "Where to serve",
    blurb: "Isochrones + need lines + gap wards",
    choropleth: "gap",
    layers: {
      ...CORE_OFF_AMENITIES,
      wards: true,
      stops: true,
      mrts_lines: true,
      mrts_stations: true,
      hubs: true,
      connectivity_need: true,
      walk_isochrones: true,
      omr_corridor: true,
      metro_area_boundaries: true,
      cmp_corridors: true,
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
      walk_isochrones: true,
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
      walk_isochrones: false,
      omr_corridor: false,
      metro_area_boundaries: false,
      nmt_network: true,
    },
  },
  slum: {
    label: "Slum",
    blurb: "Slum vs non-slum wards (OpenCity polygons)",
    choropleth: "slum",
    layers: {
      ...CORE_OFF_AMENITIES,
      wards: true,
      stops: false,
      mrts_lines: false,
      mrts_stations: false,
      hubs: true,
      connectivity_need: false,
      walk_isochrones: false,
      omr_corridor: false,
      metro_area_boundaries: false,
    },
  },
  traffic: {
    label: "Traffic",
    blurb: "CMP corridors + need lines + hubs for network staff",
    choropleth: "gap",
    layers: {
      ...CORE_OFF_AMENITIES,
      wards: true,
      stops: true,
      hubs: true,
      mrts_lines: true,
      mrts_stations: true,
      connectivity_need: true,
      cmp_corridors: true,
      walk_isochrones: false,
      omr_corridor: true,
      metro_area_boundaries: false,
    },
  },
  lastmile: {
    label: "Last mile",
    blurb: "Need lines + settlements + hubs + walk isochrones",
    choropleth: "gap",
    layers: {
      ...CORE_OFF_AMENITIES,
      wards: false,
      stops: true,
      mrts_lines: true,
      mrts_stations: true,
      hubs: true,
      connectivity_need: true,
      walk_isochrones: true,
      omr_corridor: true,
      metro_area_boundaries: true,
      tngis_settlement_area: true,
      tngis_habitation: true,
    },
  },
};

/** Audience-facing map views — one row only. */
export const AUDIENCE_PRESETS: {
  id: string;
  label: string;
  audience?: string;
  preset: string;
}[] = [
  { id: "citizen", label: "Isochrones / destinations", audience: "citizen", preset: "destinations" },
  { id: "planner", label: "Gaps", audience: "planner", preset: "serve" },
  { id: "hubs", label: "Hubs", audience: "hubs", preset: "hubs" },
  { id: "equity", label: "Slum", audience: "equity", preset: "slum" },
];

/** Layers that must be loaded for a given visibility map. */
export function layersForPreset(
  visibility: Partial<Record<MapLayerKey, boolean>>
): MapLayerKey[] {
  return (Object.keys(visibility) as MapLayerKey[]).filter((k) => visibility[k]);
}

/** Lightweight first paint — wards + walks + stops + hubs. */
export const BOOTSTRAP_LAYERS: MapLayerKey[] = [
  "walk_isochrones",
  "stops",
  "hubs",
  "mrts_stations",
  "mrts_lines",
  "wards",
  "omr_corridor",
  "metro_area_boundaries",
];
