"use client";

import { Suspense, useEffect, useState } from "react";
import { MapExplorerClient } from "@/components/MapExplorerClient";
import { StatusBadge } from "@/components/StatusBadge";
import { fetchAnalysesClient } from "@/lib/data-client";
import type { AdvancedAnalyses } from "@/lib/types";

export function LastMilePage() {
  const [analyses, setAnalyses] = useState<AdvancedAnalyses | null>(null);

  useEffect(() => {
    let c = false;
    fetchAnalysesClient().then((a) => {
      if (!c) setAnalyses(a);
    });
    return () => {
      c = true;
    };
  }, []);

  const hubs = analyses?.hub_last_mile?.priority_hubs?.slice(0, 12) ?? [];
  const need = analyses?.connectivity_need?.corridors?.slice(0, 8) ?? [];
  const walk = analyses?.walk_distance_bands;
  const walkCounts = walk?.counts;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          Last-mile connectivity
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--ink-muted)]">
          Advanced analysis of hub feeders, walk-distance bands, and roads far from stops —
          plus the map for the same layers.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] uppercase text-[var(--ink-muted)]">Weak hubs</p>
          <p className="mt-1 text-2xl text-[var(--yellow)]">
            {analyses?.hub_last_mile?.counts?.weak_hubs ?? hubs.length}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] uppercase text-[var(--ink-muted)]">Within 100m</p>
          <p className="mt-1 text-2xl text-[var(--ink)]">
            {walkCounts?.pct_within_100m != null
              ? `${walkCounts.pct_within_100m}%`
              : "—"}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">of study area (crow-flies)</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] uppercase text-[var(--ink-muted)]">Need corridors</p>
          <p className="mt-1 text-2xl text-[var(--ink)]">
            {analyses?.connectivity_need?.counts?.corridors_mapped ?? need.length}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Weak last-mile hubs
            </h2>
            <StatusBadge status={analyses?.hub_last_mile?.status ?? "unavailable"} />
          </div>
          <ul className="max-h-[320px] space-y-2 overflow-auto text-sm">
            {hubs.map((h) => (
              <li
                key={String(h.id ?? h.label)}
                className="flex justify-between gap-2 border-t border-[var(--border)] pt-2"
              >
                <span className="font-medium text-[var(--ink)]">{h.label}</span>
                <span className="shrink-0 text-[var(--ink-muted)]">
                  {h.nearest_stop_m != null ? `${Math.round(h.nearest_stop_m)}m` : "—"} ·{" "}
                  {h.last_mile_score}
                </span>
              </li>
            ))}
            {!hubs.length ? (
              <li className="text-[var(--ink-muted)]">Hub last-mile table not loaded.</li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Need-line corridors
            </h2>
            <StatusBadge status={analyses?.connectivity_need?.status ?? "unavailable"} />
          </div>
          <ul className="max-h-[320px] space-y-2 overflow-auto text-sm">
            {need.map((c) => (
              <li
                key={`${c.rank}-${c.road_name}`}
                className="border-t border-[var(--border)] pt-2 text-[var(--ink-muted)]"
              >
                <span className="font-medium text-[var(--ink)]">{c.road_name}</span>
                {c.need_band ? ` · ${c.need_band}` : ""}
                {c.unmet_length_m != null
                  ? ` · ~${Math.round(c.unmet_length_m)}m unmet`
                  : ""}
              </li>
            ))}
            {!need.length ? (
              <li className="text-[var(--ink-muted)]">Connectivity need not summarised.</li>
            ) : null}
          </ul>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
          Map
        </h2>
        <Suspense
          fallback={
            <div className="flex h-[520px] items-center justify-center rounded-xl border border-[var(--border)] text-sm text-[var(--ink-muted)]">
              Loading map…
            </div>
          }
        >
          <MapExplorerClient
            initialPreset="hubs"
            audience="hubs"
            audienceNote="Last-mile view — hubs, stops, and walk bands."
          />
        </Suspense>
      </section>
    </div>
  );
}
