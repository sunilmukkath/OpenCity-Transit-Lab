import type { SpatialUnitReport } from "@/lib/types";

export type UnitKind = "all" | "ward" | "zone";
export type GapBandFilter = "all" | "severe" | "high" | "moderate" | "low";
export type SlumFilter = "all" | "has_slum" | "no_slum" | "high_slum";
export type ActivityFilter = "all" | "higher" | "middle" | "lower" | "unknown";
export type PtBandFilter = "all" | "low" | "moderate" | "high" | "very_high";

export interface DashboardFilters {
  query: string;
  unit: UnitKind;
  gapBand: GapBandFilter;
  slum: SlumFilter;
  activity: ActivityFilter;
  ptBand: PtBandFilter;
  ward: string; // "" = all
  zone: string; // "" = all
}

export const DEFAULT_FILTERS: DashboardFilters = {
  query: "",
  unit: "all",
  gapBand: "all",
  slum: "all",
  activity: "all",
  ptBand: "all",
  ward: "",
  zone: "",
};

export interface EnrichedWard extends SpatialUnitReport {
  pt_index: number | null;
  pct_slum_area: number | null;
  has_slum: boolean;
  slum_band: string | null;
  establishments: number | null;
  total_workers: number | null;
  activity_band: "higher" | "middle" | "lower" | "unknown";
}

export function ptBandOf(pt: number | null): PtBandFilter | "unknown" {
  if (pt == null) return "unknown";
  if (pt < 40) return "low";
  if (pt < 55) return "moderate";
  if (pt < 70) return "high";
  return "very_high";
}

export function activityBandOf(
  establishments: number | null,
  q33: number,
  q66: number
): EnrichedWard["activity_band"] {
  if (establishments == null) return "unknown";
  if (establishments <= q33) return "lower";
  if (establishments <= q66) return "middle";
  return "higher";
}

export function filtersActive(f: DashboardFilters): number {
  let n = 0;
  if (f.query.trim()) n++;
  if (f.unit !== "all") n++;
  if (f.gapBand !== "all") n++;
  if (f.slum !== "all") n++;
  if (f.activity !== "all") n++;
  if (f.ptBand !== "all") n++;
  if (f.ward) n++;
  if (f.zone) n++;
  return n;
}

export function applyUnitFilters(
  units: EnrichedWard[],
  f: DashboardFilters
): EnrichedWard[] {
  const q = f.query.trim().toLowerCase();
  const zoneMode = f.unit === "zone" || Boolean(f.zone);

  return units.filter((u) => {
    if (f.ward) {
      return u.unit_type === "ward" && u.label === f.ward;
    }
    if (f.zone) {
      return u.unit_type === "zone" && u.label === f.zone;
    }
    if (f.unit !== "all" && u.unit_type !== f.unit) return false;

    const band = String(u.gap_band ?? "moderate");
    if (f.gapBand !== "all" && band !== f.gapBand) return false;

    const socioActive =
      f.slum !== "all" || f.activity !== "all" || f.ptBand !== "all";

    if (u.unit_type === "ward") {
      // Ward-only attributes — ignored in zone-only mode (wards already excluded)
      if (f.slum === "has_slum" && !u.has_slum) return false;
      if (f.slum === "no_slum" && u.has_slum) return false;
      if (f.slum === "high_slum" && (u.pct_slum_area ?? 0) < 10) return false;

      if (f.activity !== "all" && u.activity_band !== f.activity) return false;

      const ptB = ptBandOf(u.pt_index);
      if (f.ptBand !== "all" && ptB !== f.ptBand) return false;
    } else if (socioActive && !zoneMode) {
      // In "wards + zones" with a ward socio filter, keep wards only
      return false;
    }

    if (!q) return true;
    const hay = [
      u.label,
      u.unit_type,
      band,
      u.slum_band,
      u.has_slum ? "slum" : "non-slum",
      u.activity_band,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function summarizeFiltered(units: EnrichedWard[]) {
  const wards = units.filter((u) => u.unit_type === "ward");
  const zones = units.filter((u) => u.unit_type === "zone");
  const n = wards.length;
  const meanGapUnits = n > 0 ? wards : zones;
  const meanGap =
    meanGapUnits.length > 0
      ? Math.round(
          (meanGapUnits.reduce(
            (s, w) => s + (w.gap_index ?? w.priority_score ?? 0),
            0
          ) /
            meanGapUnits.length) *
            10
        ) / 10
      : null;
  const meanPt =
    n > 0
      ? Math.round(
          (wards
            .filter((w) => w.pt_index != null)
            .reduce((s, w) => s + (w.pt_index as number), 0) /
            Math.max(1, wards.filter((w) => w.pt_index != null).length)) *
            10
        ) / 10
      : null;
  const severe = meanGapUnits.filter((w) => String(w.gap_band) === "severe").length;
  const withSlum = wards.filter((w) => w.has_slum).length;
  const nonSlum = wards.filter((w) => !w.has_slum).length;
  const highSlum = wards.filter((w) => (w.pct_slum_area ?? 0) >= 10).length;
  const lowPt = wards.filter((w) => (w.pt_index ?? 100) < 40).length;
  const estSum = wards.reduce((s, w) => s + (w.establishments ?? 0), 0);
  return {
    wards: n,
    zones: zones.length,
    meanGap,
    meanPt,
    severe,
    withSlum,
    nonSlum,
    highSlum,
    lowPt,
    establishments: estSum,
  };
}
