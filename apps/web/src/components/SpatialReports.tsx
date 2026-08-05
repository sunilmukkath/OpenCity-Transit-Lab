"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  GapBand,
  GapComponents,
  SpatialReports as SpatialReportsData,
  SpatialUnitReport,
  UnitRecommendation,
} from "@/lib/types";
import { fetchReportsClient } from "@/lib/data-client";
import { StatusBadge } from "@/components/StatusBadge";
import { MetricCard } from "@/components/MetricCard";

type UnitFilter = "all" | "ward" | "zone";
type SortKey = "gap" | "stops" | "density" | "name";

const PRIORITY_STYLE: Record<string, string> = {
  critical: "border-[var(--danger)] bg-[rgba(251,113,133,0.12)] text-[var(--danger)]",
  high: "border-[var(--hub)] bg-[rgba(251,146,60,0.12)] text-[var(--hub)]",
  medium: "border-[var(--amber)] bg-[rgba(232,168,32,0.12)] text-[var(--amber)]",
  info: "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]",
};

const BAND_STYLE: Record<string, string> = {
  severe: "border-[var(--danger)] bg-[rgba(251,113,133,0.14)] text-[var(--danger)]",
  high: "border-[var(--hub)] bg-[rgba(251,146,60,0.14)] text-[var(--hub)]",
  moderate: "border-[var(--amber)] bg-[rgba(232,168,32,0.14)] text-[var(--amber)]",
  low: "border-[var(--teal)] bg-[rgba(45,212,191,0.12)] text-[var(--teal)]",
};

const COMPONENT_META: {
  key: keyof GapComponents;
  label: string;
  max: number;
}[] = [
  { key: "stop_gap", label: "Stop access", max: 40 },
  { key: "shelter_gap", label: "Shelter coverage", max: 30 },
  { key: "hub_gap", label: "Hub / last-mile", max: 20 },
  { key: "density_gap", label: "Stop density", max: 10 },
];

function PriorityChip({ priority }: { priority: string }) {
  const style = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.info;
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}
    >
      {priority}
    </span>
  );
}

function GapBandChip({ band }: { band: string }) {
  const style = BAND_STYLE[band] ?? BAND_STYLE.moderate;
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}
    >
      {band} gap
    </span>
  );
}

function gapValue(unit: SpatialUnitReport): number {
  return unit.gap_index ?? unit.priority_score ?? 0;
}

function gapBand(unit: SpatialUnitReport): string {
  return unit.gap_band ?? "moderate";
}

function fmt(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return digits > 0 ? n.toFixed(digits) : n.toLocaleString();
}

function GapMeter({ value, band }: { value: number; band: string }) {
  const color =
    band === "severe"
      ? "var(--danger)"
      : band === "high"
        ? "var(--hub)"
        : band === "moderate"
          ? "var(--amber)"
          : "var(--teal)";
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Gap Index
          </p>
          <p className="font-[family-name:var(--font-display)] text-4xl font-semibold text-[var(--yellow)]">
            {value}
          </p>
        </div>
        <GapBandChip band={band} />
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, Math.max(2, value))}%`, background: color }}
        />
      </div>
      <p className="text-xs text-[var(--ink-muted)]">0 = low inventory gap · 100 = severe</p>
    </div>
  );
}

function GapComponentsBreakdown({
  components,
}: {
  components?: GapComponents | null;
}) {
  if (!components) {
    return (
      <p className="text-sm text-[var(--ink-muted)]">Gap components unavailable for this unit.</p>
    );
  }
  return (
    <div className="space-y-3">
      {COMPONENT_META.map((c) => {
        const value = components[c.key] ?? 0;
        const pct = Math.round((value / c.max) * 100);
        return (
          <div key={c.key} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-[var(--ink)]">{c.label}</span>
              <span className="font-semibold text-[var(--yellow)]">
                {value}
                <span className="font-normal text-[var(--ink-muted)]">/{c.max}</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.max(value > 0 ? 4 : 0, pct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecommendationList({ items }: { items: UnitRecommendation[] }) {
  if (!items.length) {
    return <p className="text-sm text-[var(--ink-muted)]">No recommendations for this unit.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((rec, idx) => (
        <li
          key={`${rec.title}-${idx}`}
          className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3"
        >
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <PriorityChip priority={rec.priority} />
            <h4 className="font-semibold text-[var(--ink)]">{rec.title}</h4>
          </div>
          <p className="text-sm leading-relaxed text-[var(--ink-muted)]">{rec.detail}</p>
        </li>
      ))}
    </ul>
  );
}

function UnitListItem({
  unit,
  active,
  onSelect,
}: {
  unit: SpatialUnitReport;
  active: boolean;
  onSelect: () => void;
}) {
  const index = gapValue(unit);
  const band = gapBand(unit);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
        active
          ? "border-[var(--yellow)] bg-[rgba(255,229,102,0.1)]"
          : "border-[var(--border)] bg-white/[0.02] hover:border-[var(--accent)]"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            {unit.unit_type === "zone" ? "Zone / area" : "Ward"}
          </p>
          <p className="font-semibold text-[var(--ink)]">{unit.label}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-[var(--yellow)]">{index}</p>
          <GapBandChip band={band} />
        </div>
      </div>
      <p className="mt-1 text-xs text-[var(--ink-muted)]">
        {fmt(unit.stop_count)} stops · {fmt(unit.shelter_count)} shelters · {fmt(unit.hub_count)}{" "}
        hubs
      </p>
    </button>
  );
}

function ReportDetail({
  unit,
  cityMean,
  cityGap,
}: {
  unit: SpatialUnitReport | null;
  cityMean: number | null;
  cityGap: number | null | undefined;
}) {
  if (!unit) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] p-6 text-sm text-[var(--ink-muted)]">
        Select a ward, zone, or area to open its Gap Index and recommendations.
      </div>
    );
  }

  const index = gapValue(unit);
  const band = gapBand(unit);

  return (
    <article
      id="spatial-report-print"
      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm print:border-0 print:bg-white print:text-black"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--yellow)] print:text-amber-700">
            {unit.unit_type === "zone" ? "Zone / area report" : "Ward report"}
          </p>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--yellow-bright)] print:text-slate-900">
            {unit.label}
          </h3>
          <p className="mt-1 text-sm text-[var(--ink-muted)] print:text-slate-600">
            Inventory Gap Index from verified spatial joins
            {cityGap != null ? ` · city ward mean ${cityGap}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] print:hidden"
        >
          Print report
        </button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-4">
          <GapMeter value={index} band={band} />
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Gap components
          </p>
          <GapComponentsBreakdown components={unit.gap_components} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Stops
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--yellow)]">{fmt(unit.stop_count)}</p>
          {cityMean != null ? (
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              City ward mean {fmt(cityMean, 1)}
            </p>
          ) : null}
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Shelters
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--yellow)]">
            {fmt(unit.shelter_count)}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Rail hubs
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--yellow)]">{fmt(unit.hub_count)}</p>
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-white/[0.03] p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Density
          </p>
          <p className="mt-1 text-2xl font-semibold text-[var(--yellow)]">
            {fmt(unit.stops_per_km2, 1)}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            stops/km² · {fmt(unit.area_km2, 2)} km²
          </p>
        </div>
      </div>

      <div className="mt-6">
        <h4 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--yellow)] print:text-slate-900">
          Recommendations
        </h4>
        <p className="mt-1 text-sm text-[var(--ink-muted)] print:text-slate-600">
          Rule-based from inventory only — not census equity scores. Field-verify before capital
          works.
        </p>
        <div className="mt-3">
          <RecommendationList items={unit.recommendations} />
        </div>
      </div>
    </article>
  );
}

function downloadReportsCsv(rows: SpatialUnitReport[], filename: string) {
  const header = [
    "unit_type",
    "label",
    "gap_index",
    "gap_band",
    "stop_gap",
    "shelter_gap",
    "hub_gap",
    "density_gap",
    "stop_count",
    "shelter_count",
    "hub_count",
    "area_km2",
    "stops_per_km2",
    "top_recommendation",
  ];
  const lines = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.unit_type,
        `"${r.label.replaceAll('"', '""')}"`,
        gapValue(r),
        gapBand(r),
        r.gap_components?.stop_gap ?? "",
        r.gap_components?.shelter_gap ?? "",
        r.gap_components?.hub_gap ?? "",
        r.gap_components?.density_gap ?? "",
        r.stop_count ?? "",
        r.shelter_count ?? "",
        r.hub_count ?? "",
        r.area_km2 ?? "",
        r.stops_per_km2 ?? "",
        `"${(r.recommendations[0]?.title ?? "").replaceAll('"', '""')}"`,
      ].join(",")
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SpatialReports() {
  const [reports, setReports] = useState<SpatialReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unitFilter, setUnitFilter] = useState<UnitFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("gap");
  const [bandFilter, setBandFilter] = useState<"all" | GapBand>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await fetchReportsClient();
      if (!cancelled) {
        setReports(data);
        setLoading(false);
        const first =
          data?.severe_gap_wards?.[0] ??
          data?.priority_wards[0] ??
          data?.wards[0] ??
          data?.priority_zones[0] ??
          data?.zones[0] ??
          null;
        if (first) setSelectedId(`${first.unit_type}:${first.label}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const allUnits = useMemo(() => {
    if (!reports) return [];
    return [...reports.wards, ...reports.zones];
  }, [reports]);

  const bandCounts = useMemo(() => {
    const counts: Record<string, number> = { severe: 0, high: 0, moderate: 0, low: 0 };
    for (const w of reports?.wards ?? []) {
      const b = gapBand(w);
      counts[b] = (counts[b] ?? 0) + 1;
    }
    return counts;
  }, [reports]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = allUnits.filter((u) => {
      if (unitFilter !== "all" && u.unit_type !== unitFilter) return false;
      if (bandFilter !== "all" && gapBand(u) !== bandFilter) return false;
      if (!q) return true;
      return (
        u.label.toLowerCase().includes(q) ||
        u.unit_type.includes(q) ||
        gapBand(u).includes(q) ||
        (u.unit_type === "zone" && "area".includes(q))
      );
    });

    rows = [...rows].sort((a, b) => {
      if (sortKey === "name") return a.label.localeCompare(b.label);
      if (sortKey === "stops") return (b.stop_count ?? -1) - (a.stop_count ?? -1);
      if (sortKey === "density") return (b.stops_per_km2 ?? -1) - (a.stops_per_km2 ?? -1);
      return gapValue(b) - gapValue(a) || a.label.localeCompare(b.label);
    });
    return rows;
  }, [allUnits, unitFilter, query, sortKey, bandFilter]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return allUnits.find((u) => `${u.unit_type}:${u.label}` === selectedId) ?? null;
  }, [allUnits, selectedId]);

  if (loading) {
    return <p className="text-sm text-[var(--ink-muted)]">Loading ward / zone reports…</p>;
  }

  if (!reports) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <StatusBadge status="unavailable" />
        <p className="mt-3 text-[var(--ink-muted)]">
          Spatial reports not found. Run the ETL pipeline to generate{" "}
          <code className="text-[var(--accent)]">reports.json</code>.
        </p>
      </div>
    );
  }

  const method = reports.gap_index_method;
  const severeCount = reports.severe_gap_wards?.length ?? bandCounts.severe;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--yellow)]">
              Inventory Gap Index
            </p>
            <h3 className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]">
              0–100 score from verified stops, shelters, hubs &amp; density
            </h3>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              {method?.disclaimer ?? reports.note}
            </p>
          </div>
          <div className="min-w-[160px] rounded-lg border border-[var(--border)] bg-white/[0.03] px-4 py-3 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              City mean (wards)
            </p>
            <p className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow)]">
              {fmt(reports.city_mean_gap_index, 1)}
            </p>
          </div>
        </div>

        {method ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(method.components).map(([key, detail]) => (
              <div
                key={key}
                className="rounded-lg border border-[var(--border)] bg-white/[0.02] p-3 text-sm"
              >
                <p className="font-semibold text-[var(--yellow)]">
                  {key.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">{detail}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["severe", "≥70"],
              ["high", "45–69"],
              ["moderate", "25–44"],
              ["low", "<25"],
            ] as const
          ).map(([band, range]) => (
            <button
              key={band}
              type="button"
              onClick={() => setBandFilter((prev) => (prev === band ? "all" : band))}
              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                bandFilter === band
                  ? BAND_STYLE[band]
                  : "border-[var(--border)] text-[var(--ink-muted)] hover:border-[var(--accent)]"
              }`}
            >
              {band} {range} · {bandCounts[band] ?? 0} wards
            </button>
          ))}
          {bandFilter !== "all" ? (
            <button
              type="button"
              onClick={() => setBandFilter("all")}
              className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--ink-muted)]"
            >
              Clear band filter
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="City Gap Index"
          value={
            reports.city_mean_gap_index != null
              ? Number(reports.city_mean_gap_index).toFixed(1)
              : null
          }
          subtext="Mean across 200 wards"
          unavailableReason="Gap Index not generated yet"
        />
        <MetricCard
          label="Severe gap wards"
          value={severeCount}
          subtext="Gap Index ≥ 70"
        />
        <MetricCard
          label="High gap wards"
          value={reports.priority_wards.length}
          subtext="Top list · Gap Index ≥ 45"
        />
        <MetricCard
          label="High gap zones"
          value={reports.priority_zones.length}
          subtext="Zones / areas · Gap Index ≥ 35"
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--yellow)]">
            Highest Gap Index wards
          </h3>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Open any row for component breakdown and recommendations.
          </p>
          <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
            {(reports.severe_gap_wards?.length
              ? reports.severe_gap_wards
              : reports.priority_wards
            ).map((w) => (
              <li key={`pw-${w.label}`}>
                <UnitListItem
                  unit={w}
                  active={selectedId === `ward:${w.label}`}
                  onSelect={() => {
                    setUnitFilter("ward");
                    setSelectedId(`ward:${w.label}`);
                  }}
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--yellow)]">
            Highest Gap Index zones / areas
          </h3>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            GCC named zones ranked by inventory Gap Index.
          </p>
          <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
            {reports.priority_zones.map((z) => (
              <li key={`pz-${z.label}`}>
                <UnitListItem
                  unit={z}
                  active={selectedId === `zone:${z.label}`}
                  onSelect={() => {
                    setUnitFilter("zone");
                    setSelectedId(`zone:${z.label}`);
                  }}
                />
              </li>
            ))}
            {!reports.priority_zones.length ? (
              <li className="text-sm text-[var(--ink-muted)]">No high-gap zones flagged.</li>
            ) : null}
          </ul>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--yellow)]">
              Browse
            </p>
            <h3 className="mt-1 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
              Ward, zone &amp; area Gap Index
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadReportsCsv(reports.wards, "ward-gap-index.csv")}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Export wards CSV
            </button>
            <button
              type="button"
              onClick={() => downloadReportsCsv(reports.zones, "zone-gap-index.csv")}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              Export zones CSV
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              Search ward / area / zone
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Adyar, 45, Ambattur…"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--ink)] placeholder:text-[var(--ink-subtle)]"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              Unit type
            </span>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value as UnitFilter)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--ink)]"
            >
              <option value="all">All units</option>
              <option value="ward">Wards only</option>
              <option value="zone">Zones / areas only</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
              Sort by
            </span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--ink)]"
            >
              <option value="gap">Gap Index</option>
              <option value="stops">Stop count</option>
              <option value="density">Stop density</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>

        <p className="mt-3 text-sm text-[var(--ink-muted)]">
          Showing {filtered.length} of {allUnits.length} units
          {bandFilter !== "all" ? ` · ${bandFilter} gap only` : ""}
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <ul className="max-h-[640px] space-y-2 overflow-y-auto pr-1">
            {filtered.map((u) => (
              <li key={`${u.unit_type}-${u.label}`}>
                <UnitListItem
                  unit={u}
                  active={selectedId === `${u.unit_type}:${u.label}`}
                  onSelect={() => setSelectedId(`${u.unit_type}:${u.label}`)}
                />
              </li>
            ))}
            {!filtered.length ? (
              <li className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm text-[var(--ink-muted)]">
                No wards or zones match this search.
              </li>
            ) : null}
          </ul>
          <ReportDetail
            unit={selected}
            cityMean={reports.city_mean_stops_per_ward}
            cityGap={reports.city_mean_gap_index}
          />
        </div>
      </section>
    </div>
  );
}
