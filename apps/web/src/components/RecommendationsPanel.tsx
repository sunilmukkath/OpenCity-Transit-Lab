"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import {
  DashboardFilterBar,
  FilterImpactStrip,
  useFilteredUniverse,
} from "@/components/DashboardFilterBar";
import { useDashboardFilters } from "@/hooks/useDashboardFilters";
import type { ObjectivesAnalysis } from "@/lib/objectives-types";
import { fetchJson } from "@/lib/data-client";

const PRIORITY_TONE: Record<string, string> = {
  critical: "border-[var(--danger)] bg-[rgba(251,113,133,0.1)]",
  high: "border-[rgba(249,115,22,0.5)] bg-[rgba(249,115,22,0.08)]",
  medium: "border-[var(--yellow)] bg-[rgba(255,229,102,0.08)]",
  info: "border-[var(--border)] bg-white/[0.03]",
};

export function RecommendationsPanel() {
  const [data, setData] = useState<ObjectivesAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useDashboardFilters({
    unit: "ward",
    gapBand: "severe",
  });
  const {
    loading: loadingFilters,
    filtered,
    wardOptions,
    zoneOptions,
    cityMeanGap,
  } = useFilteredUniverse(filters);

  const priorityWards = useMemo(
    () =>
      [...filtered]
        .filter((u) => u.unit_type === "ward")
        .sort((a, b) => (b.gap_index ?? 0) - (a.gap_index ?? 0))
        .slice(0, 12),
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
    return <p className="text-sm text-[var(--ink-muted)]">Loading recommendations…</p>;
  }
  if (!data) {
    return (
      <p className="text-sm text-[var(--danger)]">
        objectives_analysis.json missing. Run{" "}
        <code>etl/build_objectives_analysis.py</code>.
      </p>
    );
  }

  const loaded = data.objectives.filter((o) => o.status === "loaded" || o.status === "partial");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          Actions
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">
          Prioritised moves from Objectives evidence ({loaded.length} with data).
        </p>
      </header>

      <DashboardFilterBar
        filters={filters}
        onChange={setFilters}
        wardOptions={wardOptions}
        zoneOptions={zoneOptions}
        resultCount={priorityWards.length}
      />
      {!loadingFilters ? (
        <FilterImpactStrip units={filtered} cityMeanGap={cityMeanGap} />
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--yellow)]">
            Filtered priority wards
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
            Where the slice points first
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">
              <tr>
                <th className="px-3 py-2">Ward</th>
                <th className="px-3 py-2">Gap</th>
                <th className="px-3 py-2">PT</th>
                <th className="px-3 py-2">Slum</th>
                <th className="px-3 py-2">EC est.</th>
              </tr>
            </thead>
            <tbody>
              {priorityWards.map((w) => (
                <tr key={w.label} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-medium text-[var(--ink)]">{w.label}</td>
                  <td className="px-3 py-2 text-[var(--yellow)]">{w.gap_index ?? "—"}</td>
                  <td className="px-3 py-2">{w.pt_index ?? "—"}</td>
                  <td className="px-3 py-2 text-[var(--ink-muted)]">
                    {w.has_slum
                      ? w.pct_slum_area != null
                        ? `Slum ${w.pct_slum_area.toFixed(1)}%`
                        : "Slum"
                      : "Non-slum"}
                  </td>
                  <td className="px-3 py-2">{w.establishments?.toLocaleString() ?? "—"}</td>
                </tr>
              ))}
              {!priorityWards.length ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-[var(--ink-muted)]">
                    No wards match — loosen filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]">
          Priority actions
        </h2>
        {data.recommendations.map((rec) => (
          <article
            key={`${rec.priority}-${rec.title}`}
            className={`rounded-xl border p-4 ${PRIORITY_TONE[rec.priority] ?? PRIORITY_TONE.info}`}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                {rec.priority}
              </span>
              <StatusBadge
                status={
                  rec.priority === "info"
                    ? "unavailable"
                    : rec.priority === "critical"
                      ? "partial"
                      : "loaded"
                }
              />
            </div>
            <h3 className="font-semibold text-[var(--ink)]">{rec.title}</h3>
            <p className="mt-1.5 text-sm text-[var(--ink-muted)]">{rec.detail}</p>
            {rec.map_href ? (
              <Link
                href={rec.map_href}
                className="mt-3 inline-flex text-sm font-semibold text-[var(--accent)]"
              >
                Open related view →
              </Link>
            ) : null}
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Key insights (from loaded evidence)
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--ink-muted)]">
          {data.objectives
            .filter((o) => o.status === "loaded" || o.status === "partial")
            .map((o) => (
              <li key={o.id}>
                <strong className="text-[var(--ink)]">{o.title}:</strong>{" "}
                {o.summary ?? "See objective charts for metrics."}
              </li>
            ))}
        </ul>
      </section>

      {data.objectives.some((o) => o.status === "partial") ? (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Partial coverage notes
          </h2>
          <ul className="mt-3 space-y-3">
            {data.objectives
              .filter((o) => o.status === "partial")
              .map((o) => (
                <li key={`partial-${o.id}`} className="text-sm text-[var(--ink-muted)]">
                  <div className="flex items-center gap-2">
                    <StatusBadge status="partial" />
                    <strong className="text-[var(--ink)]">{o.title}</strong>
                  </div>
                  <p className="mt-1">{o.summary ?? o.reason}</p>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
