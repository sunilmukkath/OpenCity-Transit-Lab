export type ObjectiveStatus = "loaded" | "partial" | "unavailable";

export interface ObjectiveChartBar {
  label?: string;
  band?: string;
  destination?: string;
  km2?: number | null;
  count?: number | null;
  rows?: number | null;
  color?: string;
  ward_count?: number;
  mean_pt_index?: number | null;
  pct_low_pt?: number | null;
  pct_within_100m?: number | null;
  pct_within_500m?: number | null;
  pct_over_100m?: number | null;
  pct_within_1000m?: number | null;
  pct_over_1000m?: number | null;
  total?: number | null;
  within_100m?: number | null;
  over_100m?: number | null;
}

export interface ObjectiveBlock {
  id: string;
  title: string;
  status: ObjectiveStatus | string;
  summary?: string;
  metrics?: Record<string, number | null | undefined>;
  chart?: ObjectiveChartBar[];
  limitations?: string[];
  reason?: string;
  needed?: string;
  method?: Record<string, unknown>;
  weak_hubs?: {
    label?: string;
    hub_type?: string;
    last_mile_score?: number;
    nearest_stop_m?: number;
    stops_within_300m?: number;
  }[];
  need_lines?: {
    status?: string;
    urgent?: number;
    priority?: number;
    top_corridors?: { road_name?: string; need_band?: string; unmet_length_m?: number }[];
  };
  underserved_examples?: {
    label?: string;
    pt_index?: number;
    sec_proxy_band?: string | null;
    pct_slum_area?: number | null;
  }[];
  sec_counts?: Record<string, number>;
  lowest_wards?: {
    label?: string;
    pt_index?: number;
    gap_index?: number;
    stop_count?: number;
    sec_proxy_band?: string | null;
  }[];
  highest_wards?: {
    label?: string;
    pt_index?: number;
    gap_index?: number;
  }[];
  schools?: Record<string, unknown> | null;
  healthcare?: Record<string, unknown> | null;
  partial_tables?: { name?: string; rows?: number; columns?: string[]; file?: string }[];
  insights?: { theme?: string; detail?: string }[];
  corridors_mentioned?: string[];
  pt_measures_mentioned?: string[];
  document?: Record<string, unknown>;
  economic_census?: {
    status?: string;
    counts?: Record<string, number>;
    chart?: ObjectiveChartBar[];
    high_activity_low_pt?: {
      ward_label?: string;
      establishments?: number;
      total_workers?: number;
      pt_index?: number | null;
    }[];
    note?: string;
  };
}

export interface ObjectiveRecommendation {
  priority: string;
  objective: string;
  title: string;
  detail: string;
  map_href?: string;
}

export interface ObjectivesAnalysis {
  generated_at: string;
  note?: string;
  objectives: ObjectiveBlock[];
  recommendations: ObjectiveRecommendation[];
  catchment_coverage?: {
    status?: string;
    city_mean_pct_outside_400m?: number;
    counts?: Record<string, number>;
  };
}
