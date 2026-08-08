#!/usr/bin/env python3
"""
Build objectives_analysis.json for Datajam problem statements.

Uses verified layers only. Marks NMT/IPT street-network, congestion, and
dynamic scheduling as unavailable when source data is missing.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
WEB = ROOT / "apps" / "web" / "public" / "data"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load(name: str) -> gpd.GeoDataFrame | None:
    path = PROCESSED / name
    if not path.exists():
        path = WEB / name
    if not path.exists():
        return None
    try:
        gdf = gpd.read_file(path)
        return None if gdf.empty else gdf
    except Exception:  # noqa: BLE001
        return None


def _union_buffers(points: gpd.GeoDataFrame, meters: float):
    m = points.to_crs(3857)
    return unary_union(list(m.geometry.buffer(meters).values)).buffer(0)


def destination_access(
    destinations: gpd.GeoDataFrame,
    stops: gpd.GeoDataFrame,
    label: str,
) -> dict[str, Any]:
    """Facility access to PT — primary threshold 100m (schools/hospitals)."""
    dest_m = destinations.to_crs(3857)
    buf100 = _union_buffers(stops, 100)
    buf500 = _union_buffers(stops, 500)
    within_100 = dest_m.geometry.within(buf100)
    within_500 = dest_m.geometry.within(buf500)
    n = len(dest_m)
    n100 = int(within_100.sum())
    n500 = int(within_500.sum())
    over_100 = n - n100
    return {
        "status": "loaded",
        "destination": label,
        "total": n,
        "threshold_m": 100,
        "within_100m": n100,
        "within_500m": n500,
        "over_100m": over_100,
        "pct_within_100m": round(100 * n100 / n, 1) if n else None,
        "pct_within_500m": round(100 * n500 / n, 1) if n else None,
        "pct_over_100m": round(100 * over_100 / n, 1) if n else None,
        # legacy keys kept for older UI (map 100m primary into former 500 slot)
        "within_1000m": n500,
        "over_1000m": over_100,
        "pct_within_1000m": round(100 * n500 / n, 1) if n else None,
        "pct_over_1000m": round(100 * over_100 / n, 1) if n else None,
        "note": (
            f"Crow-flies: share of {label} within 100m of a GTFS stop (primary), "
            "with 500m as secondary context. Not street-network walk."
        ),
    }


def ward_pt_index(reports: dict[str, Any], sec: dict[str, Any] | None) -> dict[str, Any]:
    wards = reports.get("wards") or []
    if not wards:
        return {"status": "unavailable", "reason": "reports.wards missing"}

    rows = []
    sec_by = {}
    if sec and sec.get("wards"):
        for w in sec["wards"]:
            sec_by[str(w.get("label"))] = w

    for w in wards:
        label = str(w.get("label"))
        gap = w.get("gap_index")
        if gap is None:
            continue
        # PT access index 0–100 = inverse of Gap Index (higher = better inventory access)
        pt_index = round(max(0.0, min(100.0, 100.0 - float(gap))), 1)
        s = sec_by.get(label) or {}
        rows.append(
            {
                "label": label,
                "pt_index": pt_index,
                "gap_index": round(float(gap), 1),
                "gap_band": w.get("gap_band"),
                "stop_count": w.get("stop_count"),
                "shelter_count": w.get("shelter_count"),
                "hub_count": w.get("hub_count"),
                "has_slum": bool(s.get("has_slum")),
                "pct_slum_area": s.get("pct_slum_area"),
                "slum_band": s.get("slum_band"),
            }
        )

    rows.sort(key=lambda r: r["pt_index"])
    bands = {"low": 0, "moderate": 0, "high": 0, "very_high": 0}
    for r in rows:
        v = r["pt_index"]
        if v < 40:
            bands["low"] += 1
        elif v < 55:
            bands["moderate"] += 1
        elif v < 70:
            bands["high"] += 1
        else:
            bands["very_high"] += 1

    return {
        "status": "loaded",
        "note": (
            "Ward Public Transport Index = 100 − Gap Index (inventory of stops, "
            "shelters, hubs, density). Not ridership or income. Lower index = weaker inventory access."
        ),
        "counts": {
            "wards_scored": len(rows),
            "mean_pt_index": round(sum(r["pt_index"] for r in rows) / len(rows), 1) if rows else None,
            **{f"band_{k}": v for k, v in bands.items()},
        },
        "band_chart": [
            {"band": "low (<40)", "count": bands["low"]},
            {"band": "moderate (40–55)", "count": bands["moderate"]},
            {"band": "high (55–70)", "count": bands["high"]},
            {"band": "very high (≥70)", "count": bands["very_high"]},
        ],
        "lowest_wards": rows[:20],
        "highest_wards": list(reversed(rows[-10:])),
    }


def equity_access(pt: dict[str, Any]) -> dict[str, Any]:
    wards = pt.get("lowest_wards") or []
    all_rows = (pt.get("lowest_wards") or []) + (pt.get("highest_wards") or [])
    # Rebuild from lowest+highest is incomplete — use file if we stored full; recompute from lowest_wards only for cross is weak
    # Better: re-read from pt by expanding — we'll store full table lightly
    return {
        "status": "partial" if pt.get("status") == "loaded" else "unavailable",
        "note": (
            "Cross-tab of Ward PT Index with OpenCity slum vs non-slum wards. "
            "Not household income. Equity claim limited to slum polygon area share."
        ),
        "reason": None,
    }


def build_objectives_analysis() -> dict[str, Any]:
    analyses_path = PROCESSED / "analyses.json"
    reports_path = PROCESSED / "reports.json"
    analyses = json.loads(analyses_path.read_text()) if analyses_path.exists() else {}
    reports = json.loads(reports_path.read_text()) if reports_path.exists() else {}

    walk = analyses.get("walk_isochrones") or {}
    hubs = analyses.get("hub_last_mile") or {}
    need = analyses.get("connectivity_need") or {}
    sec = analyses.get("sec_proxy") or {}
    catchment = analyses.get("catchment_coverage") or {}

    stops = _load("stops.geojson")
    schools = _load("schools.geojson")
    healthcare = _load("healthcare.geojson")

    # 1. First / last mile walk gaps (OSM network isochrones)
    walk_obj: dict[str, Any] = {
        "id": "first_last_mile",
        "title": "First / last-mile walk connectivity gaps",
        "status": walk.get("status") or "unavailable",
        "summary": walk.get("note"),
        "chart": [],
        "metrics": walk.get("counts") or {},
        "method": walk.get("method") or {},
        "limitations": [
            "OSM pedestrian network isochrones at 80 m/min — Partial completeness.",
            "NMT (footways/cycle) layer Unavailable — no verified citywide NMT network ingest.",
            "IPT (auto/share) layer Unavailable — no verified IPT stop inventory.",
        ],
    }
    if walk.get("counts"):
        c = walk["counts"]
        walk_obj["chart"] = [
            {"label": "≤5 min", "km2": c.get("within_5min_km2"), "color": "#2dd4bf"},
            {"label": "5–10 min", "km2": c.get("band_5_10min_km2"), "color": "#eab308"},
            {"label": "10–15 min", "km2": c.get("band_10_15min_km2"), "color": "#f97316"},
        ]

    # 2. Interchange integration
    weak = (hubs.get("priority_hubs") or hubs.get("hubs") or [])[:15]
    if hubs.get("hubs"):
        weak = sorted(
            [h for h in hubs["hubs"] if h.get("in_chennai_core")],
            key=lambda h: h.get("last_mile_score") or 0,
            reverse=True,
        )[:15]
    interchange: dict[str, Any] = {
        "id": "interchange_integration",
        "title": "Poorly integrated interchanges (bus ↔ metro / MRTS / rail)",
        "status": hubs.get("status") or "unavailable",
        "summary": hubs.get("note")
        or "Hub last-mile scores from distance to nearest GTFS stops and shelter counts.",
        "metrics": hubs.get("counts") or {},
        "chart": [
            {"label": "Weak hubs (core)", "count": (hubs.get("counts") or {}).get("weak_hubs_chennai_core")},
            {"label": "Moderate", "count": (hubs.get("counts") or {}).get("moderate_hubs")},
            {"label": "Strong", "count": (hubs.get("counts") or {}).get("strong_hubs")},
        ],
        "need_lines": {
            "status": need.get("status"),
            "urgent": (need.get("counts") or {}).get("urgent"),
            "priority": (need.get("counts") or {}).get("priority"),
            "top_corridors": (need.get("corridors") or [])[:10],
        },
        "weak_hubs": [
            {
                "label": h.get("label"),
                "hub_type": h.get("hub_type"),
                "last_mile_score": h.get("last_mile_score"),
                "nearest_stop_m": h.get("nearest_stop_m"),
                "stops_within_300m": h.get("stops_within_300m"),
            }
            for h in weak
        ],
        "limitations": [
            "Suburban rail vs MRTS typing is name/geometry based from available hubs.",
            "Does not measure timed transfers or fare integration.",
        ],
    }

    # 3 + 4. Equity + ward PT index
    pt = ward_pt_index(reports, sec if sec.get("status") == "loaded" else None)
    # Full ward rows for equity cross — rebuild
    full_rows = []
    sec_by = {str(w.get("label")): w for w in (sec.get("wards") or [])}
    for w in reports.get("wards") or []:
        label = str(w.get("label"))
        gap = w.get("gap_index")
        if gap is None:
            continue
        s = sec_by.get(label) or {}
        full_rows.append(
            {
                "label": label,
                "pt_index": round(max(0.0, min(100.0, 100.0 - float(gap))), 1),
                "gap_index": round(float(gap), 1),
                "has_slum": bool(s.get("has_slum")),
                "pct_slum_area": s.get("pct_slum_area"),
                "slum_band": s.get("slum_band"),
            }
        )

    cross = {"slum": [], "non_slum": []}
    for r in full_rows:
        band = "slum" if r.get("has_slum") else "non_slum"
        cross[band].append(r["pt_index"])

    equity_chart = []
    for band, vals in cross.items():
        if not vals:
            continue
        equity_chart.append(
            {
                "band": band,
                "ward_count": len(vals),
                "mean_pt_index": round(sum(vals) / len(vals), 1),
                "pct_low_pt": round(100 * sum(1 for v in vals if v < 40) / len(vals), 1),
            }
        )

    equity: dict[str, Any] = {
        "id": "equal_access",
        "title": "Equal access across neighbourhoods (slum vs non-slum)",
        "status": "partial" if full_rows and sec.get("status") == "loaded" else (
            "loaded" if full_rows else "unavailable"
        ),
        "summary": (
            "Compares Ward PT Index for slum vs non-slum wards using OpenCity slum polygon "
            "area share. This is NOT household income or official poverty status."
        ),
        "slum_counts": {
            "slum_wards": sum(1 for r in full_rows if r.get("has_slum")),
            "non_slum_wards": sum(1 for r in full_rows if not r.get("has_slum")),
            "high_slum_share": sum(1 for r in full_rows if (r.get("pct_slum_area") or 0) >= 10),
        },
        "chart": equity_chart,
        "underserved_examples": [
            r
            for r in sorted(
                full_rows,
                key=lambda x: (x.get("pt_index") or 0, -(x.get("pct_slum_area") or 0)),
            )
            if r.get("has_slum") and (r.get("pt_index") or 100) < 45
        ][:15],
        "limitations": [
            "No verified income surface at ward level.",
            "Slum flag = OpenCity slum polygon intersection with GCC wards (area share).",
        ],
    }

    ward_index = {
        "id": "ward_pt_index",
        "title": "Ward-level public transport index",
        "status": pt.get("status"),
        "summary": pt.get("note"),
        "metrics": pt.get("counts"),
        "chart": pt.get("band_chart"),
        "lowest_wards": pt.get("lowest_wards"),
        "highest_wards": pt.get("highest_wards"),
        "limitations": [
            "Inventory index only (stops/shelters/hubs/density).",
            "Not schedule reliability or passenger load.",
        ],
    }

    # 5. Schools & healthcare access
    dest: dict[str, Any] = {
        "id": "destinations_access",
        "title": "PT access to schools and healthcare",
        "status": "unavailable",
        "schools": None,
        "healthcare": None,
        "chart": [],
        "limitations": [
            "Primary access standard: 100m crow-flies to a GTFS stop.",
            "OpenCity school/health points — public vs private not always tagged; treated as facility inventory.",
            "Not street-network walk time.",
        ],
    }
    if stops is not None and schools is not None:
        dest["schools"] = destination_access(schools, stops, "schools")
    if stops is not None and healthcare is not None:
        dest["healthcare"] = destination_access(healthcare, stops, "healthcare")
    if dest["schools"] or dest["healthcare"]:
        dest["status"] = "loaded"
        chart = []
        for block in (dest["schools"], dest["healthcare"]):
            if not block:
                continue
            chart.append(
                {
                    "destination": block["destination"],
                    "pct_within_100m": block.get("pct_within_100m"),
                    "pct_within_500m": block.get("pct_within_500m"),
                    "pct_over_100m": block.get("pct_over_100m"),
                    "total": block.get("total"),
                    "within_100m": block.get("within_100m"),
                    "over_100m": block.get("over_100m"),
                }
            )
        dest["chart"] = chart
        dest["metrics"] = {
            "schools_pct_within_100m": (dest.get("schools") or {}).get("pct_within_100m"),
            "schools_over_100m": (dest.get("schools") or {}).get("over_100m"),
            "healthcare_pct_within_100m": (dest.get("healthcare") or {}).get("pct_within_100m"),
            "healthcare_over_100m": (dest.get("healthcare") or {}).get("over_100m"),
        }
        dest["summary"] = (
            "Share of school and healthcare points within 100m crow-flies of a GTFS stop "
            "(primary standard for facility access). 500m shown as secondary context."
        )

    # 6. Congestion / mobility plan (from CMP PDF when available)
    cmp_path = PROCESSED / "cmp_mobility_insights.json"
    congestion: dict[str, Any] = {
        "id": "congestion_pt",
        "title": "Congestion corridors & PT responses (CMP)",
        "status": "unavailable",
        "reason": "CMP PDF not ingested yet.",
        "chart": [],
        "limitations": [],
    }
    if cmp_path.exists():
        cmp = json.loads(cmp_path.read_text())
        if cmp.get("status") == "loaded":
            congestion = {
                "id": "congestion_pt",
                "title": "Congestion corridors & PT responses (CMP)",
                "status": "loaded",
                "summary": cmp.get("note"),
                "document": cmp.get("document"),
                "insights": cmp.get("insights") or [],
                "corridors_mentioned": cmp.get("corridors_mentioned") or [],
                "pt_measures_mentioned": cmp.get("pt_measures_mentioned") or [],
                "chart": [
                    {"label": c, "count": 1}
                    for c in (cmp.get("corridors_mentioned") or [])[:12]
                ],
                "metrics": {
                    "corridors_named": len(cmp.get("corridors_mentioned") or []),
                    "pt_measures_named": len(cmp.get("pt_measures_mentioned") or []),
                    "cmp_pages": (cmp.get("document") or {}).get("pages"),
                },
                "limitations": [
                    "Corridor names from CMP text — not a geocoded hotspot inventory.",
                    "No live speed/delay layer joined yet.",
                ],
            }

    # 7. Fleet / ridership trends (aggregate tables) — only if tables exist
    # Dynamic OD scheduling is omitted until time-of-day data exists.
    tabular_mtc = PROCESSED / "tabular_chennai_mtc_performance_data.json"
    tabular_metro = PROCESSED / "tabular_chennai_metro_monthly_usage_data.json"
    scheduling: dict[str, Any] | None = {
        "id": "fleet_ridership_trends",
        "title": "MTC & metro ridership / fleet trends",
        "status": "unavailable",
        "chart": [],
        "partial_tables": [],
        "limitations": [
            "Aggregate annual/monthly tables only — not stop-level OD for dynamic scheduling.",
        ],
    }
    for path, name in (
        (tabular_mtc, "MTC performance (aggregate)"),
        (tabular_metro, "Metro monthly usage (aggregate)"),
    ):
        if path.exists():
            t = json.loads(path.read_text())
            scheduling["partial_tables"].append(
                {
                    "name": name,
                    "rows": t.get("rows"),
                    "columns": (t.get("columns") or [])[:8],
                    "file": path.name,
                }
            )
    if scheduling["partial_tables"]:
        scheduling["status"] = "loaded"
        scheduling["summary"] = (
            "Verified aggregate MTC performance and CMRL monthly passenger-flow tables. "
            "Useful for trend context — not a schedule-optimisation model."
        )
        scheduling["chart"] = [
            {"label": p["name"], "rows": p.get("rows")} for p in scheduling["partial_tables"]
        ]
    else:
        scheduling = None

    # Economic census equity enrichment
    ec_path = PROCESSED / "economic_census_wards.json"
    if ec_path.exists():
        ec = json.loads(ec_path.read_text())
        if ec.get("status") == "loaded":
            equity["status"] = "loaded"
            equity["summary"] = (
                "Ward PT Index by slum vs non-slum, plus Economic Census establishment "
                "& worker activity by ward code."
            )
            equity["economic_census"] = {
                "status": "loaded",
                "counts": ec.get("counts"),
                "chart": ec.get("chart"),
                "high_activity_low_pt": ec.get("high_activity_low_pt"),
                "note": ec.get("note"),
            }
            if ec.get("chart"):
                equity["chart"] = (equity.get("chart") or []) + [
                    {
                        "band": f"EC:{c['band']}",
                        "ward_count": c["ward_count"],
                        "mean_pt_index": c["mean_pt_index"],
                        "pct_low_pt": c.get("pct_low_pt"),
                    }
                    for c in ec["chart"]
                ]
            equity["limitations"] = [
                "Economic Census WC→GCC ward_label join is best-effort (District=2 / State=33).",
                "EC measures establishments/workers — not household income.",
                "Slum flag = OpenCity slum polygon intersection with GCC wards.",
            ]

    # Recommendations synthesized from loaded objectives
    recommendations = []
    if walk.get("counts") and (walk["counts"].get("pct_within_5min") or 0) >= 0:
        pct5 = walk["counts"].get("pct_within_5min")
        km5 = walk["counts"].get("within_5min_km2")
        recommendations.append(
            {
                "priority": "critical",
                "objective": "first_last_mile",
                "title": "Expand coverage beyond 5-minute walk isochrones",
                "detail": (
                    f"About {pct5}% of the study area ({km5} km²) is within a 5-minute OSM walk "
                    "of a stop/hub. Use Isochrones + Need lines on the map for feeder placement."
                ),
                "map_href": "/map",
            }
        )
    if (hubs.get("counts") or {}).get("weak_hubs_chennai_core"):
        recommendations.append(
            {
                "priority": "high",
                "objective": "interchange_integration",
                "title": "Fix weak last-mile hubs in Chennai core",
                "detail": (
                    f"{hubs['counts']['weak_hubs_chennai_core']} core hubs score weak on feeder access. "
                    "Co-locate bus stops/shelters within ~300m of metro/MRTS/rail hubs."
                ),
                "map_href": "/map",
            }
        )
    if equity.get("underserved_examples"):
        recommendations.append(
            {
                "priority": "high",
                "objective": "equal_access",
                "title": "Target slum wards with weak PT index",
                "detail": (
                    f"{len(equity['underserved_examples'])} example slum wards also show weak "
                    "Ward PT Index. Treat as indicative — verify on ground."
                ),
                "map_href": "/map",
            }
        )
    if (equity.get("economic_census") or {}).get("high_activity_low_pt"):
        n = len(equity["economic_census"]["high_activity_low_pt"])
        recommendations.append(
            {
                "priority": "high",
                "objective": "equal_access",
                "title": "High economic activity wards with weak PT index",
                "detail": (
                    f"{n} wards show elevated Economic Census establishments/workers but PT index <45. "
                    "Prioritise feeder / stop densification where jobs cluster."
                ),
                "map_href": "/objectives#equal_access",
            }
        )
    if dest.get("status") == "loaded" and dest.get("schools"):
        s = dest["schools"]
        h = dest.get("healthcare") or {}
        recommendations.append(
            {
                "priority": "medium",
                "objective": "destinations_access",
                "title": "Bring stops within 100m of schools and clinics still outside range",
                "detail": (
                    f"{s.get('pct_over_100m')}% of mapped schools ({s.get('over_100m')} sites) and "
                    f"{h.get('pct_over_100m')}% of healthcare points ({h.get('over_100m')} sites) "
                    "sit >100m crow-flies from a GTFS stop. Use Destinations preset on the map."
                ),
                "map_href": "/map",
            }
        )
    if congestion.get("status") == "loaded":
        recommendations.append(
            {
                "priority": "medium",
                "objective": "congestion_pt",
                "title": "Align feeders with CMP congestion corridors + NMT",
                "detail": (
                    "CMP names radial/IT corridors and flags missing footpaths (~95% surveyed roads). "
                    f"PT levers cited: {', '.join((congestion.get('pt_measures_mentioned') or [])[:5]) or 'metro/MRTS/BRT/NMT'}."
                ),
                "map_href": "/objectives#congestion_pt",
            }
        )

    objectives = [
        walk_obj,
        interchange,
        equity,
        ward_index,
        dest,
        congestion,
    ]
    if scheduling is not None and scheduling.get("status") == "loaded":
        objectives.append(scheduling)

    # Drop any remaining unavailable objectives from the published list
    objectives = [o for o in objectives if o.get("status") in ("loaded", "partial")]

    out = {
        "generated_at": _now(),
        "note": (
            "Objectives analysis for OpenCity Datajam problem statements. "
            "Only objectives with verified data are shown — empty Unavailable sections are omitted."
        ),
        "objectives": objectives,
        "recommendations": recommendations,
        "catchment_coverage": {
            "status": catchment.get("status"),
            "city_mean_pct_outside_400m": catchment.get("city_mean_pct_outside_400m"),
            "counts": catchment.get("counts"),
        },
    }

    PROCESSED.mkdir(parents=True, exist_ok=True)
    WEB.mkdir(parents=True, exist_ok=True)
    text = json.dumps(out, indent=2)
    (PROCESSED / "objectives_analysis.json").write_text(text)
    (WEB / "objectives_analysis.json").write_text(text)

    # Also attach to analyses.json
    if analyses_path.exists():
        analyses["objectives"] = {
            "status": "loaded",
            "file": "objectives_analysis.json",
            "generated_at": out["generated_at"],
        }
        analyses_path.write_text(json.dumps(analyses, indent=2))
        (WEB / "analyses.json").write_bytes(analyses_path.read_bytes())

    return out


def main() -> None:
    out = build_objectives_analysis()
    print(
        json.dumps(
            {
                "objectives": [o["id"] + ":" + str(o.get("status")) for o in out["objectives"]],
                "recommendations": len(out["recommendations"]),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
