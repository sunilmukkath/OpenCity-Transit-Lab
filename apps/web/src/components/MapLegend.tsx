"use client";

import type { ChoroplethMode, MapLayerKey } from "@/lib/map-layers";

type Swatch =
  | { kind: "fill"; color: string; label: string }
  | { kind: "line"; color: string; label: string; dashed?: boolean }
  | { kind: "dot"; color: string; label: string };

function SwatchRow({ item }: { item: Swatch }) {
  return (
    <li className="flex items-center gap-2 text-[10px] leading-tight text-slate-700">
      {item.kind === "fill" ? (
        <span
          className="h-3 w-3 shrink-0 rounded-sm border border-slate-400/60"
          style={{ background: item.color }}
        />
      ) : item.kind === "line" ? (
        <span
          className="h-0 w-4 shrink-0 border-t-2"
          style={{
            borderColor: item.color,
            borderStyle: item.dashed ? "dashed" : "solid",
          }}
        />
      ) : (
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow-sm"
          style={{ background: item.color }}
        />
      )}
      <span>{item.label}</span>
    </li>
  );
}

export function MapLegend({
  visibility,
  choropleth,
}: {
  visibility: Record<string, boolean>;
  choropleth: ChoroplethMode;
}) {
  const sections: { title: string; items: Swatch[] }[] = [];

  if (visibility.walk_distance_bands) {
    sections.push({
      title: "Walk to stop / hub",
      items: [
        { kind: "fill", color: "#2dd4bf", label: "Within 100m" },
        { kind: "fill", color: "#86efac", label: "100m – 500m" },
        { kind: "fill", color: "#fde047", label: "500m – 1km" },
        { kind: "fill", color: "#dc2626", label: "Over 1km (priority)" },
      ],
    });
  }

  if (visibility.wards) {
    if (choropleth === "slum") {
      sections.push({
        title: "Slum vs non-slum",
        items: [
          { kind: "fill", color: "#64748b", label: "Non-slum" },
          { kind: "fill", color: "#fca5a5", label: "Slum (low share)" },
          { kind: "fill", color: "#ef4444", label: "Slum ≥10%" },
          { kind: "fill", color: "#b91c1c", label: "Slum ≥25%" },
        ],
      });
    } else if (choropleth === "gap") {
      sections.push({
        title: "Ward Gap Index",
        items: [
          { kind: "fill", color: "#14b8a6", label: "Lower gap" },
          { kind: "fill", color: "#eab308", label: "Moderate" },
          { kind: "fill", color: "#e11d48", label: "Higher gap" },
        ],
      });
    } else {
      sections.push({
        title: "Ward stop count",
        items: [
          { kind: "fill", color: "#bfdbfe", label: "Fewer stops" },
          { kind: "fill", color: "#0369a1", label: "More stops" },
        ],
      });
    }
  }

  if (visibility.connectivity_need) {
    sections.push({
      title: "Need lines (service gaps)",
      items: [
        {
          kind: "line",
          color: "#ff2d55",
          label: "Urgent — long road stretches >400m from a stop",
        },
        {
          kind: "line",
          color: "#ff8a1f",
          label: "Priority — medium unmet length",
        },
        {
          kind: "line",
          color: "#facc15",
          label: "Watch — shorter gaps to monitor",
        },
      ],
    });
  }

  const points: Swatch[] = [];
  if (visibility.stops) points.push({ kind: "dot", color: "#0369a1", label: "Bus stops (GTFS)" });
  if (visibility.mrts_stations) points.push({ kind: "dot", color: "#ea580c", label: "MRTS stations" });
  if (visibility.mrts_lines) points.push({ kind: "line", color: "#ea580c", label: "MRTS lines" });
  if (visibility.hubs) points.push({ kind: "dot", color: "#7c3aed", label: "CMRL metro hubs" });
  if (visibility.railway_stations)
    points.push({ kind: "dot", color: "#a78bfa", label: "Suburban / IR stations" });
  if (visibility.omr_corridor) points.push({ kind: "line", color: "#7c3aed", label: "OMR → Mahabs" });
  if (visibility.metro_area_boundaries) {
    points.push({ kind: "fill", color: "rgba(219,39,119,0.35)", label: "South town areas" });
  }
  if (visibility.schools) points.push({ kind: "dot", color: "#2563eb", label: "Schools" });
  if (visibility.healthcare) points.push({ kind: "dot", color: "#e11d48", label: "Healthcare" });
  if (visibility.parks) points.push({ kind: "dot", color: "#16a34a", label: "Parks" });
  if (visibility.public_toilets) points.push({ kind: "dot", color: "#0d9488", label: "Public toilets" });
  if (visibility.anganwadis) points.push({ kind: "dot", color: "#c026d3", label: "Anganwadis" });
  if (visibility.bus_stop_audit) points.push({ kind: "dot", color: "#b45309", label: "Stop audit" });
  if (points.length) {
    sections.push({ title: "Network & destinations", items: points });
  }

  if (!sections.length) return null;

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-20 max-w-[260px] rounded-md border border-slate-300 bg-white/95 px-2.5 py-2 shadow-sm">
      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        Legend
      </p>
      <div className="max-h-[42vh] space-y-2 overflow-y-auto pr-0.5">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="mb-0.5 text-[9px] font-semibold text-slate-800">{section.title}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <SwatchRow key={`${section.title}-${item.label}`} item={item} />
              ))}
            </ul>
          </div>
        ))}
      </div>
      {visibility.walk_distance_bands ? (
        <p className="mt-2 border-t border-slate-200 pt-1.5 text-[9px] leading-snug text-slate-500">
          Crow-flies to existing stops/hubs. Includes OMR south of GCC. Proposed metro
          stations not in data.
        </p>
      ) : null}
      {visibility.connectivity_need ? (
        <p className="mt-2 border-t border-slate-200 pt-1.5 text-[9px] leading-snug text-slate-500">
          Need lines = OSM roads (plus a few feeder desire lines) with long stretches outside
          400m of a GTFS stop — where mid-block stops or feeders may help.
        </p>
      ) : null}
    </div>
  );
}

/** Keep MapLayerKey referenced for callers that pass visibility records. */
export type MapLegendVisibility = Partial<Record<MapLayerKey, boolean>>;
