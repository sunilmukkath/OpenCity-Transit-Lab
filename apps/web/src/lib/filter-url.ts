import {
  DEFAULT_FILTERS,
  type ActivityFilter,
  type DashboardFilters,
  type GapBandFilter,
  type PtBandFilter,
  type SlumFilter,
  type UnitKind,
} from "@/lib/dashboard-filters";

/** Query keys for dashboard filters (short, shareable). */
export const FILTER_PARAM_KEYS = [
  "q",
  "unit",
  "gap",
  "slum",
  "activity",
  "pt",
  "ward",
  "zone",
] as const;

const GAP: GapBandFilter[] = ["all", "severe", "high", "moderate", "low"];
const SLUM: SlumFilter[] = ["all", "has_slum", "no_slum", "high_slum"];
const ACTIVITY: ActivityFilter[] = ["all", "higher", "middle", "lower", "unknown"];
const PT: PtBandFilter[] = ["all", "low", "moderate", "high", "very_high"];
const UNIT: UnitKind[] = ["all", "ward", "zone"];

function pick<T extends string>(raw: string | null, allowed: T[], fallback: T): T {
  if (raw && (allowed as string[]).includes(raw)) return raw as T;
  return fallback;
}

export function filtersFromSearchParams(
  params: URLSearchParams,
  pageDefaults?: Partial<DashboardFilters>
): DashboardFilters {
  const hasAny = FILTER_PARAM_KEYS.some((k) => {
    const v = params.get(k);
    return v != null && v !== "";
  });
  const base: DashboardFilters = {
    ...DEFAULT_FILTERS,
    ...(pageDefaults ?? {}),
  };
  if (!hasAny) return base;

  return {
    query: params.get("q") ?? "",
    unit: pick(params.get("unit"), UNIT, base.unit),
    gapBand: pick(params.get("gap"), GAP, base.gapBand),
    slum: pick(params.get("slum"), SLUM, base.slum),
    activity: pick(params.get("activity"), ACTIVITY, base.activity),
    ptBand: pick(params.get("pt"), PT, base.ptBand),
    ward: params.get("ward") ?? "",
    zone: params.get("zone") ?? "",
  };
}

/** Write filter fields into params; remove keys that match defaults. */
export function writeFiltersToSearchParams(
  params: URLSearchParams,
  filters: DashboardFilters,
  defaults: DashboardFilters = DEFAULT_FILTERS
): void {
  const setOrDel = (key: string, value: string, defaultValue: string) => {
    if (!value || value === defaultValue) params.delete(key);
    else params.set(key, value);
  };
  setOrDel("q", filters.query.trim(), "");
  setOrDel("unit", filters.unit, defaults.unit);
  setOrDel("gap", filters.gapBand, defaults.gapBand);
  setOrDel("slum", filters.slum, defaults.slum);
  setOrDel("activity", filters.activity, defaults.activity);
  setOrDel("pt", filters.ptBand, defaults.ptBand);
  setOrDel("ward", filters.ward, "");
  setOrDel("zone", filters.zone, "");
}

/** Merge current search params into a target path, preserving audience/preset/tab. */
export function hrefWithFilters(
  href: string,
  current: URLSearchParams,
  filterOverrides?: Partial<DashboardFilters>
): string {
  const [path, qs] = href.split("?");
  const next = new URLSearchParams(current.toString());
  if (qs) {
    const fromHref = new URLSearchParams(qs);
    fromHref.forEach((v, k) => next.set(k, v));
  }
  if (filterOverrides) {
    const parsed = filtersFromSearchParams(next);
    writeFiltersToSearchParams(next, { ...parsed, ...filterOverrides });
  }
  const s = next.toString();
  return s ? `${path}?${s}` : path;
}
