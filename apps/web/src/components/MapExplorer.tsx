"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { filtersActive } from "@/lib/dashboard-filters";
import {
  useAudienceParam,
  useDashboardFilters,
  usePresetParam,
} from "@/hooks/useDashboardFilters";
import { audienceMapNote } from "@/lib/hubs";
import {
  AUDIENCE_PRESETS,
  BOOTSTRAP_LAYERS,
  LAYER_PRESETS,
  MAP_LAYER_META,
  defaultVisibility,
  layersForPreset,
  type ChoroplethMode,
  type LayerData,
  type MapLayerKey,
} from "@/lib/map-layers";

const MAP_HEIGHT = 560;

async function loadLayerBatch(
  m: Manifest,
  keys: MapLayerKey[],
  gapByLabel: Map<string, { gap_index: number; gap_band: string }>,
  already: LayerData
): Promise<LayerData> {
  const next: LayerData = { ...already };
  const missing = keys.filter((k) => !next[k]);
  await Promise.all(
    missing.map(async (key) => {
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

export function MapExplorer({
  audienceNote,
  initialPreset: presetProp,
  audience: audienceProp,
  hideFilters,
}: {
  audienceNote?: string;
  initialPreset?: string;
  audience?: string;
  hideFilters?: boolean;
}) {
  const audienceParam = useAudienceParam();
  const presetParam = usePresetParam();
  const audience = audienceProp ?? audienceParam;
  const note = audienceNote ?? audienceMapNote(audience) ?? undefined;

  const initialPreset = useMemo(() => {
    if (presetProp && LAYER_PRESETS[presetProp]) return presetProp;
    if (presetParam && LAYER_PRESETS[presetParam]) return presetParam;
    const aud = AUDIENCE_PRESETS.find((a) => a.audience === audience);
    if (aud && LAYER_PRESETS[aud.preset]) return aud.preset;
    return "walkkm";
  }, [presetProp, presetParam, audience]);

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [data, setData] = useState<LayerData>({});
  const [visibility, setVisibility] = useState(() => {
    const base = defaultVisibility();
    const preset = LAYER_PRESETS[initialPreset]?.layers ?? LAYER_PRESETS.walkkm.layers;
    return { ...base, ...preset };
  });
  const [choropleth, setChoropleth] = useState<ChoroplethMode>(
    LAYER_PRESETS[initialPreset]?.choropleth ?? "stops"
  );
  const [loadingCore, setLoadingCore] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<string>(initialPreset);
  const [filters, setFilters] = useDashboardFilters({ unit: "ward" });
  const gapByLabelRef = useRef(new Map<string, { gap_index: number; gap_band: string }>());
  const {
    loading: loadingFilters,
    filtered,
    wardOptions,
    zoneOptions,
    cityMeanGap,
  } = useFilteredUniverse(filters);

  const ensureLayers = useCallback(
    async (m: Manifest, keys: MapLayerKey[]) => {
      const next = await loadLayerBatch(m, keys, gapByLabelRef.current, data);
      setData(next);
      return next;
    },
    [data]
  );

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
        gapByLabelRef.current = gapByLabel;

        if (!m) {
          if (!cancelled) setLoadingCore(false);
          return;
        }

        const presetLayers = layersForPreset(
          LAYER_PRESETS[initialPreset]?.layers ?? {}
        );
        const boot = Array.from(new Set([...BOOTSTRAP_LAYERS, ...presetLayers]));
        const core = await loadLayerBatch(m, boot, gapByLabel, {});
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = useCallback(
    (key: MapLayerKey) => {
      setVisibility((v) => {
        const nextOn = !v[key];
        if (nextOn && manifest && !data[key]) {
          void loadLayerBatch(manifest, [key], gapByLabelRef.current, data).then(setData);
        }
        return { ...v, [key]: nextOn };
      });
      setActivePreset("custom");
    },
    [manifest, data]
  );

  const applyPreset = useCallback(
    (id: string) => {
      const preset = LAYER_PRESETS[id];
      if (!preset) return;
      setActivePreset(id);
      setChoropleth(preset.choropleth);
      setVisibility((prev) => ({ ...prev, ...preset.layers }));
      if (manifest) {
        const keys = layersForPreset(preset.layers);
        void loadLayerBatch(manifest, keys, gapByLabelRef.current, data).then(setData);
      }
    },
    [manifest, data]
  );

  // Sync URL audience/preset when they change after mount
  useEffect(() => {
    if (presetParam && LAYER_PRESETS[presetParam] && presetParam !== activePreset) {
      applyPreset(presetParam);
    } else if (!presetParam && audience) {
      const aud = AUDIENCE_PRESETS.find((a) => a.audience === audience);
      if (aud && aud.preset !== activePreset) applyPreset(aud.preset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetParam, audience]);

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
      {!hideFilters ? (
        <>
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
        </>
      ) : null}

      <div className="no-print space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-3 shadow-sm sm:px-4">
        {note ? (
          <p className="rounded-md bg-[var(--accent-soft)] px-2 py-1 text-xs text-[var(--accent)]">
            {note}
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
            View
          </span>
          <div className="flex flex-wrap gap-1">
            {AUDIENCE_PRESETS.map((ap) => (
              <button
                key={ap.id}
                type="button"
                onClick={() => applyPreset(ap.preset)}
                className={`${chipBase} ${
                  activePreset === ap.preset ? chipOn : chipOff
                }`}
              >
                {ap.label}
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
                ["slum", "Slum"],
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

        <details className="border-t border-[var(--border)] pt-2.5">
          <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            Layers · {loadedCount} loaded
          </summary>
          <div className="mt-2 flex flex-wrap gap-1">
            {MAP_LAYER_META.filter(({ key }) => layerIsReady(manifest?.layers[key])).map(
              ({ key, label, short }) => {
                const on = visibility[key];
                return (
                  <button
                    key={key}
                    type="button"
                    title={label}
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
            <p className="mt-2 text-[10px] leading-snug text-[var(--ink-muted)]">
              Need lines = roads with long stretches &gt;400m from a stop.
            </p>
          ) : null}
          {loadingCore ? (
            <p className="mt-2 text-[10px] text-[var(--ink-muted)]">Loading…</p>
          ) : null}
        </details>
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
