"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  LAYER_PRESETS,
  MAP_LAYER_META,
  defaultVisibility,
  type ChoroplethMode,
  type LayerData,
  type MapLayerKey,
} from "@/lib/map-layers";

const MAP_HEIGHT = 680;
/** Small corridor / rail layers — paint first so the map is useful immediately. */
const LIGHT_LAYERS: MapLayerKey[] = [
  "metro_area_boundaries",
  "omr_corridor",
  "connectivity_need",
  "slums",
  "mrts_lines",
  "mrts_stations",
  "hubs",
];
/** Polygons next. */
const MEDIUM_LAYERS: MapLayerKey[] = ["wards", "zones", "corridor_aois"];
/** Dense point layers last. */
const POINT_LAYERS: MapLayerKey[] = ["stops", "shelters"];
const HEAVY_LAYERS: MapLayerKey[] = ["catchment_400m", "catchment_800m"];

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

        if (!m) {
          if (!cancelled) setLoadingCore(false);
          return;
        }

        const light = await loadLayerBatch(m, LIGHT_LAYERS, gapByLabel);
        if (cancelled) return;
        setData((prev) => ({ ...prev, ...light }));

        const medium = await loadLayerBatch(m, MEDIUM_LAYERS, gapByLabel);
        if (cancelled) return;
        setData((prev) => ({ ...prev, ...medium }));

        const points = await loadLayerBatch(m, POINT_LAYERS, gapByLabel);
        if (cancelled) return;
        setData((prev) => ({ ...prev, ...points }));
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
    <div className="space-y-3">
      <div className="no-print space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-3 shadow-sm sm:px-4">
        {audienceNote ? (
          <p className="rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs text-[var(--accent)]">
            {audienceNote}
          </p>
        ) : null}
        {loadError ? (
          <p className="text-xs text-[var(--danger)]">{loadError}</p>
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
            Colour
          </span>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["stops", "Stops"],
                ["gap", "Gap"],
                ["sec", "SEC"],
                ["slum", "Slum %"],
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
            {MAP_LAYER_META.map(({ key, label, short, heavy }) => {
              const layer = manifest?.layers[key];
              const ready = Boolean(data[key]);
              const pendingHeavy = Boolean(heavy && visibility[key] && !ready && loadingHeavy);
              const canEnable = layerIsReady(layer) || ready || pendingHeavy;
              const active = Boolean(visibility[key] && (ready || pendingHeavy));
              const tip = pendingHeavy
                ? `${label} — loading…`
                : ready
                  ? `${label} · ${layer?.feature_count ?? data[key]?.features.length ?? 0} features`
                  : heavy
                    ? `${label} — on demand`
                    : loadingCore
                      ? `${label} — loading…`
                      : `${label} — not loaded`;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={!canEnable}
                  aria-pressed={active}
                  title={tip}
                  onClick={() => toggle(key)}
                  className={`${chipBase} ${active ? chipOn : chipOff}`}
                >
                  {short}
                  {pendingHeavy ? "…" : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--ink-muted)]">
          <span>
            {loadedCount} layers ready
            {choropleth === "sec"
              ? " · SEC colour is Census 2011 amenity + slum share — not income"
              : choropleth === "slum"
                ? " · Slum % is mapped polygon area share (OpenCity)"
                : choropleth === "gap"
                  ? " · Gap colour is inventory-based, not census equity"
                  : " · Stop colour uses GTFS × ward joins"}
            {loadingCore || loadingHeavy ? " · Loading…" : null}
          </span>
          {manifest ? (
            <ProvenanceStrip
              source="OpenCity CKAN + ChennaiGTFS + GCC MRTS"
              fetchedAt={manifest.generated_at}
            />
          ) : null}
        </div>
      </div>

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
