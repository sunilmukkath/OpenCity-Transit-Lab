/** Multi-audience hubs — primary entry points after Home. */

export type HubId = "citizen" | "planner" | "operator" | "press";

export type AudienceQuery =
  | HubId
  | "traffic"
  | "equity"
  | "hubs"
  | "local"
  | "public";

export interface HubDef {
  id: HubId;
  label: string;
  short: string;
  job: string;
  blurb: string;
  href: string;
  /** Default map preset id */
  mapPreset: string;
  mapAudience: AudienceQuery;
}

/** Single global tool nav — same on every page (no per-hub tab clones). */
export const GLOBAL_NAV: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/map", label: "Map" },
  { href: "/analytics", label: "Reports" },
  { href: "/sources", label: "Sources" },
];

export const HUBS: HubDef[] = [
  {
    id: "citizen",
    label: "Citizen",
    short: "Your area",
    job: "Is my neighbourhood poorly served?",
    blurb: "Plain-language ward brief, walk distance, schools and health access.",
    href: "/for/citizen",
    mapPreset: "destinations",
    mapAudience: "citizen",
  },
  {
    id: "planner",
    label: "Planner",
    short: "Intervene",
    job: "Where should we intervene?",
    blurb: "Gap Index, objectives evidence, priority actions, ward memos.",
    href: "/for/planner",
    mapPreset: "serve",
    mapAudience: "planner",
  },
  {
    id: "operator",
    label: "Operator",
    short: "Feeders",
    job: "Where do feeders fail at hubs?",
    blurb: "Hub last-mile, shelter gaps, need lines — live feeds stay Not connected until plugged in.",
    href: "/for/operator",
    mapPreset: "hubs",
    mapAudience: "hubs",
  },
  {
    id: "press",
    label: "Press / NGO",
    short: "Cite",
    job: "What can I cite with provenance?",
    blurb: "Slum vs non-slum facts, EC×PT tables, citation pack, Sources.",
    href: "/for/press",
    mapPreset: "slum",
    mapAudience: "equity",
  },
];

export function hubById(id: string | null | undefined): HubDef | null {
  if (!id) return null;
  return HUBS.find((h) => h.id === id) ?? null;
}

export function hubFromAudience(audience: string | null | undefined): HubDef | null {
  if (!audience) return null;
  if (audience === "traffic") return hubById("planner");
  if (audience === "equity") return hubById("press");
  if (audience === "hubs") return hubById("operator");
  if (audience === "local" || audience === "public") return hubById("planner");
  return hubById(audience);
}

export const AUDIENCE_MAP_NOTES: Record<string, string> = {
  citizen:
    "Citizen view — destinations and walk distance. Inventory only; not a trip planner.",
  planner:
    "Planner view — gap wards, need lines, and GIS-ready layers for intervention planning.",
  traffic:
    "Traffic / network view — hubs, corridors, and need lines for GIS export.",
  operator:
    "Operator view — hub last-mile and feeder gaps. Live positions stay Not connected.",
  hubs: "Operator / hub view — rail–metro hubs and surrounding stop inventory.",
  equity:
    "Equity view — slum vs non-slum ward choropleth from OpenCity polygons (not income).",
  press:
    "Press view — equity choropleth with downloadable provenance on Sources.",
};

export function audienceMapNote(audience: string | null | undefined): string | undefined {
  if (!audience) return undefined;
  return AUDIENCE_MAP_NOTES[audience];
}
