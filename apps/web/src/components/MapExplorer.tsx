"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FeatureCollection } from "geojson";
import {
  fetchGeoJSONClient,
  fetchManifestClient,
  fetchReportsClient,
  layerIsReady,
  type Manifest,
} from "@/lib/data-client";
import { ProvenanceStrip } from "@/components/ProvenanceStrip";
import { TransitMap, joinWardGapIndex } from "@/components/TransitMap";
import {
  DashboardFilterBar,
  FilterImpactStrip,
  useFilteredUniverse,
} from "@/components/DashboardFilterBar";
import {
  DEFAULT_FILTERS,
  filtersActive,
  type DashboardFilters,
} from "@/lib/dashboard-filters";
import {
  LAYER_PRESETS,
  MAP_LAYER_META,
  defaultVisibility,
  type ChoroplethMode,
  type LayerData,
  type MapLayerKey,
} from "@/lib/map-layers";

const MAP_HEIGHT = 680;

const CORE_LAYERS: MapLayerKey[] = [
  "walk_distance_bands",
  "omr_corridor",
  "metro_area_boundaries",
  "connectivity_need",
  "mrts_lines",
  "mrts_stations",
  "hubs",
  "railway_stations",
  "wards",
  "stops",
  "schools",
  "healthcare",
  "parks",
  "public_toilets",
  "anganwadis",
  "bus_stop_audit",
];

async function loadLayerBatch(
  m: Manifest,
  keys: MapLayerKey[],
  gapByLabel: Map<string, { gap_index: number; gap_band: string }>
): Promise<LayerData> {
  const next: LayerData = {};
  await Promise.all(
    keys.map(async (key) => {
      const layer = m.layers[key];
      if (!layerIsReady(layer) || !layer.file) return;
      const fc = await fetchGeoJSONClient(layer.file);
      if (!fc) return;
      next[key] =
        key === "wards" && gapByLabel.size ? joinWardGapIndex(fc, gapByLabel) : fc;
    })
  );
  return next;
}

const chipBase =
  "rounded-md border px-2 py-1 text-[11px] font-semibold leading-none transition disabled:cursor-not-allowed disabled:opacity-35";
const chipOn =
  "border-[var(--yellow)] bg-[rgba(255,229,102,0.14)] text-[var(--yellow)]";
const chipOff =
  "border-[var(--border)] bg-white/[0.03] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]";

export function MapExplorer({ audienceNote }: { audienceNote?: string }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [data, setData] = useState<LayerData>({});
  const [visibility, setVisibility] = useState(() => {
    const base = defaultVisibility();
    const walk = LAYER_PRESETS.walkkm?.layers ?? {};
    return { ...base, ...walk };
  });
  const [choropleth, setChoropleth] = useState<ChoroplethMode>(
    LAYER_PRESETS.walkkm?.choropleth ?? "stops"
  );
  const [loadingCore, setLoadingCore] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string>("walkkm");
  const [filters, setFilters] = useState<DashboardFilters>({
    ...DEFAULT_FILTERS,
    unit: "ward",
  });
  const {
    loading: loadingFilters,
    filtered,
    wardOptions,
    zoneOptions,
    cityMeanGap,
  } = useFilteredUniverse(filters);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCore(true);
      setLoadError(null);
      try {
        const [m, reports] = await Promise.all([
          fetchManifestClient(),
          fetchReportsClient(),
        ]);
        if (cancelled) return;
        setManifest(m);

        const gapByLabel = new Map<string, { gap_index: number; gap_band: string }>();
        for (const w of reports?.wards ?? []) {
          gapByLabel.set(w.label, {
            gap_index: w.gap_index ?? w.priority_score,
            gap_band: w.gap_band ?? "moderate",
          });
        }

        if (!m) {
          if (!cancelled) setLoadingCore(false);
          return;
        }

        const core = await loadLayerBatch(m, CORE_LAYERS, gapByLabel);
        if (cancelled) return;
        setData(core);
        setLoadingCore(false);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load map data");
          setLoadingCore(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback((key: MapLayerKey) => {
    setVisibility((v) => ({ ...v, [key]: !v[key] }));
    setActivePreset("custom");
  }, []);

  const applyPreset = useCallback((id: string) => {
    const preset = LAYER_PRESETS[id];
    if (!preset) return;
    setActivePreset(id);
    setChoropleth(preset.choropleth);
    setVisibility((prev) => ({ ...prev, ...preset.layers }));
  }, []);

  const loadedCount = useMemo(() => Object.keys(data).length, [data]);

  const filteredWardLabels = useMemo(
    () =>
      new Set(
        filtered.filter((u) => u.unit_type === "ward").map((u) => String(u.label))
      ),
    [filtered]
  );

  const mapData = useMemo((): LayerData => {
    if (!data.wards || !filtersActive(filters)) return data;
    const wards = data.wards as FeatureCollection;
    return {
      ...data,
      wards: {
        ...wards,
        features: wards.features.filter((f) =>
          filteredWardLabels.has(String(f.properties?.ward_label ?? ""))
        ),
      },
    };
  }, [data, filters, filteredWardLabels]);

  return (
    <div className="space-y-3">
      <DashboardFilterBar
        filters={filters}
        onChange={setFilters}
        wardOptions={wardOptions}
        zoneOptions={zoneOptions}
        resultCount={filteredWardLabels.size}
        compact
      />
      {!loadingFilters ? (
        <FilterImpactStrip units={filtered} cityMeanGap={cityMeanGap} />
      ) : null}

      <div className="no-print space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-3 shadow-sm sm:px-4">
        {audienceNote ? (
          <p className="rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs text-[var(--accent)]">
            {audienceNote}
          </p>
        ) : null}
        {loadError ? (
          <p className="text-xs text-[var(--danger)]">{loadError}</p>
        ) : null}
        {filtersActive(filters) ? (
          <p className="text-xs text-[var(--yellow)]">
            Ward polygons filtered to {filteredWardLabels.size.toLocaleString()} matching
            wards. Other layers stay citywide for context.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            Preset
          </span>
          <div className="flex flex-wrap gap-1">
            {Object.entries(LAYER_PRESETS).map(([id, preset]) => (
              <button
                key={id}
                type="button"
                onClick={() => applyPreset(id)}
                title={preset.blurb}
                className={`${chipBase} ${activePreset === id ? chipOn : chipOff}`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <span className="hidden h-4 w-px bg-[var(--border)] sm:block" aria-hidden />

          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            Ward colour
          </span>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["stops", "Stops"],
                ["gap", "Gap"],
                ["sec", "SEC"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setChoropleth(mode);
                  setActivePreset("custom");
                }}
                className={`${chipBase} ${choropleth === mode ? chipOn : chipOff}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--border)] pt-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            Layers
          </span>
          <div className="flex flex-wrap gap-1">
            {MAP_LAYER_META.filter((l) => (l.group ?? "core") === "core").map(
              ({ key, label, short }) => {
                const ready = layerIsReady(manifest?.layers[key]);
                const on = visibility[key];
                return (
                  <button
                    key={key}
                    type="button"
                    title={label}
                    disabled={!ready}
                    onClick={() => toggle(key)}
                    className={`${chipBase} ${on ? chipOn : chipOff}`}
                  >
                    {short}
                  </button>
                );
              }
            )}
          </div>
          {visibility.connectivity_need ? (
            <span className="w-full text-[10px] leading-snug text-[var(--ink-muted)] sm:w-auto">
              Need lines = roads with long stretches &gt;400m from a stop (urgent / priority /
              watch).
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--border)] pt-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            Amenities
          </span>
          <div className="flex flex-wrap gap-1">
            {MAP_LAYER_META.filter((l) => l.group === "amenities").map(
              ({ key, label, short }) => {
                const ready = layerIsReady(manifest?.layers[key]);
                const on = visibility[key];
                return (
                  <button
                    key={key}
                    type="button"
                    title={label}
                    disabled={!ready}
                    onClick={() => toggle(key)}
                    className={`${chipBase} ${on ? chipOn : chipOff}`}
                  >
                    {short}
                  </button>
                );
              }
            )}
          </div>
          <span className="ml-auto text-[10px] text-[var(--ink-muted)]">
            {loadingCore ? "Loading…" : `${loadedCount} layers`}
          </span>
        </div>
      </div>

      <TransitMap
        data={mapData}
        visibility={visibility}
        choropleth={choropleth}
        height={MAP_HEIGHT}
        loading={loadingCore}
      />

      {manifest ? (
        <ProvenanceStrip
          source="OpenCity / GCC / GTFS verified layers"
          fetchedAt={manifest.generated_at}
          kind="Map"
        />
      ) : null}
    </div>
  );
}
