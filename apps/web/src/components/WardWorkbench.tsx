"use client";

import { useEffect, useMemo, useState } from "react";
import type { FeatureCollection } from "geojson";
import { ExportBar } from "@/components/ExportBar";
import { StatusBadge } from "@/components/StatusBadge";
import type { Manifest, Metrics } from "@/lib/types";

type WardRow = {
  ward_label: string;
  stop_count?: number;
  shelter_count?: number;
};

export function WardWorkbench({
  manifest,
  metrics,
}: {
  manifest: Manifest | null;
  metrics: Metrics | null;
}) {
  const [wards, setWards] = useState<WardRow[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "unavailable">(
    "loading"
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const layer = manifest?.layers.wards;
      if (!layer || layer.status !== "loaded" || !layer.file) {
        setLoadState("unavailable");
        return;
      }
      try {
        const res = await fetch(`/data/${layer.file}`);
        if (!res.ok) throw new Error("fetch failed");
        const fc = (await res.json()) as FeatureCollection;
        const rows: WardRow[] = fc.features.map((f) => ({
          ward_label: String(f.properties?.ward_label ?? "Unknown"),
          stop_count:
            f.properties?.stop_count === undefined || f.properties?.stop_count === null
              ? undefined
              : Number(f.properties.stop_count),
          shelter_count:
            f.properties?.shelter_count === undefined ||
            f.properties?.shelter_count === null ||
            f.properties?.shelter_count === "None"
              ? undefined
              : Number(f.properties.shelter_count),
        }));
        rows.sort((a, b) => a.ward_label.localeCompare(b.ward_label));
        if (!cancelled) {
          setWards(rows);
          setSelected(rows[0]?.ward_label ?? "");
          setLoadState("ready");
        }
      } catch {
        if (!cancelled) setLoadState("unavailable");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [manifest]);

  const current = useMemo(
    () => wards.find((w) => w.ward_label === selected),
    [wards, selected]
  );

  const recommendations = useMemo(() => {
    if (!current) return [];
    const recs: string[] = [];
    if (current.stop_count === 0) {
      recs.push(
        "No GTFS stops fall inside this ward polygon. Verify community GTFS completeness before concluding service absence; field-check with MTC stop lists."
      );
    } else if (current.stop_count !== undefined && current.stop_count < 5) {
      recs.push(
        "Low stop count inside ward boundary — candidate for feeder / stop spacing review near nearest metro or MRTS hub (Helsinki-style hub access)."
      );
    }
    if (current.shelter_count === 0) {
      recs.push(
        "No mapped bus shelters in this ward. Shelter map is presence-only; confirm with field audit before capital works."
      );
    } else if (current.shelter_count === undefined) {
      recs.push("Shelter counts unavailable for this ward — shelter layer not joined.");
    }
    if (!recs.length) {
      recs.push(
        "Inventory looks non-empty from loaded layers. Use the map catchments to inspect 400m/800m walk access; do not treat this as an equity score."
      );
    }
    return recs;
  }, [current]);

  if (loadState === "unavailable") {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <StatusBadge status="unavailable" />
        <p className="mt-3 text-[var(--ink-muted)]">
          Ward layer not loaded. Run the ETL and open Data Sources for details.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ExportBar manifest={manifest} metrics={metrics} wardRows={wards} />

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Select ward
          </label>
          <select
            className="mt-2 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {wards.map((w) => (
              <option key={w.ward_label} value={w.ward_label}>
                {w.ward_label}
              </option>
            ))}
          </select>
          <p className="mt-3 text-xs text-[var(--ink-muted)]">
            {wards.length} wards from GCC 2022 geometry
          </p>
        </aside>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          {loadState === "loading" || !current ? (
            <p className="text-sm text-[var(--ink-muted)]">Loading wards…</p>
          ) : (
            <>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
                {current.ward_label}
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Printable local-body brief · verified attributes only
              </p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs uppercase text-[var(--ink-muted)]">
                    GTFS stops in ward
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold">
                    {current.stop_count === undefined ? (
                      <span className="text-[var(--ink-muted)]">Unavailable</span>
                    ) : (
                      current.stop_count
                    )}
                  </dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs uppercase text-[var(--ink-muted)]">
                    Mapped bus shelters
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold">
                    {current.shelter_count === undefined ? (
                      <span className="text-[var(--ink-muted)]">Unavailable</span>
                    ) : (
                      current.shelter_count
                    )}
                  </dd>
                </div>
              </dl>

              <div className="mt-6">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                  Suggested next checks
                </h3>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-sm">
                  {recommendations.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>

              <p className="mt-6 text-xs text-[var(--ink-muted)]">
                Recommendations are rule-based prompts from loaded inventories — not ranked
                investment scores. Equity scoring remains withheld.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
