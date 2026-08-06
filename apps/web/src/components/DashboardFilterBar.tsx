"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_FILTERS,
  activityBandOf,
  applyUnitFilters,
  filtersActive,
  summarizeFiltered,
  type DashboardFilters,
  type EnrichedWard,
  type GapBandFilter,
  type SlumFilter,
  type ActivityFilter,
  type PtBandFilter,
  type UnitKind,
} from "@/lib/dashboard-filters";
import {
  fetchAnalysesClient,
  fetchJson,
  fetchReportsClient,
} from "@/lib/data-client";
import type { SpatialUnitReport } from "@/lib/types";

type EcPayload = {
  status?: string;
  wards?: {
    ward_label?: string;
    establishments?: number;
    total_workers?: number;
  }[];
};

const selectCls =
  "rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-sm text-[var(--ink)]";

export function useEnrichedUniverse() {
  const [loading, setLoading] = useState(true);
  const [wards, setWards] = useState<EnrichedWard[]>([]);
  const [zones, setZones] = useState<EnrichedWard[]>([]);
  const [cityMeanGap, setCityMeanGap] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [reports, analyses, ec] = await Promise.all([
        fetchReportsClient(),
        fetchAnalysesClient(),
        fetchJson<EcPayload>("/data/economic_census_wards.json"),
      ]);
      if (cancelled) return;

      const secBy = new Map(
        (analyses?.sec_proxy?.wards ?? []).map((w) => [String(w.label), w])
      );
      const ecBy = new Map(
        (ec?.wards ?? []).map((w) => [String(w.ward_label), w])
      );
      const estVals = (ec?.wards ?? [])
        .map((w) => Number(w.establishments))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);
      const q33 = estVals[Math.floor(estVals.length * 0.33)] ?? 0;
      const q66 = estVals[Math.floor(estVals.length * 0.66)] ?? 0;

      const enrich = (u: SpatialUnitReport): EnrichedWard => {
        const gap = u.gap_index ?? u.priority_score ?? null;
        const pt = gap != null ? Math.round(Math.max(0, Math.min(100, 100 - gap)) * 10) / 10 : null;
        if (u.unit_type !== "ward") {
          return {
            ...u,
            pt_index: pt,
            pct_slum_area: null,
            has_slum: false,
            slum_band: null,
            establishments: null,
            total_workers: null,
            activity_band: "unknown",
          };
        }
        const slum = secBy.get(String(u.label));
        const e = ecBy.get(String(u.label));
        const establishments = e?.establishments ?? null;
        return {
          ...u,
          pt_index: pt,
          pct_slum_area: slum?.pct_slum_area ?? null,
          has_slum: Boolean(slum?.has_slum),
          slum_band: slum?.slum_band ?? null,
          establishments,
          total_workers: e?.total_workers ?? null,
          activity_band: activityBandOf(establishments, q33, q66),
        };
      };

      setWards((reports?.wards ?? []).map(enrich));
      setZones((reports?.zones ?? []).map(enrich));
      setCityMeanGap(reports?.city_mean_gap_index ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const all = useMemo(() => [...wards, ...zones], [wards, zones]);
  return { loading, wards, zones, all, cityMeanGap };
}

export function DashboardFilterBar({
  filters,
  onChange,
  wardOptions,
  zoneOptions,
  resultCount,
  compact,
}: {
  filters: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
  wardOptions: string[];
  zoneOptions: string[];
  resultCount?: number;
  compact?: boolean;
}) {
  const set = <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const active = filtersActive(filters);

  return (
    <div
      className={`rounded-2xl border border-[var(--border)] bg-[linear-gradient(160deg,rgba(16,52,102,0.95),rgba(10,31,74,0.98))] ${
        compact ? "p-3" : "p-4 sm:p-5"
      } shadow-[0_18px_40px_rgba(8,13,26,0.35)]`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--yellow)]">
            Filters
          </p>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            Ward · zone · gap band · slum vs non-slum · economic activity · PT index
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {resultCount != null ? (
            <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[var(--ink-muted)]">
              {resultCount.toLocaleString()} matches
            </span>
          ) : null}
          {active > 0 ? (
            <span className="rounded-full border border-[var(--yellow)] bg-[rgba(255,229,102,0.12)] px-2.5 py-1 font-semibold text-[var(--yellow)]">
              {active} active
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_FILTERS })}
            className="rounded-full border border-[var(--border)] px-2.5 py-1 font-semibold text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <label className="block text-xs">
          <span className="mb-1 block text-[var(--ink-muted)]">Search</span>
          <input
            value={filters.query}
            onChange={(e) => set("query", e.target.value)}
            placeholder="Ward, zone, band…"
            className={`w-full ${selectCls}`}
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-[var(--ink-muted)]">Unit</span>
          <select
            className={`w-full ${selectCls}`}
            value={filters.unit}
            onChange={(e) => set("unit", e.target.value as UnitKind)}
          >
            <option value="all">Wards + zones</option>
            <option value="ward">Wards only</option>
            <option value="zone">Zones only</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-[var(--ink-muted)]">Ward</span>
          <select
            className={`w-full ${selectCls}`}
            value={filters.ward}
            onChange={(e) =>
              onChange({
                ...filters,
                ward: e.target.value,
                unit: e.target.value ? "ward" : filters.unit,
                zone: "",
              })
            }
          >
            <option value="">All wards</option>
            {wardOptions.map((w) => (
              <option key={w} value={w}>
                Ward {w}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-[var(--ink-muted)]">Zone</span>
          <select
            className={`w-full ${selectCls}`}
            value={filters.zone}
            onChange={(e) =>
              onChange({
                ...filters,
                zone: e.target.value,
                unit: e.target.value ? "zone" : filters.unit,
                ward: "",
              })
            }
          >
            <option value="">All zones</option>
            {zoneOptions.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-[var(--ink-muted)]">Gap band</span>
          <select
            className={`w-full ${selectCls}`}
            value={filters.gapBand}
            onChange={(e) => set("gapBand", e.target.value as GapBandFilter)}
          >
            <option value="all">All bands</option>
            <option value="severe">Severe (≥70)</option>
            <option value="high">High (45–69)</option>
            <option value="moderate">Moderate (25–44)</option>
            <option value="low">Low (&lt;25)</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-[var(--ink-muted)]">Slum vs non-slum</span>
          <select
            className={`w-full ${selectCls}`}
            value={filters.slum}
            onChange={(e) => set("slum", e.target.value as SlumFilter)}
          >
            <option value="all">Slum + non-slum</option>
            <option value="has_slum">Slum wards</option>
            <option value="no_slum">Non-slum wards</option>
            <option value="high_slum">High slum share (≥10%)</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-[var(--ink-muted)]">Economic activity (EC)</span>
          <select
            className={`w-full ${selectCls}`}
            value={filters.activity}
            onChange={(e) => set("activity", e.target.value as ActivityFilter)}
          >
            <option value="all">All activity</option>
            <option value="higher">Higher establishments</option>
            <option value="middle">Middle</option>
            <option value="lower">Lower</option>
            <option value="unknown">No EC join</option>
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-[var(--ink-muted)]">PT index band</span>
          <select
            className={`w-full ${selectCls}`}
            value={filters.ptBand}
            onChange={(e) => set("ptBand", e.target.value as PtBandFilter)}
          >
            <option value="all">All PT index</option>
            <option value="low">Low (&lt;40)</option>
            <option value="moderate">Moderate (40–54)</option>
            <option value="high">High (55–69)</option>
            <option value="very_high">Very high (≥70)</option>
          </select>
        </label>
      </div>
    </div>
  );
}

export function FilterImpactStrip({
  units,
  cityMeanGap,
}: {
  units: EnrichedWard[];
  cityMeanGap: number | null;
}) {
  const s = summarizeFiltered(units);
  const cards = [
    { label: "Wards in view", value: String(s.wards) },
    {
      label: "Mean Gap Index",
      value: s.meanGap != null ? String(s.meanGap) : null,
      sub: cityMeanGap != null ? `City ${cityMeanGap}` : undefined,
    },
    { label: "Mean PT index", value: s.meanPt != null ? String(s.meanPt) : null },
    { label: "Severe gap", value: String(s.severe) },
    { label: "Slum wards", value: String(s.withSlum) },
    { label: "Non-slum wards", value: String(s.nonSlum) },
    { label: "PT index <40", value: String(s.lowPt) },
    {
      label: "EC establishments",
      value: s.establishments ? s.establishments.toLocaleString() : null,
    },
  ].filter((c) => c.value != null);

  if (!cards.length) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-3"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            {c.label}
          </p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--yellow)]">
            {c.value}
          </p>
          {c.sub ? <p className="mt-0.5 text-[10px] text-[var(--ink-muted)]">{c.sub}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function useFilteredUniverse(filters: DashboardFilters) {
  const universe = useEnrichedUniverse();
  const filtered = useMemo(
    () => applyUnitFilters(universe.all, filters),
    [universe.all, filters]
  );
  const wardOptions = useMemo(
    () => universe.wards.map((w) => w.label).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [universe.wards]
  );
  const zoneOptions = useMemo(
    () => universe.zones.map((z) => z.label).sort((a, b) => a.localeCompare(b)),
    [universe.zones]
  );
  return { ...universe, filtered, wardOptions, zoneOptions };
}
