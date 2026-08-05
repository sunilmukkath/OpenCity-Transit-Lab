import type { FeatureCollection, Geometry } from "geojson";
import type { Manifest, ManifestLayer, Metrics } from "@/lib/types";
import { layerIsReady } from "@/lib/types";

export async function fetchJson<T>(urlPath: string): Promise<T | null> {
  try {
    const res = await fetch(urlPath, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchManifestClient(): Promise<Manifest | null> {
  return fetchJson<Manifest>("/data/manifest.json");
}

export async function fetchMetricsClient(): Promise<Metrics | null> {
  return fetchJson<Metrics>("/data/metrics.json");
}

export async function fetchGeoJSONClient(
  file: string
): Promise<FeatureCollection<Geometry> | null> {
  return fetchJson<FeatureCollection<Geometry>>(`/data/${file}`);
}

export { layerIsReady };
export type { Manifest, ManifestLayer, Metrics };
