"use client";

import { Suspense, useEffect, useState } from "react";
import { MapExplorerClient } from "@/components/MapExplorerClient";
import { StatusBadge } from "@/components/StatusBadge";
import { DualPctChart } from "@/components/SimpleBarChart";
import { fetchJson } from "@/lib/data-client";
import type { ObjectivesAnalysis } from "@/lib/objectives-types";

export function DestinationsPage() {
  const [obj, setObj] = useState<ObjectivesAnalysis | null>(null);

  useEffect(() => {
    let c = false;
    fetchJson<ObjectivesAnalysis>("/data/objectives_analysis.json").then((d) => {
      if (!c) setObj(d);
    });
    return () => {
      c = true;
    };
  }, []);

  const block = obj?.objectives?.find((o) => o.id === "destinations_access");
  const metrics = Object.entries(block?.metrics ?? {});

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          Hospitals and schools
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--ink-muted)]">
          Schools and UPHCs coloured by OSM network walk minutes to the nearest GTFS stop or hub
          (same ≤5 / 5–10 / 10–15 min bands as city isochrones). Crow-flies ≤100 m remains the
          inventory proximity metric.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={block?.status ?? "unavailable"} />
        {block?.summary ? (
          <p className="text-sm text-[var(--ink-muted)]">{block.summary}</p>
        ) : null}
      </div>

      {metrics.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
            >
              <p className="text-[10px] uppercase text-[var(--ink-muted)]">
                {label.replaceAll("_", " ")}
              </p>
              <p className="mt-1 text-2xl text-[var(--yellow)]">
                {value != null ? String(value) : "—"}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {block?.chart?.length ? (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-lg font-semibold">
            Access share
          </h2>
          <DualPctChart items={block.chart} />
          {block.limitations?.length ? (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-[var(--ink-muted)]">
              {block.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : (
        <p className="text-sm text-[var(--ink-muted)]">
          Destinations objective not loaded. Run the ETL objectives builder.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
          Map — schools &amp; healthcare
        </h2>
        <Suspense
          fallback={
            <div className="flex h-[520px] items-center justify-center rounded-xl border border-[var(--border)] text-sm text-[var(--ink-muted)]">
              Loading map…
            </div>
          }
        >
          <MapExplorerClient
            initialPreset="destinations"
            audience="citizen"
            audienceNote="Schools and healthcare coloured by OSM walk minutes to nearest PT."
          />
        </Suspense>
      </section>
    </div>
  );
}
