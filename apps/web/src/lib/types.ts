export type LayerStatus = "loaded" | "partial" | "unavailable" | "not_connected";

export interface ManifestSource {
  id: string;
  name: string;
  publisher: string;
  url: string;
  portal?: string;
  license?: string;
  kind: string;
  notes?: string;
  status: LayerStatus;
  fetched_at?: string;
  bytes?: number;
  sha256?: string;
  error?: string;
}

export interface ManifestLayer {
  status: LayerStatus;
  feature_count?: number;
  bbox?: number[] | null;
  file?: string;
  derived_from?: string;
  notes?: string;
  attributes?: string[];
  error?: string;
}

export interface RealtimeSlot {
  id: string;
  name: string;
  status: LayerStatus;
  would_unlock: string;
  how_to_plug: string;
}

export interface UnavailableAnalytic {
  id: string;
  name: string;
  status: LayerStatus;
  reason: string;
  needed: string;
}

export interface Manifest {
  generated_at: string;
  platform: string;
  integrity_rule: string;
  sources: Record<string, ManifestSource>;
  layers: Record<string, ManifestLayer>;
  realtime: RealtimeSlot[];
  unavailable_analytics: UnavailableAnalytic[];
}

export interface Metrics {
  generated_at: string;
  note: string;
  counts: Record<string, number>;
  unavailable: string[];
}

export type RecommendationPriority = "critical" | "high" | "medium" | "info";

export type GapBand = "severe" | "high" | "moderate" | "low";

export interface GapComponents {
  stop_gap: number;
  shelter_gap: number;
  hub_gap: number;
  density_gap: number;
}

export interface UnitRecommendation {
  priority: RecommendationPriority | string;
  title: string;
  detail: string;
}

export interface SpatialUnitReport {
  id: string;
  label: string;
  unit_type: "ward" | "zone" | string;
  stop_count: number | null;
  shelter_count: number | null;
  hub_count: number | null;
  area_km2: number | null;
  stops_per_km2: number | null;
  priority_score: number;
  gap_index: number;
  gap_band: GapBand | string;
  gap_components: GapComponents;
  recommendations: UnitRecommendation[];
}

export interface GapIndexMethod {
  scale: string;
  bands: Record<string, string>;
  components: Record<string, string>;
  disclaimer: string;
}

export interface SpatialReports {
  generated_at: string;
  note: string;
  gap_index_method?: GapIndexMethod;
  city_mean_stops_per_ward: number | null;
  city_mean_gap_index?: number | null;
  wards: SpatialUnitReport[];
  zones: SpatialUnitReport[];
  priority_wards: SpatialUnitReport[];
  priority_zones: SpatialUnitReport[];
  severe_gap_wards?: SpatialUnitReport[];
}

export interface HubLastMileRow {
  id: string;
  label: string;
  hub_type: string;
  lon: number | null;
  lat: number | null;
  in_chennai_core?: boolean;
  nearest_stop_m: number | null;
  stops_within_300m: number;
  stops_within_500m: number;
  shelters_within_300m: number | null;
  last_mile_score: number;
  last_mile_band: string;
  components: Record<string, number>;
  recommendation: string;
}

export interface ShelterMismatchRow {
  id: string;
  label: string;
  unit_type: string;
  stop_count: number;
  shelter_count: number;
  shelter_to_stop_ratio: number;
  mismatch_score: number;
  recommendation: string;
}

export interface CatchmentCoverageRow {
  id: string;
  label: string;
  unit_type: string;
  area_km2: number;
  pct_area_within_400m: number | null;
  pct_area_within_800m: number | null;
  pct_area_outside_400m: number | null;
  coverage_band: string;
  stop_count: number | null;
  recommendation: string;
}

export interface AdvancedAnalyses {
  generated_at: string;
  note: string;
  hub_last_mile: {
    status: string;
    note?: string;
    reason?: string;
    method?: GapIndexMethod | Record<string, unknown>;
    hubs: HubLastMileRow[];
    priority_hubs: HubLastMileRow[];
    counts?: Record<string, number>;
  };
  shelter_mismatch: {
    status: string;
    note?: string;
    wards: ShelterMismatchRow[];
    zones: ShelterMismatchRow[];
    priority_wards: ShelterMismatchRow[];
    priority_zones: ShelterMismatchRow[];
    counts?: Record<string, number>;
  };
  catchment_coverage: {
    status: string;
    note?: string;
    reason?: string;
    city_mean_pct_outside_400m?: number | null;
    wards: CatchmentCoverageRow[];
    priority_wards: CatchmentCoverageRow[];
    counts?: Record<string, number>;
  };
  metro_corridors?: {
    status: string;
    note?: string;
    reason?: string;
    areas: {
      id: string;
      label: string;
      kind: string;
      note?: string;
      stop_count: number;
      shelter_count: number;
      hub_count: number;
      bbox?: number[] | null;
    }[];
  };
  connectivity_need?: {
    status: string;
    note?: string;
    reason?: string;
    method?: Record<string, unknown>;
    corridors: {
      rank: number;
      road_name: string;
      highway: string;
      need_band: string;
      need_score: number;
      unmet_length_m: number;
      pct_outside_400m: number;
      in_high_gap_ward: boolean;
      recommendation: string;
    }[];
    counts?: Record<string, number>;
  };
  sec_proxy?: {
    status: string;
    note?: string;
    reason?: string;
    method?: Record<string, unknown>;
    wards: {
      label: string;
      pct_slum_area: number;
      has_slum: boolean;
      slum_band?: string | null;
      amenity_deprivation: number | null;
      amenity_band?: string | null;
      amenity_join?: string;
      sec_proxy_band?: string | null;
      banking_pct?: number | null;
      car_pct?: number | null;
      scooter_pct?: number | null;
      sc_pct_2011?: number | null;
    }[];
    priority_lower_proxy?: {
      label: string;
      pct_slum_area: number;
      amenity_deprivation: number | null;
      sec_proxy_band?: string | null;
      banking_pct?: number | null;
      car_pct?: number | null;
    }[];
    counts?: Record<string, number>;
  };
}

export type AudienceId = "local" | "traffic" | "public";

export const AUDIENCES: {
  id: AudienceId;
  label: string;
  blurb: string;
  href: string;
}[] = [
  {
    id: "local",
    label: "Ward / zone reports",
    blurb: "For GCC local bodies — Gap Index, inventory counts, and recommendations by ward or zone.",
    href: "/analytics?tab=spatial",
  },
  {
    id: "traffic",
    label: "Network map",
    blurb: "For traffic department — hubs, stops, catchments, GIS exports.",
    href: "/map?audience=traffic",
  },
  {
    id: "public",
    label: "Insights & Gap Index",
    blurb: "Hub last-mile, shelter mismatch, walk coverage, and city inventory.",
    href: "/analytics?tab=insights",
  },
];

export function statusLabel(status: LayerStatus | string): string {
  switch (status) {
    case "loaded":
      return "Loaded";
    case "partial":
      return "Partial";
    case "unavailable":
      return "Unavailable";
    case "not_connected":
      return "Not connected";
    default:
      return status;
  }
}

export function layerIsReady(layer?: ManifestLayer): boolean {
  return Boolean(layer && layer.status === "loaded" && (layer.feature_count ?? 0) > 0);
}
