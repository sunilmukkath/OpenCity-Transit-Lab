import { promises as fs } from "fs";
import path from "path";
import type { FeatureCollection, Geometry } from "geojson";
import type { Manifest, Metrics } from "@/lib/types";

export * from "@/lib/types";

const PUBLIC_DATA = path.join(process.cwd(), "public", "data");

async function readPublicJson<T>(filename: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(path.join(PUBLIC_DATA, filename), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function fetchManifest(): Promise<Manifest | null> {
  return readPublicJson<Manifest>("manifest.json");
}

export async function fetchMetrics(): Promise<Metrics | null> {
  return readPublicJson<Metrics>("metrics.json");
}

export async function fetchGeoJSONServer(
  file: string
): Promise<FeatureCollection<Geometry> | null> {
  return readPublicJson<FeatureCollection<Geometry>>(file);
}
