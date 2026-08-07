/** Stakeholder hubs + the three app tools. */

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
  mapPreset: string;
  mapAudience: AudienceQuery;
}

/** Only three tools in the header — hubs live on Home /for/*. */
export const GLOBAL_NAV: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/map", label: "Map" },
  { href: "/sources", label: "Sources" },
];

export const HUBS: HubDef[] = [
  {
    id: "citizen",
    label: "Citizen",
    short: "Your area",
    job: "Is my neighbourhood poorly served?",
    blurb: "Pick a ward, get a plain-language brief, open the map.",
    href: "/for/citizen",
    mapPreset: "destinations",
    mapAudience: "citizen",
  },
  {
    id: "planner",
    label: "Planner",
    short: "Intervene",
    job: "Where should we intervene?",
    blurb: "Severe-gap wards, priority actions, then the map.",
    href: "/for/planner",
    mapPreset: "serve",
    mapAudience: "planner",
  },
  {
    id: "operator",
    label: "Operator",
    short: "Feeders",
    job: "Where do feeders fail at hubs?",
    blurb: "Weak hubs, shelter gaps, need lines. Live feeds stay Not connected.",
    href: "/for/operator",
    mapPreset: "hubs",
    mapAudience: "hubs",
  },
  {
    id: "press",
    label: "Press / NGO",
    short: "Cite",
    job: "What can I cite with provenance?",
    blurb: "Slum vs non-slum facts, citation pack, Sources.",
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
  citizen: "Citizen map — destinations and walk distance.",
  planner: "Planner map — gap wards and need lines.",
  traffic: "Traffic map — hubs, corridors, need lines.",
  operator: "Operator map — hubs and feeders.",
  hubs: "Hub map — rail/metro hubs and stops.",
  equity: "Equity map — slum vs non-slum wards (not income).",
  press: "Press map — equity choropleth.",
};

export function audienceMapNote(audience: string | null | undefined): string | undefined {
  if (!audience) return undefined;
  return AUDIENCE_MAP_NOTES[audience];
}
