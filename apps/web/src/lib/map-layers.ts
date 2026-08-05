import type { FeatureCollection, Geometry } from "geojson";

/** Core map layers only — access standard + where to serve. */
export type MapLayerKey =
  | "wards"
  | "stops"
  | "mrts_stations"
  | "mrts_lines"
  | "hubs"
  | "connectivity_need"
  | "walk_distance_bands";

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
    label: "Walk distance to stop (<500m / <1km / >1km red)",
    short: "Walk km",
    defaultOn: true,
  },
  { key: "stops", label: "Transit stops (GTFS)", short: "Stops", defaultOn: true },
  { key: "wards", label: "GCC wards", short: "Wards", defaultOn: false },
  {
    key: "connectivity_need",
    label: "Roads needing better connectivity",
    short: "Need lines",
    defaultOn: false,
  },
  { key: "hubs", label: "Rail / metro hubs", short: "Hubs", defaultOn: true },
  { key: "mrts_lines", label: "MRTS lines", short: "MRTS", defaultOn: true },
  { key: "mrts_stations", label: "MRTS stations", short: "Stations", defaultOn: true },
];

export const CHENNAI_VIEW = {
  longitude: 80.18,
  latitude: 12.92,
  zoom: 9.6,
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
    blurb: "Red = over 1km to nearest stop",
    choropleth: "stops",
    layers: {
      wards: false,
      stops: true,
      mrts_lines: true,
      mrts_stations: true,
      hubs: true,
      connectivity_need: false,
      walk_distance_bands: true,
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
    },
  },
  hubs: {
    label: "Hubs",
    blurb: "Stations, hubs, stops",
    choropleth: "stops",
    layers: {
      wards: true,
      stops: true,
      mrts_lines: true,
      mrts_stations: true,
      hubs: true,
      connectivity_need: false,
      walk_distance_bands: false,
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
    },
  },
};
