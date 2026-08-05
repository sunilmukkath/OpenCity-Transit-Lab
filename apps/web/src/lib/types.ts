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
    label: "Analytics & Gap Index",
    blurb: "City inventory, ward/zone Gap Index, and transparent data sources.",
    href: "/analytics",
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
