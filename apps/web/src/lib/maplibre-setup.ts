"use client";

import { setWorkerUrl } from "maplibre-gl";

let configured = false;

/**
 * Point MapLibre at a same-origin module worker so Next.js bundling
 * cannot break the default blob worker.
 */
export function ensureMapLibreWorker() {
  if (configured || typeof window === "undefined") return;
  setWorkerUrl("/maplibre-gl-worker.mjs");
  configured = true;
}

/** Self-contained Carto Voyager raster — reliable tiles without vector style JSON. */
export const RASTER_BASEMAP = {
  version: 8 as const,
  name: "Carto Voyager",
  sources: {
    carto: {
      type: "raster" as const,
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap © CARTO",
      maxzoom: 20,
    },
  },
  layers: [
    {
      id: "carto",
      type: "raster" as const,
      source: "carto",
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

export const VECTOR_BASEMAPS = [
  {
    id: "voyager",
    label: "Streets",
    style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
  },
  {
    id: "dark",
    label: "Dark",
    style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  },
  {
    id: "liberty",
    label: "Liberty",
    style: "https://tiles.openfreemap.org/styles/liberty",
  },
] as const;
