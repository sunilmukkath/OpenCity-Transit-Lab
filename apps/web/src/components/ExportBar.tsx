"use client";

import type { Manifest, Metrics } from "@/lib/types";
import { layerIsReady } from "@/lib/types";

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportBar({
  manifest,
  metrics,
  wardRows,
}: {
  manifest: Manifest | null;
  metrics: Metrics | null;
  wardRows?: { ward_label: string; stop_count?: number; shelter_count?: number }[];
}) {
  const exportMetricsCsv = () => {
    if (!metrics?.counts || !Object.keys(metrics.counts).length) return;
    const lines = ["metric,value", ...Object.entries(metrics.counts).map(([k, v]) => `${k},${v}`)];
    downloadBlob("chennai_verified_metrics.csv", lines.join("\n"), "text/csv");
  };

  const exportWardsCsv = () => {
    if (!wardRows?.length) return;
    const lines = [
      "ward_label,stop_count,shelter_count",
      ...wardRows.map(
        (r) =>
          `"${r.ward_label.replaceAll('"', '""')}",${r.stop_count ?? ""},${r.shelter_count ?? ""}`
      ),
    ];
    downloadBlob("chennai_ward_stop_counts.csv", lines.join("\n"), "text/csv");
  };

  const exportManifest = () => {
    if (!manifest) return;
    downloadBlob(
      "chennai_data_manifest.json",
      JSON.stringify(manifest, null, 2),
      "application/json"
    );
  };

  const geoLinks = Object.entries(manifest?.layers ?? {})
    .filter(([, layer]) => layerIsReady(layer) && layer.file)
    .map(([key, layer]) => ({ key, file: layer.file! }));

  return (
    <div className="no-print flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <span className="mr-2 text-sm font-semibold text-[var(--ink-muted)]">Export</span>
      <button
        type="button"
        onClick={exportMetricsCsv}
        disabled={!metrics?.counts || !Object.keys(metrics.counts).length}
        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--ink)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:opacity-40"
      >
        Metrics CSV
      </button>
      <button
        type="button"
        onClick={exportWardsCsv}
        disabled={!wardRows?.length}
        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--ink)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:opacity-40"
      >
        Ward counts CSV
      </button>
      <button
        type="button"
        onClick={exportManifest}
        disabled={!manifest}
        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--ink)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:opacity-40"
      >
        Manifest JSON
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--ink)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
      >
        Print brief
      </button>
      {geoLinks.map((g) => (
        <a
          key={g.key}
          href={`/data/${g.file}`}
          download
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--ink)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
        >
          {g.key} GeoJSON
        </a>
      ))}
    </div>
  );
}
