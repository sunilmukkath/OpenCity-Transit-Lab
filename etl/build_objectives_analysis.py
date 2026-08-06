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
    dest_m = destinations.to_crs(3857)
    buf500 = _union_buffers(stops, 500)
    buf1000 = _union_buffers(stops, 1000)
    within_500 = dest_m.geometry.within(buf500)
    within_1000 = dest_m.geometry.within(buf1000)
    n = len(dest_m)
    n500 = int(within_500.sum())
    n1000 = int(within_1000.sum())
    over = n - n1000
    return {
        "status": "loaded",
        "destination": label,
        "total": n,
        "within_500m": n500,
        "within_1000m": n1000,
        "over_1000m": over,
        "pct_within_500m": round(100 * n500 / n, 1) if n else None,
        "pct_within_1000m": round(100 * n1000 / n, 1) if n else None,
        "pct_over_1000m": round(100 * over / n, 1) if n else None,
        "note": (
            f"Crow-flies distance from {label} points to nearest GTFS stop buffer. "
            "Not street-network walk; not ridership-weighted."
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
                "sec_proxy_band": s.get("sec_proxy_band"),
                "pct_slum_area": s.get("pct_slum_area"),
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
            "Cross-tab of Ward PT Index with Census amenity SEC proxy + slum area share. "
            "SEC is NOT household income. Equity claim limited to amenity/slum proxies."
        ),
        "reason": None,
    }


def build_objectives_analysis() -> dict[str, Any]:
    analyses_path = PROCESSED / "analyses.json"
    reports_path = PROCESSED / "reports.json"
    analyses = json.loads(analyses_path.read_text()) if analyses_path.exists() else {}
    reports = json.loads(reports_path.read_text()) if reports_path.exists() else {}

    walk = analyses.get("walk_distance_bands") or {}
    hubs = analyses.get("hub_last_mile") or {}
    need = analyses.get("connectivity_need") or {}
    sec = analyses.get("sec_proxy") or {}
    catchment = analyses.get("catchment_coverage") or {}

    stops = _load("stops.geojson")
    schools = _load("schools.geojson")
    healthcare = _load("healthcare.geojson")

    # 1. First / last mile walk gaps
    walk_obj: dict[str, Any] = {
        "id": "first_last_mile",
        "title": "First / last-mile walk connectivity gaps",
        "status": walk.get("status") or "unavailable",
        "summary": walk.get("note"),
        "chart": [],
        "metrics": walk.get("counts") or {},
        "method": walk.get("method") or {},
        "limitations": [
            "Crow-flies buffers, not street-network walks.",
            "NMT (footways/cycle) layer Unavailable — no verified citywide NMT network ingest.",
            "IPT (auto/share) layer Unavailable — no verified IPT stop inventory.",
        ],
    }
    if walk.get("counts"):
        c = walk["counts"]
        walk_obj["chart"] = [
            {"label": "Within 500m", "km2": c.get("within_500m_km2"), "color": "#86efac"},
            {"label": "500m–1km", "km2": c.get("band_500_1000m_km2"), "color": "#fde047"},
            {"label": "Over 1km", "km2": c.get("over_1000m_km2"), "color": "#dc2626"},
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
                "sec_proxy_band": s.get("sec_proxy_band"),
                "pct_slum_area": s.get("pct_slum_area"),
            }
        )

    cross = {"higher_proxy": [], "middle_proxy": [], "lower_proxy": [], "unknown": []}
    for r in full_rows:
        band = r.get("sec_proxy_band") or "unknown"
        if band not in cross:
            band = "unknown"
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
        "title": "Equal access across neighbourhoods (SEC / slum proxy)",
        "status": "partial" if full_rows and sec.get("status") == "loaded" else (
            "loaded" if full_rows else "unavailable"
        ),
        "summary": (
            "Compares Ward PT Index across SEC amenity proxy bands and slum area share. "
            "This is NOT household income or official poverty status."
        ),
        "sec_counts": sec.get("counts") or {},
        "chart": equity_chart,
        "underserved_examples": [
            r
            for r in sorted(full_rows, key=lambda x: (x.get("pt_index") or 0, -(x.get("pct_slum_area") or 0)))
            if (r.get("sec_proxy_band") == "lower_proxy" or (r.get("pct_slum_area") or 0) >= 10)
            and (r.get("pt_index") or 100) < 45
        ][:15],
        "limitations": [
            "No verified income surface at ward level.",
            "SEC proxy from Census 2011 amenities (wards 1–155) + OpenCity slum polygons.",
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
            "OpenCity school/health points — public vs private not always tagged; treated as facility inventory.",
            "Crow-flies to GTFS stops only.",
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
                    "pct_within_500m": block.get("pct_within_500m"),
                    "pct_within_1000m": block.get("pct_within_1000m"),
                    "pct_over_1000m": block.get("pct_over_1000m"),
                    "total": block.get("total"),
                }
            )
        dest["chart"] = chart
        dest["summary"] = (
            "Share of school and healthcare facility points within 500m / 1km crow-flies of a GTFS stop."
        )

    # 6. Congestion
    congestion = {
        "id": "congestion_pt",
        "title": "Congestion points vs public transport solutions",
        "status": "unavailable",
        "reason": (
            "No verified citywide congestion-point inventory with coordinates was in the "
            "Datajam Sheet 2 downloads (OpenCity crash CSV may exist separately but was not "
            "ingested as a congestion layer)."
        ),
        "needed": "Official congestion hotspot list or traffic-speed/delay layer joined to PT corridors.",
        "chart": [],
        "limitations": ["Cannot list congestion points without a validated source."],
    }

    # 7. Scheduling / travel patterns
    tabular_mtc = PROCESSED / "tabular_chennai_mtc_performance_data.json"
    tabular_metro = PROCESSED / "tabular_chennai_metro_monthly_usage_data.json"
    scheduling: dict[str, Any] = {
        "id": "scheduling_optimisation",
        "title": "PT scheduling from commute patterns",
        "status": "unavailable",
        "reason": (
            "No origin–destination or stop-level boarding time series suitable for a "
            "dynamic schedule model. MTC performance and metro monthly usage tables are "
            "aggregate only."
        ),
        "needed": "Stop/route ridership by time-of-day or GTFS-RT + validated OD sample.",
        "chart": [],
        "partial_tables": [],
        "limitations": ["Dynamic scheduling model not built — data gap."],
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
        scheduling["status"] = "partial"
        scheduling["chart"] = [
            {"label": p["name"], "rows": p.get("rows")} for p in scheduling["partial_tables"]
        ]

    # Recommendations synthesized from loaded objectives
    recommendations = []
    if walk.get("counts") and (walk["counts"].get("pct_over_1000m") or 0) > 0:
        recommendations.append(
            {
                "priority": "critical",
                "objective": "first_last_mile",
                "title": "Prioritise service where walk-to-stop exceeds 1km",
                "detail": (
                    f"About {walk['counts'].get('pct_over_1000m')}% of the extended study area "
                    f"({walk['counts'].get('over_1000m_km2')} km²) is crow-flies >1km from a stop/hub. "
                    "Use the Walk km map (red) and Need lines for feeder placement."
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
                "title": "Target lower-SEC / higher-slum wards with weak PT index",
                "detail": (
                    f"{len(equity['underserved_examples'])} example wards combine lower amenity proxy "
                    "or elevated slum share with weak Ward PT Index. Treat as indicative — verify on ground."
                ),
                "map_href": "/map",
            }
        )
    if dest.get("status") == "loaded" and dest.get("schools"):
        s = dest["schools"]
        recommendations.append(
            {
                "priority": "medium",
                "objective": "destinations_access",
                "title": "Close school / clinic gaps beyond 1km of stops",
                "detail": (
                    f"{s.get('pct_over_1000m')}% of mapped schools and "
                    f"{(dest.get('healthcare') or {}).get('pct_over_1000m')}% of healthcare points "
                    "sit >1km crow-flies from a GTFS stop. Overlay Destinations preset on Walk km."
                ),
                "map_href": "/map",
            }
        )
    recommendations.append(
        {
            "priority": "info",
            "objective": "congestion_pt",
            "title": "Congestion–PT linkage still Unavailable",
            "detail": congestion["reason"],
            "map_href": "/sources",
        }
    )
    recommendations.append(
        {
            "priority": "info",
            "objective": "scheduling_optimisation",
            "title": "Schedule optimisation needs time-of-day ridership",
            "detail": scheduling["reason"],
            "map_href": "/sources",
        }
    )

    out = {
        "generated_at": _now(),
        "note": (
            "Objectives analysis for OpenCity Datajam problem statements. "
            "Integrity rule: Unavailable / Partial when data is missing — no fabricated equity or ridership."
        ),
        "objectives": [
            walk_obj,
            interchange,
            equity,
            ward_index,
            dest,
            congestion,
            scheduling,
        ],
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
