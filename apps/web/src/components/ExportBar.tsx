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

function ExportButton({
  onClick,
  disabled,
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-[var(--border)] bg-white/[0.03] px-3 py-2 text-left text-sm text-[var(--ink)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function ExportLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      download
      className="rounded-md border border-[var(--border)] bg-white/[0.03] px-3 py-2 text-left text-sm text-[var(--ink)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
    >
      {children}
    </a>
  );
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
    const lines = [
      "metric,value",
      ...Object.entries(metrics.counts).map(([k, v]) => `${k},${v}`),
    ];
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
    <section className="no-print mt-10 border-t border-[var(--border)] pt-8">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--yellow)]">
              Export
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
              Download verified layers
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Only datasets that loaded successfully are listed. Unavailable metrics are not
              invented for export.
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              Tables
            </h3>
            <div className="grid gap-2">
              <ExportButton
                onClick={exportMetricsCsv}
                disabled={!metrics?.counts || !Object.keys(metrics.counts).length}
              >
                Metrics CSV
              </ExportButton>
              <ExportButton onClick={exportWardsCsv} disabled={!wardRows?.length}>
                Ward counts CSV
              </ExportButton>
              <ExportButton onClick={exportManifest} disabled={!manifest}>
                Data manifest JSON
              </ExportButton>
              <ExportLink href="/data/reports.json">Ward / zone reports JSON</ExportLink>
              <ExportLink href="/data/analyses.json">Advanced analyses JSON</ExportLink>
            </div>
          </div>

          <div className="md:col-span-2">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              Map layers (GeoJSON)
            </h3>
            {geoLinks.length ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {geoLinks.map((g) => (
                  <ExportLink key={g.key} href={`/data/${g.file}`}>
                    {g.key}
                  </ExportLink>
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 text-sm text-[var(--ink-muted)]">
                No GeoJSON layers available yet.
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
          <p className="text-xs text-[var(--ink-muted)]">
            For meetings: print or save as PDF from your browser.
          </p>
          <ExportButton onClick={() => window.print()}>Print / PDF</ExportButton>
        </div>
      </div>
    </section>
  );
}
