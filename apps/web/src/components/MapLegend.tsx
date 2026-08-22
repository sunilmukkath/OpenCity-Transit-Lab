"use client";

import type { ChoroplethMode, MapLayerKey } from "@/lib/map-layers";

type Swatch =
  | { kind: "fill"; color: string; label: string }
  | { kind: "line"; color: string; label: string; dashed?: boolean }
  | { kind: "dot"; color: string; label: string }
  | { kind: "icon"; glyph: string; color: string; label: string };

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
      ) : item.kind === "icon" ? (
        <span
          className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[11px] font-bold leading-none"
          style={{ color: item.color }}
          aria-hidden
        >
          {item.glyph}
        </span>
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

  if (visibility.walk_isochrones) {
    sections.push({
      title: "Walk isochrones (OSM network)",
      items: [
        { kind: "fill", color: "#2dd4bf", label: "≤5 min" },
        { kind: "fill", color: "#eab308", label: "5–10 min" },
        { kind: "fill", color: "#f97316", label: "10–15 min" },
      ],
    });
  }

  if (visibility.wards) {
    if (choropleth === "slum") {
      sections.push({
        title: "Slum vs non-slum (GCC wards)",
        items: [
          { kind: "fill", color: "#38bdf8", label: "Non-slum" },
          { kind: "fill", color: "#fca5a5", label: "Slum (low share)" },
          { kind: "fill", color: "#ef4444", label: "Slum ≥10%" },
          { kind: "fill", color: "#b91c1c", label: "Slum ≥25%" },
        ],
      });
    } else if (choropleth === "walk") {
      sections.push({
        title: "Ward OSM walk to PT (GCC)",
        items: [
          { kind: "fill", color: "#14b8a6", label: "Shorter (~≤5 min)" },
          { kind: "fill", color: "#eab308", label: "About 5–10 min" },
          { kind: "fill", color: "#f97316", label: "Longer (~10+ min)" },
          { kind: "fill", color: "#f43f5e", label: "Longest walks" },
        ],
      });
    } else if (choropleth === "gap") {
      sections.push({
        title: "Ward Gap Index (inventory + walk)",
        items: [
          { kind: "fill", color: "#14b8a6", label: "Lower gap" },
          { kind: "fill", color: "#eab308", label: "Moderate" },
          { kind: "fill", color: "#f97316", label: "Higher" },
          { kind: "fill", color: "#f43f5e", label: "Severe" },
        ],
      });
    } else {
      sections.push({
        title: "Ward stop count (GCC)",
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

  if (visibility.nmt_network) {
    sections.push({
      title: "NMT (non-motorized · OSM Partial)",
      items: [
        { kind: "line", color: "#22d3ee", label: "Cycleway" },
        { kind: "line", color: "#a3e635", label: "Footway" },
        { kind: "line", color: "#84cc16", label: "Path / pedestrian" },
      ],
    });
  }

  const points: Swatch[] = [];
  if (visibility.stops) points.push({ kind: "dot", color: "#0369a1", label: "Bus stops (GTFS)" });
  if (visibility.bus_routes)
    points.push({ kind: "line", color: "#0284c7", label: "MTC bus routes (straight-line)" });
  if (visibility.mrts_stations) points.push({ kind: "dot", color: "#ea580c", label: "MRTS stations" });
  if (visibility.mrts_lines) points.push({ kind: "line", color: "#ea580c", label: "MRTS lines" });
  if (visibility.hubs) points.push({ kind: "dot", color: "#7c3aed", label: "CMRL metro hubs" });
  if (visibility.cmrl_phase2_line)
    points.push({ kind: "line", color: "#dc2626", label: "Proposed Red Line C5", dashed: true });
  if (visibility.cmrl_phase2_stations)
    points.push({ kind: "dot", color: "#dc2626", label: "Proposed C5 stations (Partial)" });
  if (visibility.outside_gcc_roads)
    points.push({ kind: "line", color: "#f59e0b", label: "Outside-GCC roads >400m from stop" });
  if (visibility.corridor_aois)
    points.push({ kind: "fill", color: "rgba(99,102,241,0.35)", label: "OMR / Tambaram / Chengalpattu AOIs" });
  if (visibility.walk_beyond_10min)
    points.push({ kind: "fill", color: "rgba(244,63,94,0.35)", label: "Beyond 10 min walk" });
  if (visibility.outside_gcc_settlements)
    points.push({ kind: "fill", color: "rgba(234,88,12,0.5)", label: "Settlements outside GCC" });
  if (visibility.outside_gcc_habitation)
    points.push({ kind: "dot", color: "#b45309", label: "Habitation outside GCC" });
  if (visibility.omr_south_rail_stations)
    points.push({ kind: "dot", color: "#6d28d9", label: "South / OMR rail stations" });
  if (visibility.railway_stations)
    points.push({ kind: "dot", color: "#a78bfa", label: "Suburban / IR stations" });
  if (visibility.tngis_settlement_area)
    points.push({ kind: "fill", color: "rgba(217,119,6,0.45)", label: "TNGIS settlements" });
  if (visibility.tngis_habitation)
    points.push({ kind: "dot", color: "#78350f", label: "TNGIS habitation" });
  if (visibility.omr_corridor) points.push({ kind: "line", color: "#7c3aed", label: "OMR → Mahabs" });
  if (visibility.metro_area_boundaries) {
    points.push({ kind: "fill", color: "rgba(219,39,119,0.35)", label: "South town areas" });
  }
  if (visibility.schools || visibility.healthcare || visibility.facility_pt_walk_links) {
    const items: Swatch[] = [];
    if (visibility.schools) items.push({ kind: "icon", glyph: "📖", color: "#2563eb", label: "School" });
    if (visibility.healthcare) items.push({ kind: "icon", glyph: "+", color: "#e11d48", label: "Hospital / UPHC" });
    items.push(
      { kind: "dot", color: "#2dd4bf", label: "≤5 min OSM walk" },
      { kind: "dot", color: "#eab308", label: "5–10 min" },
      { kind: "dot", color: "#f97316", label: "10–15 min" },
      { kind: "dot", color: "#f43f5e", label: ">15 min / unroutable" }
    );
    if (visibility.facility_pt_walk_links) {
      items.push({ kind: "line", color: "#eab308", label: "Link → nearest stop" });
    }
    sections.push({ title: "School / health walk to nearest PT", items });
  }
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
      {visibility.wards ? (
        <p className="mt-2 border-t border-slate-200 pt-1.5 text-[9px] leading-snug text-slate-500">
          GCC 2022 wards only (200). Avadi, Poonamallee, Kundrathur, Tiruvallur sit outside the
          corporation boundary — not missing polygons.
        </p>
      ) : null}
      {visibility.walk_isochrones ? (
        <p className="mt-2 border-t border-slate-200 pt-1.5 text-[9px] leading-snug text-slate-500">
          OSM pedestrian network to nearest GTFS stop/hub at 80 m/min (Partial). Not
          population-weighted.
        </p>
      ) : null}
      {visibility.connectivity_need ? (
        <p className="mt-2 border-t border-slate-200 pt-1.5 text-[9px] leading-snug text-slate-500">
          Need lines = OSM road stretches outside 400m of a GTFS stop (drawn only where there is
          no nearby PT). Inventory — not ridership.
        </p>
      ) : null}
      {visibility.outside_gcc_roads ? (
        <p className="mt-2 border-t border-slate-200 pt-1.5 text-[9px] leading-snug text-slate-500">
          Outside-GCC roads = major OSM ways beyond corporation wards, still &gt;400 m from a GTFS
          stop (Partial Overpass extract).
        </p>
      ) : null}
      {visibility.cmrl_phase2_stations || visibility.cmrl_phase2_line ? (
        <p className="mt-2 border-t border-slate-200 pt-1.5 text-[9px] leading-snug text-slate-500">
          Red Line C5 stations/line are curated approximations — not official CMRL CAD.
        </p>
      ) : null}
    </div>
  );
}

/** Keep MapLayerKey referenced for callers that pass visibility records. */
export type MapLegendVisibility = Partial<Record<MapLayerKey, boolean>>;
