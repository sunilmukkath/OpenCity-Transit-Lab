"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  GapComponents,
  SpatialReports as SpatialReportsData,
  SpatialUnitReport,
  UnitRecommendation,
} from "@/lib/types";
import { fetchReportsClient } from "@/lib/data-client";
import { StatusBadge } from "@/components/StatusBadge";
import { MetricCard } from "@/components/MetricCard";
import {
  DashboardFilterBar,
  FilterImpactStrip,
  useFilteredUniverse,
} from "@/components/DashboardFilterBar";
import type { EnrichedWard } from "@/lib/dashboard-filters";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";

type SortKey = "gap" | "stops" | "density" | "name" | "pt" | "slum" | "activity";

const PRIORITY_STYLE: Record<string, string> = {
  critical: "border-[var(--danger)] bg-[rgba(251,113,133,0.12)] text-[var(--danger)]",
  high: "border-[var(--hub)] bg-[rgba(251,146,60,0.12)] text-[var(--hub)]",
  medium: "border-[var(--amber)] bg-[rgba(232,168,32,0.12)] text-[var(--amber)]",
  info: "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]",
};

const BAND_STYLE: Record<string, string> = {
  severe: "border-[var(--danger)] bg-[rgba(251,113,133,0.14)] text-[var(--danger)]",
  high: "border-[var(--hub)] bg-[rgba(251,146,60,0.14)] text-[var(--hub)]",
  moderate: "border-[var(--amber)] bg-[rgba(232,168,32,0.14)] text-[var(--amber)]",
  low: "border-[var(--teal)] bg-[rgba(45,212,191,0.12)] text-[var(--teal)]",
};

const COMPONENT_META: {
  key: keyof GapComponents;
  label: string;
  max: number;
}[] = [
  { key: "stop_gap", label: "Stop access", max: 40 },
  { key: "shelter_gap", label: "Shelter coverage", max: 30 },
  { key: "hub_gap", label: "Hub / last-mile", max: 20 },
  { key: "density_gap", label: "Stop density", max: 10 },
];

function PriorityChip({ priority }: { priority: string }) {
  const style = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.info;
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}
    >
      {priority}
    </span>
  );
}

function GapBandChip({ band }: { band: string }) {
  const style = BAND_STYLE[band] ?? BAND_STYLE.moderate;
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}
    >
      {band} gap
    </span>
  );
}

function gapValue(unit: SpatialUnitReport): number {
  return unit.gap_index ?? unit.priority_score ?? 0;
}

function gapBand(unit: SpatialUnitReport): string {
  return unit.gap_band ?? "moderate";
}

function fmt(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return digits > 0 ? n.toFixed(digits) : n.toLocaleString();
}

function GapMeter({ value, band }: { value: number; band: string }) {
  const color =
    band === "severe"
      ? "var(--danger)"
      : band === "high"
        ? "var(--hub)"
        : band === "moderate"
          ? "var(--amber)"
          : "var(--teal)";
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Gap Index
          </p>
          <p className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--yellow)]">
            {value}
          </p>
        </div>
        <GapBandChip band={band} />
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, Math.max(2, value))}%`, background: color }}
        />
      </div>
      <p className="text-xs text-[var(--ink-muted)]">0 = low inventory gap · 100 = severe</p>
    </div>
  );
}

function GapComponentsBreakdown({
  components,
}: {
  components?: GapComponents | null;
}) {
  if (!components) {
    return (
      <p className="text-sm text-[var(--ink-muted)]">Gap components unavailable for this unit.</p>
    );
  }
  return (
    <div className="space-y-3">
      {COMPONENT_META.map((c) => {
        const value = components[c.key] ?? 0;
        const pct = Math.round((value / c.max) * 100);
        return (
          <div key={c.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-[var(--ink)]">{c.label}</span>
              <span className="font-semibold text-[var(--yellow)]">
                {value}
                <span className="font-normal text-[var(--ink-muted)]">/{c.max}</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.max(value > 0 ? 4 : 0, pct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecommendationList({ items }: { items: UnitRecommendation[] }) {
  if (!items.length) {
    return <p className="text-sm text-[var(--ink-muted)]">No recommendations for this unit.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((rec, idx) => (
        <li
          key={`${rec.title}-${idx}`}
          className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3"
        >
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <PriorityChip priority={rec.priority} />
            <h4 className="font-semibold text-[var(--ink)]">{rec.title}</h4>
          </div>
          <p className="text-sm leading-relaxed text-[var(--ink-muted)]">{rec.detail}</p>
        </li>
      ))}
    </ul>
  );
}

function UnitListItem({
  unit,
  active,
  onSelect,
}: {
  unit: EnrichedWard | SpatialUnitReport;
  active: boolean;
  onSelect: () => void;
}) {
  const index = gapValue(unit);
  const band = gapBand(unit);
  const enriched = unit as EnrichedWard;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
        active
          ? "border-[var(--yellow)] bg-[rgba(255,229,102,0.1)]"
          : "border-[var(--border)] bg-white/[0.02] hover:border-[var(--accent)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            {unit.unit_type === "zone" ? "Zone / area" : "Ward"}
          </p>
          <p className="font-semibold text-[var(--ink)]">{unit.label}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-[var(--yellow)]">{index}</p>
          <GapBandChip band={band} />
        </div>
      </div>
      <p className="mt-1 text-xs text-[var(--ink-muted)]">
        {fmt(unit.stop_count)} stops · {fmt(unit.shelter_count)} shelters · MRTS{" "}
        {fmt(unit.mrts_station_count ?? 0)} · CMRL {fmt(unit.cmrl_hub_count ?? 0)}
        {unit.railway_station_count != null && unit.railway_station_count > 0
          ? ` · rail ${fmt(unit.railway_station_count)}`
          : ""}
        {unit.mean_walk_m != null ? ` · walk ~${fmt(unit.mean_walk_m, 0)} m` : ""}
        {enriched.pt_index != null ? ` · PT ${enriched.pt_index}` : ""}
      </p>
      {unit.unit_type === "ward" ? (
        <p className="mt-1 flex flex-wrap gap-1 text-[10px] text-[var(--ink-muted)]">
          {enriched.has_slum ? (
            <span className="rounded border border-[var(--border)] px-1.5 py-0.5">
              Slum{enriched.pct_slum_area != null ? ` ${enriched.pct_slum_area.toFixed(0)}%` : ""}
            </span>
          ) : (
            <span className="rounded border border-[var(--border)] px-1.5 py-0.5">Non-slum</span>
          )}
          {enriched.activity_band && enriched.activity_band !== "unknown" ? (
            <span className="rounded border border-[var(--border)] px-1.5 py-0.5">
              EC {enriched.activity_band}
            </span>
          ) : null}
        </p>
      ) : null}
    </button>
  );
}

function ReportDetail({
  unit,
  cityMean,
  cityGap,
}: {
  unit: EnrichedWard | SpatialUnitReport | null;
  cityMean: number | null;
  cityGap: number | null | undefined;
}) {
  if (!unit) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] p-6 text-sm text-[var(--ink-muted)]">
        Select a ward, zone, or area to open its Gap Index and recommendations.
      </div>
    );
  }

  const index = gapValue(unit);
  const band = gapBand(unit);
  const enriched = unit as EnrichedWard;

  return (
    <article
      id="spatial-report-print"
      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm print:border-0 print:bg-white print:text-black"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--yellow)] print:text-amber-700">
            {unit.unit_type === "zone" ? "Zone / area report" : "Ward report"}
          </p>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--yellow-bright)] print:text-slate-900">
            {unit.label}
          </h3>
          <p className="mt-1 text-sm text-[var(--ink-muted)] print:text-slate-600">
            Inventory Gap Index from verified spatial joins
            {cityGap != null ? ` · city ward mean ${cityGap}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] print:hidden"
        >
          Print report
        </button>
      </div>

      {unit.unit_type === "ward" ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase text-[var(--ink-muted)]">PT index</p>
            <p className="text-lg font-semibold text-[var(--yellow)]">
              {enriched.pt_index ?? "—"}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase text-[var(--ink-muted)]">Slum vs non-slum</p>
            <p className="text-lg font-semibold text-[var(--ink)]">
              {enriched.has_slum
                ? enriched.pct_slum_area != null
                  ? `Slum · ${enriched.pct_slum_area.toFixed(1)}%`
                  : "Slum"
                : "Non-slum"}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase text-[var(--ink-muted)]">EC establishments</p>
            <p className="text-lg font-semibold text-[var(--ink)]">
              {enriched.establishments?.toLocaleString() ?? "—"}
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-4">
          <GapMeter value={index} band={band} />
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Gap components
          </p>
          <GapComponentsBreakdown components={unit.gap_components} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Stops
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--yellow)]">{fmt(unit.stop_count)}</p>
          {cityMean != null ? (
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              City ward mean {fmt(cityMean, 1)}
            </p>
          ) : null}
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Shelters
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--yellow)]">
            {fmt(unit.shelter_count)}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Rail hubs (combined)
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--yellow)]">{fmt(unit.hub_count)}</p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">MRTS + metro tags · Gap Index input</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Density
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--yellow)]">
            {fmt(unit.stops_per_km2, 1)}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            stops/km² · {fmt(unit.area_km2, 2)} km²
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Avg walk to PT
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--yellow)]">
            {unit.mean_walk_m != null ? `${fmt(unit.mean_walk_m, 0)} m` : "—"}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            Crow-flies mean
            {unit.median_walk_m != null ? ` · median ${fmt(unit.median_walk_m, 0)} m` : ""}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Within 400m
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--yellow)]">
            {unit.pct_samples_within_400m != null
              ? `${fmt(unit.pct_samples_within_400m, 0)}%`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            of ward sample grid
            {unit.pct_samples_within_800m != null
              ? ` · ${fmt(unit.pct_samples_within_800m, 0)}% ≤800m`
              : ""}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            P90 walk
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--yellow)]">
            {unit.p90_walk_m != null ? `${fmt(unit.p90_walk_m, 0)} m` : "—"}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            90th percentile sample distance
            {unit.walk_sample_points != null ? ` · n=${unit.walk_sample_points}` : ""}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            MRTS stations
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--yellow)]">
            {fmt(unit.mrts_station_count ?? 0)}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            {unit.has_mrts
              ? "Inside boundary"
              : unit.nearest_mrts_m != null
                ? `Nearest ${fmt(unit.nearest_mrts_m, 0)} m`
                : "No station join"}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            CMRL hubs
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--yellow)]">
            {fmt(unit.cmrl_hub_count ?? 0)}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            {unit.has_cmrl
              ? "Inside boundary"
              : unit.nearest_cmrl_m != null
                ? `Nearest ${fmt(unit.nearest_cmrl_m, 0)} m`
                : "No hub join"}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Railway stations
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--yellow)]">
            {fmt(unit.railway_station_count ?? 0)}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            {unit.has_railway
              ? "OSM inside boundary"
              : unit.nearest_railway_m != null
                ? `Nearest ${fmt(unit.nearest_railway_m, 0)} m`
                : "Partial / no join"}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <h4 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--yellow)] print:text-slate-900">
          Recommendations
        </h4>
        <p className="mt-1 text-sm text-[var(--ink-muted)] print:text-slate-600">
          Rule-based from inventory only — not census equity scores. Field-verify before capital
          works.
        </p>
        <div className="mt-3">
          <RecommendationList items={unit.recommendations} />
        </div>
      </div>
    </article>
  );
}

function downloadReportsCsv(rows: SpatialUnitReport[], filename: string) {
  const header = [
    "unit_type",
    "label",
    "gap_index",
    "gap_band",
    "stop_gap",
    "shelter_gap",
    "hub_gap",
    "density_gap",
    "stop_count",
    "shelter_count",
    "hub_count",
    "mrts_station_count",
    "cmrl_hub_count",
    "railway_station_count",
    "has_mrts",
    "has_cmrl",
    "has_railway",
    "nearest_mrts_m",
    "nearest_cmrl_m",
    "nearest_railway_m",
    "mean_walk_m",
    "median_walk_m",
    "p90_walk_m",
    "pct_samples_within_400m",
    "pct_samples_within_800m",
    "area_km2",
    "stops_per_km2",
    "top_recommendation",
  ];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.unit_type,
        `"${r.label.replaceAll('"', '""')}"`,
        gapValue(r),
        gapBand(r),
        r.gap_components?.stop_gap ?? "",
        r.gap_components?.shelter_gap ?? "",
        r.gap_components?.hub_gap ?? "",
        r.gap_components?.density_gap ?? "",
        r.stop_count ?? "",
        r.shelter_count ?? "",
        r.hub_count ?? "",
        r.mrts_station_count ?? "",
        r.cmrl_hub_count ?? "",
        r.railway_station_count ?? "",
        r.has_mrts ? 1 : 0,
        r.has_cmrl ? 1 : 0,
        r.has_railway ? 1 : 0,
        r.nearest_mrts_m ?? "",
        r.nearest_cmrl_m ?? "",
        r.nearest_railway_m ?? "",
        r.mean_walk_m ?? "",
        r.median_walk_m ?? "",
        r.p90_walk_m ?? "",
        r.pct_samples_within_400m ?? "",
        r.pct_samples_within_800m ?? "",
        r.area_km2 ?? "",
        r.stops_per_km2 ?? "",
        `"${(r.recommendations[0]?.title ?? "").replaceAll('"', '""')}"`,
      ].join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SpatialReports() {
  const [reports, setReports] = useState<SpatialReportsData | null>(null);
  const [loadingReports, setLoadingReports] = useState(true);
  const [filters, setFilters] = useDashboardFilters({ unit: "ward" });
  const [sortKey, setSortKey] = useState<SortKey>("gap");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const {
    loading: loadingUniverse,
    filtered,
    wardOptions,
    zoneOptions,
    cityMeanGap,
    all,
  } = useFilteredUniverse(filters);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchReportsClient();
      if (!cancelled) {
        setReports(data);
        setLoadingReports(false);
        const first =
          data?.severe_gap_wards?.[0] ??
          data?.priority_wards[0] ??
          data?.wards[0] ??
          null;
        if (first) setSelectedId(`${first.unit_type}:${first.label}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bandCounts = useMemo(() => {
    const counts: Record<string, number> = { severe: 0, high: 0, moderate: 0, low: 0 };
    for (const w of all.filter((u) => u.unit_type === "ward")) {
      const b = gapBand(w);
      counts[b] = (counts[b] ?? 0) + 1;
    }
    return counts;
  }, [all]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      if (sortKey === "name") return a.label.localeCompare(b.label);
      if (sortKey === "stops") return (b.stop_count ?? -1) - (a.stop_count ?? -1);
      if (sortKey === "density") return (b.stops_per_km2 ?? -1) - (a.stops_per_km2 ?? -1);
      if (sortKey === "pt") return (a.pt_index ?? 999) - (b.pt_index ?? 999);
      if (sortKey === "slum") return (b.pct_slum_area ?? -1) - (a.pct_slum_area ?? -1);
      if (sortKey === "activity") return (b.establishments ?? -1) - (a.establishments ?? -1);
      return gapValue(b) - gapValue(a) || a.label.localeCompare(b.label);
    });
    return rows;
  }, [filtered, sortKey]);

  const selected = useMemo(() => {
    if (!selectedId) return sorted[0] ?? null;
    return all.find((u) => `${u.unit_type}:${u.label}` === selectedId) ?? sorted[0] ?? null;
  }, [all, selectedId, sorted]);

  useEffect(() => {
    if (!sorted.length) return;
    const still = sorted.some((u) => `${u.unit_type}:${u.label}` === selectedId);
    if (!still) setSelectedId(`${sorted[0].unit_type}:${sorted[0].label}`);
  }, [sorted, selectedId]);

  const loading = loadingReports || loadingUniverse;

  if (loading) {
    return <p className="text-sm text-[var(--ink-muted)]">Loading ward / zone reports…</p>;
  }

  if (!reports) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <StatusBadge status="unavailable" />
        <p className="mt-3 text-[var(--ink-muted)]">
          Spatial reports not found. Run the ETL pipeline to generate{" "}
          <code className="text-[var(--accent)]">reports.json</code>.
        </p>
      </div>
    );
  }

  const method = reports.gap_index_method;
  const severeCount = bandCounts.severe;

  return (
    <div className="space-y-6">
      <DashboardFilterBar
        filters={filters}
        onChange={setFilters}
        wardOptions={wardOptions}
        zoneOptions={zoneOptions}
        resultCount={sorted.length}
      />
      <FilterImpactStrip units={sorted} cityMeanGap={cityMeanGap} />

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--yellow)]">
              Inventory Gap Index
            </p>
            <h3 className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]">
              Filter any slice — then open a ward brief
            </h3>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              {method?.disclaimer ?? reports.note}
            </p>
          </div>
          <div className="min-w-[160px] rounded-lg border border-[var(--border)] bg-white/[0.03] px-4 py-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              City mean (wards)
            </p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow)]">
              {fmt(reports.city_mean_gap_index, 1)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["severe", "≥70"],
              ["high", "45–69"],
              ["moderate", "25–44"],
              ["low", "<25"],
            ] as const
          ).map(([band, range]) => (
            <button
              key={band}
              type="button"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  gapBand: prev.gapBand === band ? "all" : band,
                }))
              }
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                filters.gapBand === band
                  ? BAND_STYLE[band]
                  : "border-[var(--border)] text-[var(--ink-muted)] hover:border-[var(--accent)]"
              }`}
            >
              {band} {range} · {bandCounts[band] ?? 0}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="City Gap Index"
          value={
            reports.city_mean_gap_index != null
              ? Number(reports.city_mean_gap_index).toFixed(1)
              : null
          }
          subtext="Mean across all wards"
        />
        <MetricCard label="Severe gap (city)" value={severeCount} subtext="Gap Index ≥ 70" />
        <MetricCard
          label="In current filter"
          value={sorted.filter((u) => u.unit_type === "ward").length}
          subtext="Wards matching filters"
        />
        <MetricCard
          label="Filtered severe"
          value={sorted.filter((u) => String(u.gap_band) === "severe").length}
          subtext="Severe within filter"
        />
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--yellow)]">
              Browse
            </p>
            <h3 className="mt-1 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
              Filtered ward / zone workbench
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-[var(--ink-muted)]">
              Sort{" "}
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="ml-1 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-[var(--ink)]"
              >
                <option value="gap">Gap Index</option>
                <option value="pt">PT index</option>
                <option value="stops">Stop count</option>
                <option value="density">Stop density</option>
                <option value="slum">Slum %</option>
                <option value="activity">EC establishments</option>
                <option value="name">Name</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => downloadReportsCsv(reports.wards, "ward-gap-index.csv")}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Export wards CSV
            </button>
          </div>
        </div>

        <p className="mb-3 text-sm text-[var(--ink-muted)]">
          Showing {sorted.length} of {all.length} units
        </p>

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <ul className="max-h-[640px] space-y-2 overflow-y-auto pr-1">
            {sorted.map((u) => (
              <li key={`${u.unit_type}-${u.label}`}>
                <UnitListItem
                  unit={u}
                  active={selectedId === `${u.unit_type}:${u.label}`}
                  onSelect={() => setSelectedId(`${u.unit_type}:${u.label}`)}
                />
              </li>
            ))}
            {!sorted.length ? (
              <li className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--ink-muted)]">
                No wards or zones match these filters. Reset or widen the slice.
              </li>
            ) : null}
          </ul>
          <ReportDetail
            unit={selected}
            cityMean={reports.city_mean_stops_per_ward}
            cityGap={reports.city_mean_gap_index}
          />
        </div>
      </section>
    </div>
  );
}
