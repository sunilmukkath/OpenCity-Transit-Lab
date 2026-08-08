export type LayerStatus = "loaded" | "partial" | "unavailable" | "not_connected";

export interface ManifestSource {
  id: string;
  name: string;
  publisher: string;
  url: string;
  portal?: string;
  license?: string;
  kind: string;
  category?: string;
  notes?: string;
  status: LayerStatus;
  fetched_at?: string;
  bytes?: number;
  sha256?: string;
  error?: string;
  jam_catalog?: boolean;
  ui_group?: string;
}

export interface JamCatalogIndex {
  generated_from?: string;
  count?: number;
  note?: string;
  entries?: { id: string; category?: string; status: string; layer_key?: string | null }[];
}

export interface Manifest {
  generated_at: string;
  platform: string;
  integrity_rule: string;
  sources: Record<string, ManifestSource>;
  layers: Record<string, ManifestLayer>;
  realtime: RealtimeSlot[];
  unavailable_analytics: UnavailableAnalytic[];
  jam_catalog?: JamCatalogIndex;
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
  /** OpenCity MRTS station points inside the unit */
  mrts_station_count?: number | null;
  /** metro_named hubs (CMRL Phase-I tags) inside the unit */
  cmrl_hub_count?: number | null;
  /** OSM railway station points inside the unit */
  railway_station_count?: number | null;
  has_mrts?: boolean;
  has_cmrl?: boolean;
  has_railway?: boolean;
  has_any_rail_metro?: boolean;
  /** Crow-flies metres from unit representative point */
  nearest_mrts_m?: number | null;
  nearest_cmrl_m?: number | null;
  nearest_railway_m?: number | null;
  /** Mean crow-flies m from ward grid samples to nearest stop/hub */
  mean_walk_m?: number | null;
  median_walk_m?: number | null;
  p90_walk_m?: number | null;
  pct_samples_within_400m?: number | null;
  pct_samples_within_800m?: number | null;
  walk_sample_points?: number | null;
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
  city_mean_walk_m?: number | null;
  walk_access_note?: string;
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
  walk_distance_bands?: {
    status: string;
    note?: string;
    method?: Record<string, string>;
    study?: {
      pct_within_100m?: number;
      pct_over_1000m?: number;
      study_area_km2?: number;
    };
    counts?: {
      study_area_km2?: number;
      within_100m_km2?: number;
      band_100_500m_km2?: number;
      within_500m_km2?: number;
      band_500_1000m_km2?: number;
      over_1000m_km2?: number;
      pct_within_100m?: number;
      pct_over_1000m?: number;
    };
  };
  pop_access?: {
    status: string;
    note?: string;
    city?: {
      population_joined?: number;
      est_pop_within_400m?: number;
      pct_pop_within_400m?: number;
    };
  };
  metro_extension?: {
    status: string;
    note?: string;
  };
}

/** @deprecated Prefer HUBS from `@/lib/hubs` — kept for legacy links. */
export type AudienceId = "local" | "traffic" | "public" | "citizen" | "planner" | "operator" | "press";

export { HUBS as AUDIENCES } from "@/lib/hubs";

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
  return Boolean(
    layer &&
      (layer.status === "loaded" || layer.status === "partial") &&
      (layer.feature_count ?? 0) > 0
  );
}
