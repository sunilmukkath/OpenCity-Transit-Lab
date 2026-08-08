"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  AdvancedAnalyses,
  CatchmentCoverageRow,
  HubLastMileRow,
  ShelterMismatchRow,
} from "@/lib/types";
import { fetchAnalysesClient } from "@/lib/data-client";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import {
  DashboardFilterBar,
  FilterImpactStrip,
  useFilteredUniverse,
} from "@/components/DashboardFilterBar";
import { filtersActive } from "@/lib/dashboard-filters";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";

type InsightView =
  | "hubs"
  | "shelters"
  | "coverage"
  | "corridors"
  | "needlines"
  | "slum"
  | "walkkm";

function fmt(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return digits > 0 ? n.toFixed(digits) : n.toLocaleString();
}

function BandChip({ label, tone }: { label: string; tone: string }) {
  const styles: Record<string, string> = {
    weak: "border-[var(--danger)] bg-[rgba(251,113,133,0.12)] text-[var(--danger)]",
    high: "border-[var(--danger)] bg-[rgba(251,113,133,0.12)] text-[var(--danger)]",
    high_gap: "border-[var(--danger)] bg-[rgba(251,113,133,0.12)] text-[var(--danger)]",
    moderate: "border-[var(--amber)] bg-[rgba(232,168,32,0.12)] text-[var(--amber)]",
    moderate_gap: "border-[var(--amber)] bg-[rgba(232,168,32,0.12)] text-[var(--amber)]",
    strong: "border-[var(--teal)] bg-[rgba(45,212,191,0.12)] text-[var(--teal)]",
    low_gap: "border-[var(--teal)] bg-[rgba(45,212,191,0.12)] text-[var(--teal)]",
  };
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[tone] ?? styles.moderate}`}
    >
      {label}
    </span>
  );
}

function ScoreBar({ value, max = 100, color = "var(--accent)" }: { value: number; max?: number; color?: string }) {
  const pct = Math.max(2, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function InsightsPanel() {
  const [data, setData] = useState<AdvancedAnalyses | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<InsightView>("hubs");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useDashboardFilters({ unit: "ward" });
  const {
    filtered,
    wardOptions,
    zoneOptions,
    cityMeanGap,
  } = useFilteredUniverse(filters);
  const filteredWardSet = useMemo(
    () =>
      new Set(
        filtered.filter((u) => u.unit_type === "ward").map((u) => String(u.label))
      ),
    [filtered]
  );
  const wardFilterOn = filtersActive(filters);
  const [selectedHub, setSelectedHub] = useState<string | null>(null);
  const [selectedMismatch, setSelectedMismatch] = useState<string | null>(null);
  const [selectedCoverage, setSelectedCoverage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const analyses = await fetchAnalysesClient();
      if (!cancelled) {
        setData(analyses);
        setLoading(false);
        const firstHub = analyses?.hub_last_mile?.priority_hubs?.[0]?.label;
        const firstMm = analyses?.shelter_mismatch?.priority_wards?.[0];
        const firstCov = analyses?.catchment_coverage?.priority_wards?.[0]?.label;
        if (firstHub) setSelectedHub(firstHub);
        if (firstMm) setSelectedMismatch(`${firstMm.unit_type}:${firstMm.label}`);
        if (firstCov) setSelectedCoverage(firstCov);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hubs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data?.hub_last_mile?.hubs ?? [];
    const coreFirst = [...list].sort((a, b) => {
      const ac = a.in_chennai_core ? 0 : 1;
      const bc = b.in_chennai_core ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return b.last_mile_score - a.last_mile_score;
    });
    if (!q) return coreFirst;
    return coreFirst.filter(
      (h) =>
        h.label.toLowerCase().includes(q) ||
        h.hub_type.toLowerCase().includes(q) ||
        h.last_mile_band.includes(q)
    );
  }, [data, query]);

  const mismatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [
      ...(data?.shelter_mismatch?.wards ?? []),
      ...(data?.shelter_mismatch?.zones ?? []),
    ].sort((a, b) => b.mismatch_score - a.mismatch_score);
    if (wardFilterOn) {
      list = list.filter(
        (r) => r.unit_type !== "ward" || filteredWardSet.has(String(r.label))
      );
    }
    if (!q) return list;
    return list.filter(
      (r) => r.label.toLowerCase().includes(q) || r.unit_type.includes(q)
    );
  }, [data, query, wardFilterOn, filteredWardSet]);

  const coverage = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = [...(data?.catchment_coverage?.wards ?? [])].sort(
      (a, b) => (b.pct_area_outside_400m ?? -1) - (a.pct_area_outside_400m ?? -1)
    );
    if (wardFilterOn) {
      list = list.filter((r) => filteredWardSet.has(String(r.label)));
    }
    if (!q) return list;
    return list.filter(
      (r) => r.label.toLowerCase().includes(q) || r.coverage_band.includes(q)
    );
  }, [data, query, wardFilterOn, filteredWardSet]);

  const slumWards = useMemo(() => {
    const list = [...(data?.sec_proxy?.wards ?? [])].sort(
      (a, b) => (b.pct_slum_area ?? 0) - (a.pct_slum_area ?? 0)
    );
    if (!wardFilterOn) return list;
    return list.filter((w) => filteredWardSet.has(String(w.label)));
  }, [data, wardFilterOn, filteredWardSet]);

  const hubDetail: HubLastMileRow | null =
    hubs.find((h) => h.label === selectedHub) ?? hubs[0] ?? null;
  const mismatchDetail: ShelterMismatchRow | null =
    mismatches.find((m) => `${m.unit_type}:${m.label}` === selectedMismatch) ??
    mismatches[0] ??
    null;
  const coverageDetail: CatchmentCoverageRow | null =
    coverage.find((c) => c.label === selectedCoverage) ?? coverage[0] ?? null;

  const insightTabs = useMemo(
    () =>
      (
        [
          ["hubs", "Hub last-mile", data?.hub_last_mile?.status === "loaded"],
          ["shelters", "Shelter mismatch", data?.shelter_mismatch?.status === "loaded"],
          ["coverage", "Catchment coverage", data?.catchment_coverage?.status === "loaded"],
          [
            "corridors",
            "OMR / South",
            data?.metro_corridors?.status === "loaded" ||
              data?.metro_extension?.status === "loaded",
          ],
          ["needlines", "Need lines", data?.connectivity_need?.status === "loaded"],
          ["slum", "Slum vs non-slum", data?.sec_proxy?.status === "loaded"],
          ["walkkm", "Isochrones", data?.walk_isochrones?.status === "partial" || data?.walk_isochrones?.status === "loaded"],
        ] as const
      ).filter((row) => row[2]) as [InsightView, string, boolean][],
    [data]
  );

  useEffect(() => {
    if (!insightTabs.length) return;
    if (!insightTabs.some(([id]) => id === view)) {
      setView(insightTabs[0][0]);
    }
  }, [insightTabs, view]);

  if (loading) {
    return <p className="text-sm text-[var(--ink-muted)]">Loading advanced analyses…</p>;
  }

  if (!data) {
    return (
      <div className="et-card p-6">
        <StatusBadge status="unavailable" />
        <p className="mt-3 text-[var(--ink-muted)]">
          analyses.json not found. Run the ETL pipeline to generate hub last-mile, shelter
          mismatch, and catchment coverage.
        </p>
      </div>
    );
  }

  const hlm = data.hub_last_mile;
  const smm = data.shelter_mismatch;
  const cov = data.catchment_coverage;

  return (
    <div className="space-y-6">
      <div className="et-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]">
              Insights
            </h3>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">{data.note}</p>
          </div>
          {insightTabs.length ? (
            <label className="block text-xs">
              <span className="mb-1 block text-[var(--ink-muted)]">Module</span>
              <select
                className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-sm text-[var(--ink)]"
                value={view}
                onChange={(e) => setView(e.target.value as typeof view)}
              >
                {insightTabs.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm text-[var(--ink-muted)]">No loaded insight modules yet.</p>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Weak last-mile hubs"
          value={hlm.counts?.weak_hubs_chennai_core ?? hlm.counts?.weak_hubs}
          subtext="Chennai-core hubs · score ≥ 55"
        />
        <MetricCard
          label="Shelter mismatch wards"
          value={smm.counts?.mismatch_wards}
          subtext={`${smm.counts?.zero_shelter_wards ?? "—"} with stops but zero shelters`}
        />
        <MetricCard
          label="High catchment-gap wards"
          value={cov.counts?.high_gap_wards}
          subtext="≥60% of ward area outside 400m stop buffer"
        />
        <MetricCard
          label="City mean outside 400m"
          value={
            cov.city_mean_pct_outside_400m != null
              ? `${cov.city_mean_pct_outside_400m}%`
              : null
          }
          subtext="Geometry only — not population-weighted"
          unavailableReason="Catchment coverage not generated"
        />
      </div>

      <DashboardFilterBar
        filters={filters}
        onChange={setFilters}
        wardOptions={wardOptions}
        zoneOptions={zoneOptions}
        resultCount={filteredWardSet.size}
        compact
      />
      <FilterImpactStrip units={filtered} cityMeanGap={cityMeanGap} />

      <label className="block text-sm">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
          Quick search (hubs / lists)
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hub, ward, zone…"
          className="w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--ink)]"
        />
      </label>

      {view === "hubs" ? (
        <section className="space-y-4">
          <div className="et-card p-4 text-sm text-[var(--ink-muted)]">
            {hlm.note}
          </div>
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <ul className="max-h-[640px] space-y-2 overflow-y-auto pr-1">
              {(hlm.priority_hubs.length ? hlm.priority_hubs : hubs.slice(0, 40)).map((h) => (
                <li key={h.label}>
                  <button
                    type="button"
                    onClick={() => setSelectedHub(h.label)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left ${
                      selectedHub === h.label
                        ? "border-[var(--yellow)] bg-[rgba(255,229,102,0.1)]"
                        : "border-[var(--border)] bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[var(--ink)]">{h.label}</p>
                        <p className="text-xs text-[var(--ink-muted)]">{h.hub_type}</p>
                      </div>
                      <span className="font-semibold text-[var(--yellow)]">{h.last_mile_score}</span>
                    </div>
                    <div className="mt-2">
                      <ScoreBar value={h.last_mile_score} color="var(--hub)" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {hubDetail ? (
              <article className="et-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--yellow)]">
                      Hub last-mile
                    </p>
                    <h4 className="mt-1 text-2xl font-semibold text-[var(--yellow-bright)]">
                      {hubDetail.label}
                    </h4>
                    <p className="mt-1 text-sm text-[var(--ink-muted)]">{hubDetail.hub_type}</p>
                  </div>
                  <BandChip label={hubDetail.last_mile_band} tone={hubDetail.last_mile_band} />
                </div>
                <p className="mt-4 font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--yellow)]">
                  {hubDetail.last_mile_score}
                  <span className="ml-2 text-sm font-normal text-[var(--ink-muted)]">
                    / 100 last-mile gap
                  </span>
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
                    <p className="text-[10px] uppercase text-[var(--ink-muted)]">Nearest stop</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--yellow)]">
                      {fmt(hubDetail.nearest_stop_m, 0)} m
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
                    <p className="text-[10px] uppercase text-[var(--ink-muted)]">Stops ≤300m</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--yellow)]">
                      {hubDetail.stops_within_300m}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
                    <p className="text-[10px] uppercase text-[var(--ink-muted)]">Stops ≤500m</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--yellow)]">
                      {hubDetail.stops_within_500m}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
                    <p className="text-[10px] uppercase text-[var(--ink-muted)]">Shelters ≤300m</p>
                    <p className="mt-1 text-xl font-semibold text-[var(--yellow)]">
                      {fmt(hubDetail.shelters_within_300m)}
                    </p>
                  </div>
                </div>
                <p className="mt-5 text-sm leading-relaxed text-[var(--ink-muted)]">
                  {hubDetail.recommendation}
                </p>
                {hubDetail.lon != null && hubDetail.lat != null ? (
                  <a
                    className="mt-4 inline-flex text-sm font-semibold text-[var(--accent)]"
                    href={`/map?audience=traffic`}
                  >
                    Open network map →
                  </a>
                ) : null}
              </article>
            ) : null}
          </div>
          <div className="overflow-x-auto et-card">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                <tr>
                  <th className="px-4 py-3">Hub</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Nearest</th>
                  <th className="px-4 py-3">≤300m</th>
                  <th className="px-4 py-3">≤500m</th>
                  <th className="px-4 py-3">Core</th>
                </tr>
              </thead>
              <tbody>
                {hubs.slice(0, 60).map((h) => (
                  <tr
                    key={`tbl-${h.label}`}
                    className="cursor-pointer border-b border-[var(--border)] hover:bg-white/[0.03]"
                    onClick={() => setSelectedHub(h.label)}
                  >
                    <td className="px-4 py-2.5 font-medium text-[var(--ink)]">{h.label}</td>
                    <td className="px-4 py-2.5 text-[var(--yellow)]">{h.last_mile_score}</td>
                    <td className="px-4 py-2.5 text-[var(--ink-muted)]">
                      {fmt(h.nearest_stop_m, 0)} m
                    </td>
                    <td className="px-4 py-2.5">{h.stops_within_300m}</td>
                    <td className="px-4 py-2.5">{h.stops_within_500m}</td>
                    <td className="px-4 py-2.5 text-[var(--ink-muted)]">
                      {h.in_chennai_core ? "Yes" : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {view === "shelters" ? (
        <section className="space-y-4">
          <div className="et-card p-4 text-sm text-[var(--ink-muted)]">{smm.note}</div>
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <ul className="max-h-[640px] space-y-2 overflow-y-auto pr-1">
              {mismatches.slice(0, 80).map((m) => (
                <li key={`${m.unit_type}-${m.label}`}>
                  <button
                    type="button"
                    onClick={() => setSelectedMismatch(`${m.unit_type}:${m.label}`)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left ${
                      selectedMismatch === `${m.unit_type}:${m.label}`
                        ? "border-[var(--yellow)] bg-[rgba(255,229,102,0.1)]"
                        : "border-[var(--border)] bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="text-[10px] uppercase text-[var(--ink-muted)]">
                          {m.unit_type}
                        </p>
                        <p className="font-semibold text-[var(--ink)]">{m.label}</p>
                      </div>
                      <span className="font-semibold text-[var(--yellow)]">{m.mismatch_score}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--ink-muted)]">
                      {m.stop_count} stops · {m.shelter_count} shelters · ratio{" "}
                      {m.shelter_to_stop_ratio}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
            {mismatchDetail ? (
              <article className="et-card p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--yellow)]">
                  Shelter–stop mismatch
                </p>
                <h4 className="mt-1 text-2xl font-semibold text-[var(--yellow-bright)]">
                  {mismatchDetail.label}
                </h4>
                <p className="mt-4 font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--yellow)]">
                  {mismatchDetail.mismatch_score}
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
                    <p className="text-[10px] uppercase text-[var(--ink-muted)]">Stops</p>
                    <p className="text-xl font-semibold text-[var(--yellow)]">
                      {mismatchDetail.stop_count}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
                    <p className="text-[10px] uppercase text-[var(--ink-muted)]">Shelters</p>
                    <p className="text-xl font-semibold text-[var(--yellow)]">
                      {mismatchDetail.shelter_count}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
                    <p className="text-[10px] uppercase text-[var(--ink-muted)]">Ratio</p>
                    <p className="text-xl font-semibold text-[var(--yellow)]">
                      {mismatchDetail.shelter_to_stop_ratio}
                    </p>
                  </div>
                </div>
                <p className="mt-5 text-sm text-[var(--ink-muted)]">
                  {mismatchDetail.recommendation}
                </p>
              </article>
            ) : null}
          </div>
        </section>
      ) : null}

      {view === "coverage" ? (
        <section className="space-y-4">
          <div className="et-card p-4 text-sm text-[var(--ink-muted)]">{cov.note}</div>
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <ul className="max-h-[640px] space-y-2 overflow-y-auto pr-1">
              {coverage.slice(0, 80).map((c) => (
                <li key={c.label}>
                  <button
                    type="button"
                    onClick={() => setSelectedCoverage(c.label)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left ${
                      selectedCoverage === c.label
                        ? "border-[var(--yellow)] bg-[rgba(255,229,102,0.1)]"
                        : "border-[var(--border)] bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex justify-between gap-2">
                      <p className="font-semibold text-[var(--ink)]">Ward {c.label}</p>
                      <span className="font-semibold text-[var(--yellow)]">
                        {fmt(c.pct_area_outside_400m, 1)}%
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--ink-muted)]">
                      outside 400m · {fmt(c.pct_area_within_400m, 1)}% inside
                    </p>
                    <div className="mt-2">
                      <ScoreBar
                        value={c.pct_area_outside_400m ?? 0}
                        color="var(--danger)"
                      />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {coverageDetail ? (
              <article className="et-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--yellow)]">
                      Catchment coverage
                    </p>
                    <h4 className="mt-1 text-2xl font-semibold text-[var(--yellow-bright)]">
                      Ward {coverageDetail.label}
                    </h4>
                  </div>
                  <BandChip
                    label={coverageDetail.coverage_band.replaceAll("_", " ")}
                    tone={coverageDetail.coverage_band}
                  />
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
                    <p className="text-[10px] uppercase text-[var(--ink-muted)]">Outside 400m</p>
                    <p className="text-xl font-semibold text-[var(--yellow)]">
                      {fmt(coverageDetail.pct_area_outside_400m, 1)}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
                    <p className="text-[10px] uppercase text-[var(--ink-muted)]">Inside 400m</p>
                    <p className="text-xl font-semibold text-[var(--yellow)]">
                      {fmt(coverageDetail.pct_area_within_400m, 1)}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
                    <p className="text-[10px] uppercase text-[var(--ink-muted)]">Inside 800m</p>
                    <p className="text-xl font-semibold text-[var(--yellow)]">
                      {fmt(coverageDetail.pct_area_within_800m, 1)}%
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
                    <p className="text-[10px] uppercase text-[var(--ink-muted)]">Area</p>
                    <p className="text-xl font-semibold text-[var(--yellow)]">
                      {fmt(coverageDetail.area_km2, 2)} km²
                    </p>
                  </div>
                </div>
                <p className="mt-5 text-sm text-[var(--ink-muted)]">
                  {coverageDetail.recommendation}
                </p>
              </article>
            ) : null}
          </div>
        </section>
      ) : null}

      {view === "corridors" ? (
        <section className="space-y-4">
          <div className="et-card p-4 text-sm text-[var(--ink-muted)]">
            {data.metro_corridors?.note ??
              "Extended metro corridors beyond GCC wards."}
          </div>
          {!data.metro_corridors?.areas?.length ? (
            <div className="et-card p-5 text-sm text-[var(--ink-muted)]">
              Corridor inventory unavailable. Run the metro extension ETL.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.metro_corridors.areas.map((area) => (
                <article key={area.id} className="et-card p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                    {area.kind.replaceAll("_", " ")}
                  </p>
                  <h4 className="mt-1 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--yellow-bright)]">
                    {area.label}
                  </h4>
                  {area.note ? (
                    <p className="mt-2 text-xs text-[var(--ink-muted)]">{area.note}</p>
                  ) : null}
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-2 text-center">
                      <p className="text-[10px] uppercase text-[var(--ink-muted)]">Stops</p>
                      <p className="text-lg font-semibold text-[var(--yellow)]">
                        {area.stop_count}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-2 text-center">
                      <p className="text-[10px] uppercase text-[var(--ink-muted)]">Shelters</p>
                      <p className="text-lg font-semibold text-[var(--yellow)]">
                        {area.shelter_count}
                      </p>
                    </div>
                    <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-2 text-center">
                      <p className="text-[10px] uppercase text-[var(--ink-muted)]">Hubs</p>
                      <p className="text-lg font-semibold text-[var(--yellow)]">
                        {area.hub_count}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          <a
            href="/map"
            className="inline-flex text-sm font-semibold text-[var(--accent)]"
          >
            Open map with OMR / South preset →
          </a>
        </section>
      ) : null}

      {view === "needlines" ? (
        <section className="space-y-4">
          <div className="et-card p-4 text-sm text-[var(--ink-muted)]">
            {data.connectivity_need?.note ??
              "Need lines = OSM roads (and a few feeder desire lines) with long stretches outside 400m of a GTFS stop, focused on high Gap Index wards. Urgent / Priority / Watch = unmet length bands — places mid-block stops or feeders may help."}
          </div>
          {!data.connectivity_need?.corridors?.length ? (
            <div className="et-card p-5 text-sm text-[var(--ink-muted)]">
              Connectivity-need roads unavailable. Run the ETL connectivity step.
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <MetricCard
                  label="Corridors mapped"
                  value={data.connectivity_need.counts?.corridors_mapped}
                  subtext="Top unmet OSM roads"
                />
                <MetricCard
                  label="Urgent"
                  value={data.connectivity_need.counts?.urgent}
                  subtext="Highest unmet length"
                />
                <MetricCard
                  label="High-gap wards used"
                  value={data.connectivity_need.counts?.high_gap_wards}
                  subtext="Severe / high Gap Index"
                />
              </div>
              <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Road</th>
                      <th className="px-3 py-2">Band</th>
                      <th className="px-3 py-2">Outside 400m</th>
                      <th className="px-3 py-2">Unmet m</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.connectivity_need.corridors.slice(0, 25).map((c) => (
                      <tr key={`${c.rank}-${c.road_name}`} className="border-t border-[var(--border)]">
                        <td className="px-3 py-2 text-[var(--ink-muted)]">{c.rank}</td>
                        <td className="px-3 py-2 font-medium text-[var(--ink)]">
                          {c.road_name}
                          <span className="mt-0.5 block text-[10px] font-normal text-[var(--ink-muted)]">
                            {c.highway}
                            {c.in_high_gap_ward ? " · high-gap ward" : ""}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <BandChip label={c.need_band} tone={c.need_band === "urgent" ? "weak" : c.need_band === "priority" ? "moderate" : "strong"} />
                        </td>
                        <td className="px-3 py-2 text-[var(--yellow)]">{fmt(c.pct_outside_400m, 0)}%</td>
                        <td className="px-3 py-2">{fmt(Math.round(c.unmet_length_m))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <a
            href="/map"
            className="inline-flex text-sm font-semibold text-[var(--accent)]"
          >
            Open map with Need lines preset →
          </a>
        </section>
      ) : null}

      {view === "slum" ? (
        <section className="space-y-4">
          <div className="et-card border-[rgba(251,113,133,0.35)] p-4 text-sm text-[var(--ink-muted)]">
            Slum vs non-slum from OpenCity slum polygon intersection with GCC wards. Share of
            ward area in slum polygons — not household income.
          </div>
          {!data.sec_proxy?.wards?.length ? (
            <div className="et-card p-5 text-sm text-[var(--ink-muted)]">
              Slum join unavailable. Place OpenCity slum KML under{" "}
              <code>data/raw/census_sec/</code> and run{" "}
              <code>etl/build_sec_proxy.py</code>.
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  label="Slum wards"
                  value={data.sec_proxy.counts?.wards_with_slum}
                  subtext="Intersect OpenCity slum polygons"
                />
                <MetricCard
                  label="Non-slum wards"
                  value={
                    data.sec_proxy.wards.filter((w) => !w.has_slum).length
                  }
                  subtext="No slum polygon intersection"
                />
                <MetricCard
                  label="High slum share"
                  value={
                    data.sec_proxy.wards.filter((w) => (w.pct_slum_area ?? 0) >= 10).length
                  }
                  subtext="≥10% of ward area"
                />
                <MetricCard
                  label="In current filter"
                  value={slumWards.length}
                  subtext="Respects dashboard filters"
                />
              </div>
              <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">
                    <tr>
                      <th className="px-3 py-2">Ward</th>
                      <th className="px-3 py-2">Slum vs non-slum</th>
                      <th className="px-3 py-2">Slum %</th>
                      <th className="px-3 py-2">Band</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(wardFilterOn
                      ? slumWards
                      : [...data.sec_proxy.wards].sort(
                          (a, b) => (b.pct_slum_area ?? 0) - (a.pct_slum_area ?? 0)
                        )
                    )
                      .slice(0, 40)
                      .map((w) => (
                        <tr key={w.label} className="border-t border-[var(--border)]">
                          <td className="px-3 py-2 font-semibold text-[var(--ink)]">{w.label}</td>
                          <td className="px-3 py-2">
                            <BandChip
                              label={w.has_slum ? "slum" : "non-slum"}
                              tone={w.has_slum ? "high" : "strong"}
                            />
                          </td>
                          <td className="px-3 py-2 text-[var(--yellow)]">
                            {fmt(w.pct_slum_area, 1)}%
                          </td>
                          <td className="px-3 py-2 text-[var(--ink-muted)]">
                            {w.slum_band ?? "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <a
            href="/map"
            className="inline-flex text-sm font-semibold text-[var(--accent)]"
          >
            Open map with Slum preset →
          </a>
        </section>
      ) : null}

      {view === "walkkm" ? (
        <section className="space-y-4">
          <div className="et-card border-[rgba(45,212,191,0.35)] p-4 text-sm text-[var(--ink-muted)]">
            {data.walk_isochrones?.note ??
              "OSM network walk isochrones: ≤5 / 5–10 / 10–15 min from GTFS stops and hubs at 80 m/min. Partial — not crow-flies."}
          </div>
          {!data.walk_isochrones ||
          (data.walk_isochrones.status !== "loaded" &&
            data.walk_isochrones.status !== "partial") ? (
            <div className="et-card p-5 text-sm text-[var(--ink-muted)]">
              Walk isochrones unavailable. Run{" "}
              <code>etl/build_walk_isochrones.py</code> after stops are loaded.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="≤5 min"
                value={
                  data.walk_isochrones.counts?.within_5min_km2 != null
                    ? `${fmt(data.walk_isochrones.counts.within_5min_km2, 1)} km²`
                    : null
                }
                subtext={`${fmt(data.walk_isochrones.counts?.pct_within_5min, 1)}% of study · teal`}
              />
              <MetricCard
                label="5–10 min"
                value={
                  data.walk_isochrones.counts?.band_5_10min_km2 != null
                    ? `${fmt(data.walk_isochrones.counts.band_5_10min_km2, 1)} km²`
                    : null
                }
                subtext={`${fmt(data.walk_isochrones.counts?.pct_band_5_10min, 1)}% · amber`}
              />
              <MetricCard
                label="10–15 min"
                value={
                  data.walk_isochrones.counts?.band_10_15min_km2 != null
                    ? `${fmt(data.walk_isochrones.counts.band_10_15min_km2, 1)} km²`
                    : null
                }
                subtext={`${fmt(data.walk_isochrones.counts?.pct_band_10_15min, 1)}% · orange`}
              />
              <MetricCard
                label="Study area"
                value={
                  data.walk_isochrones.counts?.study_area_km2 != null
                    ? `${fmt(data.walk_isochrones.counts.study_area_km2, 1)} km²`
                    : null
                }
                subtext="GCC + OMR south"
              />
            </div>
          )}
          <a
            href="/map"
            className="inline-flex text-sm font-semibold text-[var(--accent)]"
          >
            Open map with Isochrones preset →
          </a>
        </section>
      ) : null}
    </div>
  );
}
