"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { StatusBadge } from "@/components/StatusBadge";
import { MetricCard } from "@/components/MetricCard";
import { SpatialReports } from "@/components/SpatialReports";
import { InsightsPanel } from "@/components/InsightsPanel";
import type { Manifest, ManifestLayer, ManifestSource, Metrics } from "@/lib/types";
import { layerIsReady } from "@/lib/types";
import {
  fetchManifestClient,
  fetchMetricsClient,
} from "@/lib/data-client";

const AnalyticsMap = dynamic(
  () =>
    import("@/components/AnalyticsMap").then((m) => ({ default: m.AnalyticsMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[560px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--map-wash)] text-sm text-[var(--ink-muted)]">
        Loading analytics map…
      </div>
    ),
  }
);

type AnalyticsTab = "overview" | "insights" | "spatial" | "sources";
type StatusFilter = "all" | "loaded" | "unavailable" | "not_connected" | "partial";
type CategoryFilter =
  | "all"
  | "admin"
  | "transit"
  | "rail"
  | "shelter"
  | "catchment"
  | "realtime"
  | "gap";

const LAYER_CATEGORY: Record<string, CategoryFilter> = {
  wards: "admin",
  stops: "transit",
  mrts_stations: "rail",
  mrts_lines: "rail",
  hubs: "rail",
  connectivity_need: "gap",
  walk_distance_bands: "catchment",
  omr_corridor: "transit",
  metro_area_boundaries: "admin",
  schools: "transit",
  healthcare: "transit",
  parks: "transit",
  public_toilets: "transit",
  anganwadis: "transit",
  bus_stop_audit: "shelter",
};

const DEFAULT_MAP_LAYERS: Record<string, boolean> = {
  wards: false,
  stops: true,
  mrts_stations: true,
  mrts_lines: true,
  hubs: true,
  railway_stations: false,
  connectivity_need: false,
  walk_distance_bands: true,
  omr_corridor: true,
  metro_area_boundaries: true,
  schools: false,
  healthcare: false,
  parks: false,
  public_toilets: false,
  anganwadis: false,
  bus_stop_audit: false,
};

const SOURCE_CATEGORY: Record<string, CategoryFilter> = {
  gcc_wards_2022: "admin",
  gcc_zones_2022: "admin",
  bus_shelters: "shelter",
  mrts_stations: "rail",
  mrts_lines: "rail",
  chennai_gtfs_unified: "transit",
};

const CATEGORY_LABEL: Record<CategoryFilter, string> = {
  all: "All categories",
  admin: "Administrative",
  transit: "Transit stops / GTFS",
  rail: "Rail / hubs",
  shelter: "Bus shelters",
  catchment: "Catchments",
  realtime: "Real-time plugs",
  gap: "Analytics gaps",
};

const TABS: { id: AnalyticsTab; label: string; blurb: string }[] = [
  {
    id: "spatial",
    label: "Ward / zone reports",
    blurb: "Gap Index and inventory by area",
  },
  {
    id: "insights",
    label: "Feeder insights",
    blurb: "Hub last-mile, shelters, catchments",
  },
  {
    id: "overview",
    label: "Inventory map",
    blurb: "Layer toggles and feature counts",
  },
  {
    id: "sources",
    label: "Data sources",
    blurb: "Filter loaded layers and plugs",
  },
];

function Bar({
  label,
  value,
  max,
  color = "var(--accent)",
}: {
  label: string;
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="truncate text-[var(--ink)]">{label}</span>
        <span className="shrink-0 font-semibold text-[var(--yellow)]">
          {value.toLocaleString()}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function AnalyticsDashboard() {
  const [tab, setTab] = useState<AnalyticsTab>("spatial");
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [query, setQuery] = useState("");
  const [minFeatures, setMinFeatures] = useState(0);
  const [mapLayers, setMapLayers] = useState<Record<string, boolean>>(DEFAULT_MAP_LAYERS);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapHeight, setMapHeight] = useState(560);

  useEffect(() => {
    if (!mapExpanded) {
      setMapHeight(560);
      return;
    }
    const update = () => setMapHeight(Math.max(640, window.innerHeight - 140));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [mapExpanded]);

  useEffect(() => {
    if (!mapExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMapExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [mapExpanded]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "spatial" || t === "sources" || t === "overview" || t === "insights") {
      setTab(t);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [m, met] = await Promise.all([
        fetchManifestClient(),
        fetchMetricsClient(),
      ]);
      if (!cancelled) {
        setManifest(m);
        setMetrics(met);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectTab = (next: AnalyticsTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState({}, "", url.toString());
  };

  const sources = useMemo(
    () => (manifest ? Object.values(manifest.sources) : []),
    [manifest]
  );
  const layers = useMemo(
    () =>
      manifest
        ? Object.entries(manifest.layers).map(([id, layer]) => ({ id, ...layer }))
        : [],
    [manifest]
  );

  const filteredSources = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sources.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      const cat = SOURCE_CATEGORY[s.id] ?? "gap";
      if (categoryFilter !== "all" && categoryFilter !== "realtime" && categoryFilter !== "gap") {
        if (cat !== categoryFilter) return false;
      }
      if (categoryFilter === "realtime") return false;
      if (categoryFilter === "gap") return false;
      if (
        q &&
        ![s.name, s.publisher, s.id, s.notes ?? ""].join(" ").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [sources, statusFilter, categoryFilter, query]);

  const filteredLayers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return layers.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      const cat = LAYER_CATEGORY[l.id] ?? "gap";
      if (categoryFilter !== "all" && categoryFilter !== "realtime" && categoryFilter !== "gap") {
        if (cat !== categoryFilter) return false;
      }
      if (categoryFilter === "realtime" || categoryFilter === "gap") return false;
      const count = l.feature_count ?? 0;
      if (count < minFeatures) return false;
      if (q && ![l.id, l.notes ?? "", l.derived_from ?? ""].join(" ").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [layers, statusFilter, categoryFilter, query, minFeatures]);

  const filteredRealtime = useMemo(() => {
    if (!manifest) return [];
    if (categoryFilter !== "all" && categoryFilter !== "realtime") return [];
    const q = query.trim().toLowerCase();
    return manifest.realtime.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (q && ![r.name, r.would_unlock, r.id].join(" ").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [manifest, categoryFilter, statusFilter, query]);

  const filteredGaps = useMemo(() => {
    if (!manifest) return [];
    if (categoryFilter !== "all" && categoryFilter !== "gap") return [];
    const q = query.trim().toLowerCase();
    return manifest.unavailable_analytics.filter((g) => {
      if (statusFilter !== "all" && g.status !== statusFilter) return false;
      if (q && ![g.name, g.reason, g.needed].join(" ").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [manifest, categoryFilter, statusFilter, query]);

  const layerBars = useMemo(() => {
    const ready = layers
      .filter((l) => layerIsReady(l as ManifestLayer & { id: string }))
      .map((l) => ({
        label: l.id,
        value: l.feature_count ?? 0,
        color:
          LAYER_CATEGORY[l.id] === "rail"
            ? "var(--hub)"
            : LAYER_CATEGORY[l.id] === "shelter"
              ? "var(--teal)"
              : LAYER_CATEGORY[l.id] === "catchment"
                ? "var(--accent-bright)"
                : "var(--accent)",
      }))
      .sort((a, b) => b.value - a.value);
    const max = ready[0]?.value ?? 1;
    return { ready, max };
  }, [layers]);

  const summary = useMemo(() => {
    const loadedSources = sources.filter((s) => s.status === "loaded").length;
    const loadedLayers = layers.filter((l) => l.status === "loaded").length;
    const features = layers.reduce((sum, l) => sum + (l.feature_count ?? 0), 0);
    return { loadedSources, loadedLayers, features, totalSources: sources.length };
  }, [sources, layers]);

  const toggleMapLayer = (id: string) => {
    setMapLayers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const showOnlyCategoryOnMap = (cat: CategoryFilter) => {
    setCategoryFilter(cat);
    setMapLayers((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = cat === "all" ? true : LAYER_CATEGORY[key] === cat;
      }
      if (cat === "all") {
        return { ...DEFAULT_MAP_LAYERS };
      }
      return next;
    });
  };

  const resetFilters = () => {
    setStatusFilter("all");
    setCategoryFilter("all");
    setQuery("");
    setMinFeatures(0);
    setMapLayers({ ...DEFAULT_MAP_LAYERS });
  };

  if (loading) {
    return (
      <p className="text-sm text-[var(--ink-muted)]">Loading analytics dashboard…</p>
    );
  }

  if (!manifest) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
        <StatusBadge status="unavailable" />
        <p className="mt-3 text-[var(--ink-muted)]">
          Manifest not found. Run the ETL pipeline to populate data sources.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <nav
        className="flex flex-wrap gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2"
        aria-label="Analytics sections"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectTab(t.id)}
            className={`min-w-[140px] flex-1 rounded-lg px-4 py-3 text-left transition ${
              tab === t.id
                ? "bg-[rgba(255,229,102,0.12)] ring-1 ring-[var(--yellow)]"
                : "hover:bg-white/[0.04]"
            }`}
          >
            <span
              className={`block text-sm font-semibold ${
                tab === t.id ? "text-[var(--yellow)]" : "text-[var(--ink)]"
              }`}
            >
              {t.label}
            </span>
            <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">{t.blurb}</span>
          </button>
        ))}
      </nav>

      {tab === "insights" ? <InsightsPanel /> : null}

      {tab === "spatial" ? <SpatialReports /> : null}

      {tab === "overview" ? (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Sources loaded"
              value={`${summary.loadedSources}/${summary.totalSources}`}
              subtext="From OpenCity / GTFS / MRTS ingest"
            />
            <MetricCard
              label="Map layers loaded"
              value={summary.loadedLayers}
              subtext="Verified GeoJSON outputs"
            />
            <MetricCard
              label="Total features"
              value={summary.features.toLocaleString()}
              subtext="Across loaded layers only"
            />
            <MetricCard
              label="Weak last-mile hubs"
              value={metrics?.counts?.weak_last_mile_hubs}
              subtext={
                metrics?.counts?.shelter_mismatch_wards != null
                  ? `${metrics.counts.shelter_mismatch_wards} shelter-mismatch wards`
                  : "Open Insights for hub feeder scores"
              }
              unavailableReason="Run ETL to emit hub last-mile analysis"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              label="Schools"
              value={metrics?.counts?.schools ?? manifest.layers.schools?.feature_count}
              subtext="OpenCity schools map"
            />
            <MetricCard
              label="Healthcare"
              value={metrics?.counts?.healthcare ?? manifest.layers.healthcare?.feature_count}
              subtext="UPHC / UCHC points"
            />
            <MetricCard
              label="Parks"
              value={metrics?.counts?.parks ?? manifest.layers.parks?.feature_count}
              subtext="OpenCity parks"
            />
            <MetricCard
              label="Public toilets"
              value={
                metrics?.counts?.public_toilets ?? manifest.layers.public_toilets?.feature_count
              }
              subtext="OpenCity toilets"
            />
            <MetricCard
              label="Anganwadis"
              value={metrics?.counts?.anganwadis ?? manifest.layers.anganwadis?.feature_count}
              subtext="ICDS centres"
            />
            <MetricCard
              label="Bus stop audit"
              value={
                metrics?.counts?.bus_stop_audit ??
                manifest.layers.bus_stop_audit?.feature_count
              }
              subtext="Audit CSV points with coordinates"
            />
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--ink-muted)]">
                Need feeder or walk-coverage actions? Open{" "}
                <button
                  type="button"
                  onClick={() => selectTab("insights")}
                  className="font-semibold text-[var(--yellow)] underline-offset-2 hover:underline"
                >
                  Insights
                </button>{" "}
                for hub last-mile, shelter mismatch, and catchment coverage.
              </p>
              <button
                type="button"
                onClick={() => selectTab("insights")}
                className="rounded-md border border-[var(--yellow)] bg-[rgba(255,229,102,0.1)] px-3 py-1.5 text-sm font-semibold text-[var(--yellow)]"
              >
                View insights →
              </button>
            </div>
          </div>

          <section
            className={`grid gap-4 ${
              mapExpanded
                ? "fixed inset-0 z-[60] grid-cols-1 bg-[rgba(8,13,26,0.96)] p-3 sm:p-4 lg:grid-cols-[300px_minmax(0,1fr)]"
                : "lg:grid-cols-[260px_minmax(0,1fr)]"
            }`}
          >
            <aside
              className={`flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] ${
                mapExpanded
                  ? "max-h-[40vh] lg:max-h-none"
                  : "max-h-[min(72vh,720px)] lg:sticky lg:top-24 lg:max-h-[calc(100vh-7.5rem)]"
              }`}
            >
              <div className="shrink-0 border-b border-[var(--border)] px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-[var(--yellow)]">
                      Map layer filters
                    </h3>
                    <p className="mt-1 text-xs text-[var(--ink-muted)]">
                      Toggle verified layers. Scroll inside this panel — it stays fixed while
                      you pan the map.
                    </p>
                  </div>
                  {mapExpanded ? (
                    <button
                      type="button"
                      onClick={() => setMapExpanded(false)}
                      className="shrink-0 rounded-md border border-[var(--border)] px-2 py-1 text-xs font-semibold text-[var(--ink-muted)]"
                    >
                      Close
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <ul className="space-y-2">
                  {Object.keys(mapLayers).map((id) => {
                    const layer = manifest.layers[id];
                    const ready = layerIsReady(layer);
                    return (
                      <li key={id}>
                        <label className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-[var(--border)] px-2 py-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2 text-[var(--ink)]">
                            <input
                              type="checkbox"
                              disabled={!ready}
                              checked={Boolean(mapLayers[id] && ready)}
                              onChange={() => toggleMapLayer(id)}
                            />
                            <span className="truncate" title={id}>
                              {id === "connectivity_need" ? "need_lines (service gaps)" : id}
                            </span>
                          </span>
                          <StatusBadge status={ready ? "loaded" : layer?.status || "unavailable"} />
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2 pb-1">
                  {(
                    [
                      ["all", "All"],
                      ["admin", "Admin"],
                      ["transit", "Transit"],
                      ["rail", "Rail"],
                      ["shelter", "Shelters"],
                      ["catchment", "Catchments"],
                      ["gap", "Gaps"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => showOnlyCategoryOnMap(key)}
                      className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
                        categoryFilter === key
                          ? "border-[var(--yellow)] bg-[rgba(255,229,102,0.12)] text-[var(--yellow)]"
                          : "border-[var(--border)] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-[var(--ink-muted)]">
                  Drag to pan · scroll to zoom · click features for details.
                  {mapLayers.connectivity_need
                    ? " Need lines = roads far from stops (see legend)."
                    : ""}
                </p>
                <button
                  type="button"
                  onClick={() => setMapExpanded((v) => !v)}
                  className="rounded-md border border-[var(--yellow)] bg-[rgba(255,229,102,0.1)] px-3 py-1.5 text-xs font-semibold text-[var(--yellow)]"
                >
                  {mapExpanded ? "Exit enlarged map (Esc)" : "Enlarge map"}
                </button>
              </div>
              <AnalyticsMap visibility={mapLayers} height={mapHeight} />
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--yellow)]">
                Feature counts by layer
              </h3>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Loaded geometries only — no invented scores.
              </p>
              <div className="mt-4 space-y-3">
                {layerBars.ready.map((row) => (
                  <Bar
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    max={layerBars.max}
                    color={row.color}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
              <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--yellow)]">
                City inventory snapshot
              </h3>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                From metrics.json after successful spatial joins.
              </p>
              <div className="mt-4 space-y-3">
                {Object.entries(metrics?.counts ?? {}).map(([k, v]) => (
                  <Bar
                    key={k}
                    label={k.replaceAll("_", " ")}
                    value={v}
                    max={Math.max(...Object.values(metrics?.counts ?? { x: 1 }), 1)}
                    color="var(--yellow)"
                  />
                ))}
                {!metrics?.counts || !Object.keys(metrics.counts).length ? (
                  <p className="text-sm text-[var(--ink-muted)]">No verified metrics yet.</p>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {tab === "sources" ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--yellow)]">
                  Filters
                </p>
                <h2 className="mt-1 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
                  Slice sources, layers, realtime, and gaps
                </h2>
              </div>
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--ink-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
              >
                Reset filters
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="block text-sm">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                  Search
                </span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Ward, GTFS, shelter, CMRL…"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--ink)] placeholder:text-[var(--ink-subtle)]"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                  Status
                </span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--ink)]"
                >
                  <option value="all">All statuses</option>
                  <option value="loaded">Loaded</option>
                  <option value="partial">Partial</option>
                  <option value="unavailable">Unavailable</option>
                  <option value="not_connected">Not connected</option>
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                  Category
                </span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--ink)]"
                >
                  {(Object.keys(CATEGORY_LABEL) as CategoryFilter[]).map((key) => (
                    <option key={key} value={key}>
                      {CATEGORY_LABEL[key]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                  Min. features on layer
                </span>
                <input
                  type="number"
                  min={0}
                  value={minFeatures}
                  onChange={(e) => setMinFeatures(Number(e.target.value) || 0)}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--ink)]"
                />
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--yellow)]">
                Filtered catalog
              </h3>
              <p className="text-sm text-[var(--ink-muted)]">
                {filteredSources.length} sources · {filteredLayers.length} layers ·{" "}
                {filteredRealtime.length} realtime · {filteredGaps.length} gaps
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {filteredSources.map((s: ManifestSource) => (
                <article
                  key={s.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-[var(--ink)]">{s.name}</h4>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="text-sm text-[var(--ink-muted)]">{s.publisher}</p>
                  {s.notes ? (
                    <p className="mt-2 text-sm text-[var(--ink-muted)]">{s.notes}</p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-3 text-sm">
                    {s.portal ? (
                      <a
                        href={s.portal}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-[var(--accent)]"
                      >
                        Portal
                      </a>
                    ) : null}
                    <span className="text-xs text-[var(--ink-muted)]">
                      {s.fetched_at
                        ? `Fetched ${new Date(s.fetched_at).toLocaleString()}`
                        : "No fetch timestamp"}
                    </span>
                  </div>
                </article>
              ))}
            </div>

            <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-white/[0.04] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
                  <tr>
                    <th className="px-4 py-3">Layer</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Features</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLayers.map((l) => (
                    <tr key={l.id} className="border-b border-[var(--border)]">
                      <td className="px-4 py-3 font-medium text-[var(--ink)]">{l.id}</td>
                      <td className="px-4 py-3 text-[var(--ink-muted)]">
                        {CATEGORY_LABEL[LAYER_CATEGORY[l.id] ?? "gap"]}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={l.status} />
                      </td>
                      <td className="px-4 py-3 text-[var(--yellow)]">
                        {l.feature_count?.toLocaleString() ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--ink-muted)]">
                        {l.notes || l.error || "—"}
                      </td>
                    </tr>
                  ))}
                  {!filteredLayers.length ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-[var(--ink-muted)]">
                        No layers match the current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {(filteredRealtime.length > 0 || filteredGaps.length > 0) && (
              <div className="grid gap-3 md:grid-cols-2">
                {filteredRealtime.map((r) => (
                  <article
                    key={r.id}
                    className="rounded-xl border border-dashed border-[var(--border)] bg-white/[0.03] p-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h4 className="font-semibold text-[var(--ink)]">{r.name}</h4>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-sm text-[var(--ink-muted)]">{r.would_unlock}</p>
                    <p className="mt-2 text-xs text-[var(--ink-muted)]">{r.how_to_plug}</p>
                  </article>
                ))}
                {filteredGaps.map((g) => (
                  <article
                    key={g.id}
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h4 className="font-semibold text-[var(--ink)]">{g.name}</h4>
                      <StatusBadge status={g.status} />
                    </div>
                    <p className="text-sm text-[var(--ink-muted)]">{g.reason}</p>
                    <p className="mt-2 text-sm">
                      <span className="font-semibold text-[var(--yellow)]">Needed: </span>
                      <span className="text-[var(--ink-muted)]">{g.needed}</span>
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
