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

export type AudienceId = "policy" | "local" | "traffic" | "public";

export const AUDIENCES: {
  id: AudienceId;
  label: string;
  blurb: string;
  href: string;
}[] = [
  {
    id: "policy",
    label: "City overview",
    blurb: "For policymakers — verified coverage counts and gaps, no invented scores.",
    href: "/policy",
  },
  {
    id: "local",
    label: "Ward / zone",
    blurb: "For GCC local bodies — ward inventory and printable brief from real layers.",
    href: "/wards",
  },
  {
    id: "traffic",
    label: "Network map",
    blurb: "For traffic department — hubs, stops, catchments, GIS exports.",
    href: "/map?audience=traffic",
  },
  {
    id: "public",
    label: "Explore Chennai",
    blurb: "Public explorer — same evidence, plain language, full source transparency.",
    href: "/explore",
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
