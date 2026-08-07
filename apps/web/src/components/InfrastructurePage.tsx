"use client";

import { Suspense, useEffect, useState } from "react";
import { MapExplorerClient } from "@/components/MapExplorerClient";
import { StatusBadge } from "@/components/StatusBadge";
import { fetchAnalysesClient } from "@/lib/data-client";
import type { AdvancedAnalyses } from "@/lib/types";

export function InfrastructurePage() {
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

  const smm = analyses?.shelter_mismatch;
  const wards = smm?.priority_wards?.slice(0, 40) ?? [];
  const zones = smm?.priority_zones?.slice(0, 16) ?? [];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          Infrastructure — stops vs shelters
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--ink-muted)]">
          Where GTFS stops are present but the shelter map shows few or none. Presence-only
          inventory — not boarding demand.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={smm?.status ?? "unavailable"} />
        {smm?.note ? <p className="text-sm text-[var(--ink-muted)]">{smm.note}</p> : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] uppercase text-[var(--ink-muted)]">Mismatch wards</p>
          <p className="mt-1 text-2xl text-[var(--yellow)]">
            {smm?.counts?.mismatch_wards ?? wards.length}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] uppercase text-[var(--ink-muted)]">Zero-shelter wards</p>
          <p className="mt-1 text-2xl text-[var(--ink)]">
            {smm?.counts?.zero_shelter_wards ?? "—"}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] uppercase text-[var(--ink-muted)]">Mismatch zones</p>
          <p className="mt-1 text-2xl text-[var(--ink)]">
            {smm?.counts?.mismatch_zones ?? zones.length}
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Priority wards — stops without shelters
          </h2>
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[rgba(10,31,74,0.96)] text-[10px] uppercase text-[var(--ink-muted)]">
              <tr>
                <th className="px-3 py-2">Ward</th>
                <th className="px-3 py-2">Stops</th>
                <th className="px-3 py-2">Shelters</th>
                <th className="px-3 py-2">Ratio</th>
                <th className="px-3 py-2">Score</th>
              </tr>
            </thead>
            <tbody>
              {wards.map((w) => (
                <tr key={String(w.id ?? w.label)} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-medium text-[var(--ink)]">{w.label}</td>
                  <td className="px-3 py-2">{w.stop_count}</td>
                  <td className="px-3 py-2">{w.shelter_count}</td>
                  <td className="px-3 py-2 text-[var(--ink-muted)]">
                    {w.shelter_to_stop_ratio != null
                      ? w.shelter_to_stop_ratio.toFixed(2)
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-[var(--yellow)]">{w.mismatch_score}</td>
                </tr>
              ))}
              {!wards.length ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-[var(--ink-muted)]">
                    Shelter mismatch table not loaded.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
          Map — stop inventory
        </h2>
        <Suspense
          fallback={
            <div className="flex h-[520px] items-center justify-center rounded-xl border border-[var(--border)] text-sm text-[var(--ink-muted)]">
              Loading map…
            </div>
          }
        >
          <MapExplorerClient
            initialPreset="serve"
            audience="planner"
            audienceNote="Infrastructure view — stops and gap wards. Shelter points load via layer toggles when available."
          />
        </Suspense>
      </section>
    </div>
  );
}
