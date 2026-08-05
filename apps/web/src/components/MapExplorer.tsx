"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import {
  fetchGeoJSONClient,
  fetchManifestClient,
  fetchReportsClient,
  layerIsReady,
  type Manifest,
} from "@/lib/data-client";
import { StatusBadge } from "@/components/StatusBadge";
import { ProvenanceStrip } from "@/components/ProvenanceStrip";
import { TransitMap, joinWardGapIndex } from "@/components/TransitMap";
import {
  LAYER_PRESETS,
  MAP_LAYER_META,
  defaultVisibility,
  type ChoroplethMode,
  type LayerData,
  type MapLayerKey,
} from "@/lib/map-layers";

const MAP_HEIGHT = 640;
const CORE_LAYERS: MapLayerKey[] = [
  "wards",
  "zones",
  "mrts_lines",
  "mrts_stations",
  "hubs",
  "stops",
  "shelters",
];
const HEAVY_LAYERS: MapLayerKey[] = ["catchment_400m", "catchment_800m"];

export function MapExplorer({ audienceNote }: { audienceNote?: string }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [data, setData] = useState<LayerData>({});
  const [visibility, setVisibility] = useState(defaultVisibility);
  const [choropleth, setChoropleth] = useState<ChoroplethMode>("stops");
  const [loadingCore, setLoadingCore] = useState(true);
  const [loadingHeavy, setLoadingHeavy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string>("coverage");

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

        const next: LayerData = {};
        if (m) {
          await Promise.all(
            CORE_LAYERS.map(async (key) => {
              const layer = m.layers[key];
              if (layerIsReady(layer) && layer.file) {
                const fc = await fetchGeoJSONClient(layer.file);
                if (!fc) return;
                if (key === "wards" && gapByLabel.size) {
                  next[key] = joinWardGapIndex(fc, gapByLabel);
                } else {
                  next[key] = fc;
                }
              }
            })
          );
        }
        if (!cancelled) {
          setData(next);
          setLoadingCore(false);
        }
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

  // Fetch heavy catchments only when toggled on
  useEffect(() => {
    let cancelled = false;
    const want400 = visibility.catchment_400m;
    const want800 = visibility.catchment_800m;
    if ((!want400 && !want800) || !manifest) return;

    (async () => {
      const needed = HEAVY_LAYERS.filter((k) => {
        if (k === "catchment_400m" && !want400) return false;
        if (k === "catchment_800m" && !want800) return false;
        return true;
      });

      setLoadingHeavy(true);
      const next: LayerData = {};
      await Promise.all(
        needed.map(async (key) => {
          const layer = manifest.layers[key];
          if (layerIsReady(layer) && layer.file) {
            const fc = await fetchGeoJSONClient(layer.file);
            if (fc) next[key] = fc;
          }
        })
      );
      if (!cancelled && Object.keys(next).length) {
        setData((prev) => {
          const merged = { ...prev };
          for (const [k, v] of Object.entries(next)) {
            if (!merged[k as MapLayerKey]) merged[k as MapLayerKey] = v;
          }
          return merged;
        });
      }
      if (!cancelled) setLoadingHeavy(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [visibility.catchment_400m, visibility.catchment_800m, manifest]);

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

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="no-print space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--yellow)]">
            Map layers
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Basemap draws first; heavy catchments load only when you turn them on.
          </p>
          {audienceNote ? (
            <p className="mt-2 rounded-md bg-[var(--accent-soft)] px-2 py-1.5 text-sm text-[var(--accent)]">
              {audienceNote}
            </p>
          ) : null}
          {loadError ? (
            <p className="mt-2 text-sm text-[var(--danger)]">{loadError}</p>
          ) : null}
        </div>

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Presets
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(LAYER_PRESETS).map(([id, preset]) => (
              <button
                key={id}
                type="button"
                onClick={() => applyPreset(id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  activePreset === id
                    ? "border-[var(--yellow)] bg-[rgba(255,229,102,0.12)] text-[var(--yellow)]"
                    : "border-[var(--border)] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                }`}
                title={preset.blurb}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Ward colour
          </p>
          <div className="flex gap-1.5">
            {(
              [
                ["stops", "Stop count"],
                ["gap", "Gap Index"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setChoropleth(mode);
                  setActivePreset("custom");
                }}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold ${
                  choropleth === mode
                    ? "border-[var(--yellow)] text-[var(--yellow)]"
                    : "border-[var(--border)] text-[var(--ink-muted)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <ul className="space-y-2">
          {MAP_LAYER_META.map(({ key, label, heavy }) => {
            const layer = manifest?.layers[key];
            const ready = Boolean(data[key]);
            const pendingHeavy = Boolean(heavy && visibility[key] && !ready && loadingHeavy);
            const canEnable = layerIsReady(layer) || ready;
            return (
              <li
                key={key}
                className="flex items-start justify-between gap-2 rounded-lg border border-[var(--border)] px-2 py-2"
              >
                <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--ink)]">
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={!canEnable && !pendingHeavy}
                    checked={Boolean(visibility[key] && (ready || pendingHeavy))}
                    onChange={() => toggle(key)}
                  />
                  <span>
                    <span className="font-medium">{label}</span>
                    <span className="mt-0.5 block text-xs text-[var(--ink-muted)]">
                      {pendingHeavy
                        ? "Loading…"
                        : ready
                          ? `${layer?.feature_count ?? (data[key] as FeatureCollection<Geometry>)?.features.length ?? 0} features`
                          : layer?.status === "unavailable"
                            ? layer.error || "Unavailable"
                            : heavy
                              ? "On demand"
                              : loadingCore
                                ? "Loading…"
                                : "Not loaded"}
                    </span>
                  </span>
                </label>
                <StatusBadge
                  status={
                    ready
                      ? "loaded"
                      : pendingHeavy
                        ? "partial"
                        : (layer?.status as "unavailable") || "unavailable"
                  }
                />
              </li>
            );
          })}
        </ul>

        <div className="rounded-lg bg-white/[0.05] p-3 text-xs text-[var(--ink-muted)]">
          {loadedCount} layers in memory
          {choropleth === "gap"
            ? " · Gap Index colour is inventory-based, not census equity."
            : " · Stop-count colour uses GTFS × ward joins."}
        </div>

        {manifest ? (
          <ProvenanceStrip
            source="OpenCity CKAN + ChennaiGTFS + GCC MRTS"
            fetchedAt={manifest.generated_at}
          />
        ) : null}
      </aside>

      <TransitMap
        data={data}
        visibility={visibility}
        choropleth={choropleth}
        height={MAP_HEIGHT}
        loading={loadingCore || loadingHeavy}
        interactive
      />
    </div>
  );
}
