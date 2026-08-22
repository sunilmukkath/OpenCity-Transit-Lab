"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { MapExplorerClient } from "@/components/MapExplorerClient";
import { StatusBadge } from "@/components/StatusBadge";
import { fetchJson } from "@/lib/data-client";

type CoverageAssessment = {
  status?: string;
  note?: string;
  generated_at?: string;
  study_area?: {
    description?: string;
    study_area_km2?: number;
    gcc_wards?: number;
  };
  kpis?: Record<string, number | null | undefined>;
  blocks?: Record<
    string,
    {
      status?: string;
      note?: string;
      limitation?: string;
      counts?: Record<string, unknown>;
      delta_pct_within_5min?: number | null;
      scenarios?: Record<string, { pct_within_5min?: number | null; pct_within_15min?: number | null }>;
      proposed_stations?: number;
      chennai_district_electors_total?: number;
      map_electors_total?: number;
      grain?: string;
      as_of?: string;
      reason_not_ward?: string;
      city_mean_pct_outside_400m?: number | null;
      summary?: string;
    }
  >;
  sources?: { name: string; portal?: string; status?: string }[];
  next_steps_for_authorities?: string[];
};

type Beyond10Meta = {
  status?: string;
  note?: string;
  limitation?: string;
  counts?: {
    study_area_km2?: number;
    within_10min_km2?: number;
    beyond_10min_km2?: number;
    pct_study_beyond_10min?: number;
    gcc_wards_high_beyond_10min?: number;
  };
  high_beyond_10min_wards?: {
    ward_label?: string;
    mean_walk_min?: number | null;
    pct_samples_beyond_10min?: number | null;
    gap_band?: string;
  }[];
  files?: { geojson?: string; wards_csv?: string; isochrones?: string };
};

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <p className="text-[10px] uppercase text-[var(--ink-muted)]">{label}</p>
      <p className="mt-1 text-2xl text-[var(--yellow)]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--ink-muted)]">{hint}</p> : null}
    </div>
  );
}

function fmt(v: number | null | undefined, suffix = ""): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v}${suffix}`;
}

function DlLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      download
      className="inline-flex rounded-md border border-[var(--border)] bg-white/[0.03] px-3 py-2 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
    >
      {children}
    </a>
  );
}

export function CoveragePage() {
  const [data, setData] = useState<CoverageAssessment | null>(null);
  const [beyond, setBeyond] = useState<Beyond10Meta | null>(null);

  useEffect(() => {
    let c = false;
    Promise.all([
      fetchJson<CoverageAssessment>("/data/coverage_assessment.json"),
      fetchJson<Beyond10Meta>("/data/walk_beyond_10min_meta.json"),
    ]).then(([cov, b10]) => {
      if (!c) {
        setData(cov);
        setBeyond(b10);
      }
    });
    return () => {
      c = true;
    };
  }, []);

  const k = data?.kpis ?? {};
  const cmrl = data?.blocks?.cmrl_phase2_scenario;
  const outside = data?.blocks?.outside_gcc_osm;
  const sir = data?.blocks?.sir_electors;
  const highWards = beyond?.high_beyond_10min_wards ?? [];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
          For authorities / partners
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          Coverage assessment
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">
          {data?.note ??
            "Unified walk coverage, outside-GCC roads, and CMRL Phase II Red Line scenario."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={data?.status ?? "unavailable"} />
          {data?.study_area?.description ? (
            <p className="text-xs text-[var(--ink-muted)]">{data.study_area.description}</p>
          ) : null}
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Study area ≤5 min walk (existing)"
          value={fmt(k.pct_study_within_5min_walk_existing, "%")}
          hint={
            data?.study_area?.study_area_km2
              ? `Study polygon ≈ ${data.study_area.study_area_km2} km²`
              : "OSM network isochrones"
          }
        />
        <Kpi
          label="≤5 min walk + Red Line C5"
          value={fmt(k.pct_study_within_5min_walk_plus_c5, "%")}
          hint={
            k.delta_pct_5min_with_c5 != null
              ? `Δ ${k.delta_pct_5min_with_c5 > 0 ? "+" : ""}${k.delta_pct_5min_with_c5} pp (Partial stations)`
              : "Scenario pending"
          }
        />
        <Kpi
          label="Outside-GCC unmet roads shown"
          value={fmt(k.outside_gcc_unmet_km_shown, " km")}
          hint={`${fmt(k.outside_gcc_road_km, " km")} major OSM road outside GCC`}
        />
        <Kpi
          label="High catchment-gap wards"
          value={fmt(k.high_catchment_gap_wards)}
          hint={`City mean outside 400m: ${fmt(k.city_mean_pct_outside_400m_wards, "%")}`}
        />
      </div>

      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Areas beyond a 10-minute walk
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-[var(--ink-muted)]">
              {beyond?.note ??
                "Study area outside ≤10 min OSM network walk to nearest GTFS stop/hub (Partial)."}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge status={beyond?.status ?? "unavailable"} />
              {beyond?.counts?.beyond_10min_km2 != null ? (
                <span className="text-xs text-[var(--ink-muted)]">
                  ≈ {beyond.counts.beyond_10min_km2} km² beyond 10 min (
                  {fmt(beyond.counts.pct_study_beyond_10min, "%")} of study polygon)
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <DlLink href="/data/walk_beyond_10min.geojson">Download map (GeoJSON)</DlLink>
            <DlLink href="/data/walk_beyond_10min_wards.csv">Download ward list (CSV)</DlLink>
            <DlLink href="/data/walk_isochrones.geojson">Download 5/10/15 min bands</DlLink>
          </div>
        </div>

        {highWards.length ? (
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[rgba(10,31,74,0.7)] text-[10px] uppercase text-[var(--ink-muted)]">
                <tr>
                  <th className="px-3 py-2">Ward</th>
                  <th className="px-3 py-2">Mean walk</th>
                  <th className="px-3 py-2">Samples &gt;10 min</th>
                  <th className="px-3 py-2">Gap</th>
                </tr>
              </thead>
              <tbody>
                {highWards.map((w) => (
                  <tr key={String(w.ward_label)} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 text-[var(--yellow)]">{w.ward_label}</td>
                    <td className="px-3 py-2">{fmt(w.mean_walk_min, " min")}</td>
                    <td className="px-3 py-2">{fmt(w.pct_samples_beyond_10min, "%")}</td>
                    <td className="px-3 py-2 capitalize text-[var(--ink-muted)]">
                      {w.gap_band ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="text-xs text-[var(--ink-muted)]">
          {beyond?.limitation ??
            "Large share of beyond-10-min land is OMR / south corridor and vacant or water — not only dense neighbourhoods. Ward list uses sample grids, not population."}
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            CMRL Phase II — Red Line (Corridor 5)
          </h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge status={cmrl?.status ?? "unavailable"} />
            {cmrl?.proposed_stations != null ? (
              <span className="text-xs text-[var(--ink-muted)]">
                {cmrl.proposed_stations} curated proposed stations
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">{cmrl?.note}</p>
          <div className="mt-4 overflow-hidden rounded-xl border border-[var(--border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[rgba(10,31,74,0.7)] text-[10px] uppercase text-[var(--ink-muted)]">
                <tr>
                  <th className="px-3 py-2">Scenario</th>
                  <th className="px-3 py-2">≤5 min</th>
                  <th className="px-3 py-2">≤15 min</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">Existing stops / hubs</td>
                  <td className="px-3 py-2 text-[var(--yellow)]">
                    {fmt(cmrl?.scenarios?.existing?.pct_within_5min, "%")}
                  </td>
                  <td className="px-3 py-2">
                    {fmt(cmrl?.scenarios?.existing?.pct_within_15min, "%")}
                  </td>
                </tr>
                <tr className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">Existing + Red Line C5</td>
                  <td className="px-3 py-2 text-[var(--yellow)]">
                    {fmt(cmrl?.scenarios?.existing_plus_c5?.pct_within_5min, "%")}
                  </td>
                  <td className="px-3 py-2">
                    {fmt(cmrl?.scenarios?.existing_plus_c5?.pct_within_15min, "%")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {cmrl?.limitation ? (
            <p className="mt-3 text-xs text-[var(--ink-muted)]">{cmrl.limitation}</p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Outside GCC — OSM street gaps
          </h2>
          <div className="mt-2">
            <StatusBadge status={outside?.status ?? "unavailable"} />
          </div>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">{outside?.note}</p>
          <ul className="mt-3 space-y-1 text-sm text-[var(--ink-muted)]">
            <li>
              Outside-GCC major road length:{" "}
              <strong className="text-[var(--ink)]">
                {fmt(
                  (outside?.counts as { outside_gcc_road_km?: number } | undefined)
                    ?.outside_gcc_road_km,
                  " km"
                )}
              </strong>
            </li>
            <li>
              Top unmet segments shown:{" "}
              <strong className="text-[var(--ink)]">
                {fmt(
                  (outside?.counts as { top_unmet_km_shown?: number } | undefined)
                    ?.top_unmet_km_shown,
                  " km"
                )}
              </strong>{" "}
              (&gt;400 m from a GTFS stop)
            </li>
          </ul>
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-sm">
            <p className="text-[10px] font-semibold uppercase text-[var(--accent)]">
              SIR electors (proxy)
            </p>
            <p className="mt-1 text-[var(--ink-muted)]">{sir?.note}</p>
            <p className="mt-2 text-[var(--ink)]">
              Chennai district ACs: {fmt(sir?.chennai_district_electors_total)} electors
              {sir?.as_of ? ` · as of ${sir.as_of}` : ""}
            </p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">{sir?.reason_not_ward}</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
          Map — coverage context
        </h2>
        <p className="text-xs text-[var(--ink-muted)]">
          Toggle <strong>CMRL C5</strong>, <strong>Outside GCC roads</strong>, Settlements, and
          Isochrones in Layers. Red Line stations are Partial (curated).
        </p>
        <Suspense
          fallback={
            <div className="flex h-[520px] items-center justify-center rounded-xl border border-[var(--border)] text-sm text-[var(--ink-muted)]">
              Loading map…
            </div>
          }
        >
          <MapExplorerClient
            initialPreset="coverage"
            audience="planner"
            audienceNote="Authority coverage — isochrones, outside-GCC roads, proposed Red Line."
          />
        </Suspense>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 sm:p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Data sources
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {(data?.sources ?? []).map((s) => (
            <li
              key={s.name}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-[var(--ink)]">{s.name}</p>
                {s.status ? <StatusBadge status={s.status} /> : null}
              </div>
              {s.portal ? (
                <a
                  href={s.portal}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs font-semibold text-[var(--accent)] hover:underline"
                >
                  Open source →
                </a>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="text-xs text-[var(--ink-muted)]">
          Full catalog on{" "}
          <Link href="/sources" className="font-semibold text-[var(--accent)] hover:underline">
            Sources
          </Link>
          .
        </p>

        {data?.next_steps_for_authorities?.length ? (
          <div className="border-t border-[var(--border)] pt-4">
            <h3 className="text-sm font-semibold text-[var(--ink)]">Suggested next steps</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--ink-muted)]">
              {data.next_steps_for_authorities.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}
