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
import { SectionEyebrow } from "@/components/BrandMotif";

type InsightView = "hubs" | "shelters" | "coverage";

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
    const list = [
      ...(data?.shelter_mismatch?.wards ?? []),
      ...(data?.shelter_mismatch?.zones ?? []),
    ].sort((a, b) => b.mismatch_score - a.mismatch_score);
    if (!q) return list;
    return list.filter(
      (r) => r.label.toLowerCase().includes(q) || r.unit_type.includes(q)
    );
  }, [data, query]);

  const coverage = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...(data?.catchment_coverage?.wards ?? [])].sort(
      (a, b) => (b.pct_area_outside_400m ?? -1) - (a.pct_area_outside_400m ?? -1)
    );
    if (!q) return list;
    return list.filter(
      (r) => r.label.toLowerCase().includes(q) || r.coverage_band.includes(q)
    );
  }, [data, query]);

  const hubDetail: HubLastMileRow | null =
    hubs.find((h) => h.label === selectedHub) ?? hubs[0] ?? null;
  const mismatchDetail: ShelterMismatchRow | null =
    mismatches.find((m) => `${m.unit_type}:${m.label}` === selectedMismatch) ??
    mismatches[0] ??
    null;
  const coverageDetail: CatchmentCoverageRow | null =
    coverage.find((c) => c.label === selectedCoverage) ?? coverage[0] ?? null;

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
        <SectionEyebrow>Unique insights</SectionEyebrow>
        <h3 className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]">
          Last-mile, shelter gaps &amp; walk coverage
        </h3>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">{data.note}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["hubs", "Hub last-mile"],
              ["shelters", "Shelter mismatch"],
              ["coverage", "Catchment coverage"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
                view === id
                  ? "border-[var(--yellow)] bg-[rgba(255,229,102,0.12)] text-[var(--yellow)]"
                  : "border-[var(--border)] text-[var(--ink-muted)]"
              }`}
            >
              {label}
            </button>
          ))}
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

      <label className="block text-sm">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
          Search
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
    </div>
  );
}
