"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { MetricCard } from "@/components/MetricCard";
import { SectionEyebrow } from "@/components/BrandMotif";
import { DualPctChart, SimpleBarChart } from "@/components/SimpleBarChart";
import {
  DashboardFilterBar,
  FilterImpactStrip,
  useFilteredUniverse,
} from "@/components/DashboardFilterBar";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";
import type { ObjectiveBlock, ObjectivesAnalysis } from "@/lib/objectives-types";
import { fetchJson } from "@/lib/data-client";

function ObjectiveCard({ obj }: { obj: ObjectiveBlock }) {
  return (
    <article
      id={obj.id}
      className="scroll-mt-24 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionEyebrow>Objective</SectionEyebrow>
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]">
            {obj.title}
          </h2>
        </div>
        <StatusBadge status={obj.status} />
      </div>

      {obj.summary ? (
        <p className="text-sm text-[var(--ink-muted)]">{obj.summary}</p>
      ) : null}
      {obj.reason ? (
        <p className="rounded-lg border border-[rgba(251,113,133,0.35)] bg-[rgba(251,113,133,0.08)] p-3 text-sm text-[var(--ink-muted)]">
          {obj.reason}
          {obj.needed ? (
            <span className="mt-1 block text-[var(--ink)]">
              <strong>Needed:</strong> {obj.needed}
            </span>
          ) : null}
        </p>
      ) : null}

      {obj.metrics && Object.keys(obj.metrics).length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(obj.metrics)
            .filter(([, v]) => v !== null && v !== undefined)
            .slice(0, 8)
            .map(([k, v]) => {
              let display: number | string | null = v as number | null;
              if (typeof v === "number" && !Number.isInteger(v)) {
                display = Number(v.toFixed(1));
              }
              return (
                <MetricCard key={k} label={k.replace(/_/g, " ")} value={display} />
              );
            })}
        </div>
      ) : null}

      {obj.id === "destinations_access" && obj.chart?.length ? (
        <DualPctChart items={obj.chart} />
      ) : obj.chart && obj.chart.length && obj.id === "first_last_mile" ? (
        <SimpleBarChart
          items={obj.chart.map((c) => ({
            label: c.label,
            count: c.km2,
            color: c.color,
          }))}
          formatValue={(n) => `${n} km²`}
        />
      ) : obj.chart && obj.chart.length && obj.id === "equal_access" ? (
        <SimpleBarChart
          items={obj.chart.map((c) => ({
            label: `${c.band} (n=${c.ward_count})`,
            count: c.mean_pt_index,
            color:
              c.band === "slum"
                ? "#e11d48"
                : c.band === "non_slum"
                  ? "#64748b"
                  : String(c.band).startsWith("EC:")
                    ? "#38bdf8"
                    : "#eab308",
          }))}
          maxValue={100}
          formatValue={(n) => `mean PT index ${n}`}
        />
      ) : obj.chart && obj.chart.length ? (
        <SimpleBarChart
          items={obj.chart.map((c) => ({
            label: c.label ?? c.band ?? c.destination ?? "—",
            count: c.count ?? c.rows ?? c.ward_count ?? 0,
            color: c.color ?? "var(--accent)",
          }))}
        />
      ) : null}

      {obj.weak_hubs?.length ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">
              <tr>
                <th className="px-3 py-2">Hub</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Last-mile score</th>
                <th className="px-3 py-2">Nearest stop m</th>
              </tr>
            </thead>
            <tbody>
              {obj.weak_hubs.slice(0, 12).map((h) => (
                <tr key={`${h.label}-${h.hub_type}`} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-medium text-[var(--ink)]">{h.label}</td>
                  <td className="px-3 py-2 text-[var(--ink-muted)]">{h.hub_type}</td>
                  <td className="px-3 py-2 text-[var(--yellow)]">{h.last_mile_score}</td>
                  <td className="px-3 py-2">{h.nearest_stop_m != null ? Math.round(h.nearest_stop_m) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {obj.need_lines?.top_corridors?.length ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Need lines · urgent {obj.need_lines.urgent ?? "—"} · priority{" "}
            {obj.need_lines.priority ?? "—"}
          </p>
          <ul className="space-y-1 text-sm text-[var(--ink-muted)]">
            {obj.need_lines.top_corridors.slice(0, 8).map((c, i) => (
              <li key={`${c.road_name}-${i}`}>
                <span className="font-medium text-[var(--ink)]">{c.road_name}</span> ·{" "}
                {c.need_band}
                {c.unmet_length_m != null ? ` · ${Math.round(c.unmet_length_m)} m unmet` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {obj.underserved_examples?.length ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">
              <tr>
                <th className="px-3 py-2">Ward</th>
                <th className="px-3 py-2">PT index</th>
                <th className="px-3 py-2">Slum vs non-slum</th>
                <th className="px-3 py-2">Slum %</th>
              </tr>
            </thead>
            <tbody>
              {obj.underserved_examples.map((w) => (
                <tr key={w.label} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-medium text-[var(--ink)]">{w.label}</td>
                  <td className="px-3 py-2 text-[var(--yellow)]">{w.pt_index}</td>
                  <td className="px-3 py-2">
                    {w.pct_slum_area != null && w.pct_slum_area > 0 ? "Slum" : "Non-slum"}
                  </td>
                  <td className="px-3 py-2">
                    {w.pct_slum_area != null ? `${Number(w.pct_slum_area).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {obj.insights?.length ? (
        <ul className="space-y-3">
          {obj.insights.map((ins) => (
            <li
              key={ins.theme}
              className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3 text-sm"
            >
              <p className="font-semibold text-[var(--ink)]">{ins.theme}</p>
              <p className="mt-1 text-[var(--ink-muted)]">{ins.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {obj.corridors_mentioned?.length ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            CMP corridors named
          </p>
          <div className="flex flex-wrap gap-1.5">
            {obj.corridors_mentioned.map((c) => (
              <span
                key={c}
                className="rounded-full border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--ink)]"
              >
                {c}
              </span>
            ))}
          </div>
          {obj.pt_measures_mentioned?.length ? (
            <p className="mt-3 text-sm text-[var(--ink-muted)]">
              <span className="font-semibold text-[var(--ink)]">PT measures cited:</span>{" "}
              {obj.pt_measures_mentioned.join(" · ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {obj.economic_census?.high_activity_low_pt?.length ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <p className="border-b border-[var(--border)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            High Economic Census activity · weak PT index
          </p>
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">
              <tr>
                <th className="px-3 py-2">Ward</th>
                <th className="px-3 py-2">Establishments</th>
                <th className="px-3 py-2">Workers</th>
                <th className="px-3 py-2">PT index</th>
              </tr>
            </thead>
            <tbody>
              {obj.economic_census.high_activity_low_pt.slice(0, 12).map((w) => (
                <tr key={w.ward_label} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-medium text-[var(--ink)]">{w.ward_label}</td>
                  <td className="px-3 py-2">{w.establishments?.toLocaleString() ?? "—"}</td>
                  <td className="px-3 py-2">{w.total_workers?.toLocaleString() ?? "—"}</td>
                  <td className="px-3 py-2 text-[var(--yellow)]">{w.pt_index ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {obj.partial_tables?.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {obj.partial_tables.map((t) => (
            <div
              key={t.name}
              className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3 text-sm"
            >
              <p className="font-semibold text-[var(--ink)]">{t.name}</p>
              <p className="mt-1 text-[var(--ink-muted)]">
                {t.rows?.toLocaleString() ?? "—"} rows
                {t.file ? ` · ${t.file}` : ""}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {obj.lowest_wards?.length ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">
              <tr>
                <th className="px-3 py-2">Ward</th>
                <th className="px-3 py-2">PT index</th>
                <th className="px-3 py-2">Gap index</th>
                <th className="px-3 py-2">Stops</th>
              </tr>
            </thead>
            <tbody>
              {obj.lowest_wards.slice(0, 12).map((w) => (
                <tr key={w.label} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-medium text-[var(--ink)]">{w.label}</td>
                  <td className="px-3 py-2 text-[var(--yellow)]">{w.pt_index}</td>
                  <td className="px-3 py-2">{w.gap_index}</td>
                  <td className="px-3 py-2">{w.stop_count ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {obj.limitations?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-muted)]">
          {obj.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}

      <Link
        href={obj.id === "destinations_access" ? "/map" : "/map"}
        className="inline-flex text-sm font-semibold text-[var(--accent)]"
      >
        {obj.id === "destinations_access"
          ? "Open map · Destinations preset (schools / health ≤100m gaps) →"
          : "Open map →"}
      </Link>
    </article>
  );
}

export function ObjectivesDashboard() {
  const [data, setData] = useState<ObjectivesAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useDashboardFilters({ unit: "ward" });
  const {
    loading: loadingFilters,
    filtered,
    wardOptions,
    zoneOptions,
    cityMeanGap,
  } = useFilteredUniverse(filters);

  const filteredUnits = useMemo(
    () =>
      [...filtered].sort((a, b) => (b.gap_index ?? 0) - (a.gap_index ?? 0)),
    [filtered]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const json = await fetchJson<ObjectivesAnalysis>("/data/objectives_analysis.json");
      if (!cancelled) {
        setData(json);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-[var(--ink-muted)]">Loading objectives analysis…</p>;
  }
  if (!data) {
    return (
      <p className="text-sm text-[var(--danger)]">
        objectives_analysis.json missing. Run{" "}
        <code>etl/build_objectives_analysis.py</code>.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)] sm:text-4xl">
          Objectives
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">{data.note}</p>
        <p className="mt-2 text-xs text-[var(--ink-muted)]">
          Generated {new Date(data.generated_at).toLocaleString()}
        </p>
      </header>

      <DashboardFilterBar
        filters={filters}
        onChange={setFilters}
        wardOptions={wardOptions}
        zoneOptions={zoneOptions}
        resultCount={filteredUnits.length}
      />
      {!loadingFilters ? (
        <FilterImpactStrip units={filtered} cityMeanGap={cityMeanGap} />
      ) : (
        <p className="text-sm text-[var(--ink-muted)]">Loading filter universe…</p>
      )}

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--yellow)]">
              Filtered table
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
              Wards and zones matching the current slice
            </h2>
          </div>
          <Link href="/analytics?tab=spatial" className="text-sm font-semibold text-[var(--accent)]">
            Open full ward / zone brief →
          </Link>
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[rgba(10,31,74,0.96)] text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Gap</th>
                <th className="px-3 py-2">PT</th>
                <th className="px-3 py-2">Slum</th>
                <th className="px-3 py-2">EC est.</th>
                <th className="px-3 py-2">Stops</th>
              </tr>
            </thead>
            <tbody>
              {filteredUnits.slice(0, 80).map((w) => (
                <tr key={`${w.unit_type}:${w.label}`} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 text-[var(--ink-muted)]">
                    {w.unit_type === "zone" ? "Zone" : "Ward"}
                  </td>
                  <td className="px-3 py-2 font-medium text-[var(--ink)]">{w.label}</td>
                  <td className="px-3 py-2 text-[var(--yellow)]">{w.gap_index ?? "—"}</td>
                  <td className="px-3 py-2">{w.pt_index ?? "—"}</td>
                  <td className="px-3 py-2 text-[var(--ink-muted)]">
                    {w.unit_type !== "ward"
                      ? "—"
                      : w.has_slum
                        ? w.pct_slum_area != null
                          ? `Slum ${w.pct_slum_area.toFixed(1)}%`
                          : "Slum"
                        : "Non-slum"}
                  </td>
                  <td className="px-3 py-2">{w.establishments?.toLocaleString() ?? "—"}</td>
                  <td className="px-3 py-2">{w.stop_count ?? "—"}</td>
                </tr>
              ))}
              {!filteredUnits.length ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[var(--ink-muted)]">
                    No areas match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {data.objectives
        .filter((o) => o.status === "loaded" || o.status === "partial")
        .map((obj) => (
          <ObjectiveCard key={obj.id} obj={obj} />
        ))}
    </div>
  );
}
