#!/usr/bin/env python3
"""
Authority-facing coverage assessment — unifies existing walk isochrones,
catchment coverage, CMRL Phase II scenario, outside-GCC OSM, and SIR electors.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
WEB = ROOT / "apps" / "web" / "public" / "data"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _copy_web(name: str) -> None:
    src = PROCESSED / name
    if src.exists():
        WEB.mkdir(parents=True, exist_ok=True)
        (WEB / name).write_bytes(src.read_bytes())


def _load_json(name: str) -> dict[str, Any] | None:
    for base in (PROCESSED, WEB):
        path = base / name
        if path.exists():
            try:
                return json.loads(path.read_text())
            except Exception:  # noqa: BLE001
                continue
    return None


def build() -> dict[str, Any]:
    analyses = _load_json("analyses.json") or {}
    walk = analyses.get("walk_isochrones") or _load_json("walk_isochrones_meta.json") or {}
    # walk analysis may live only under analyses
    if not walk.get("counts") and (PROCESSED / "analyses.json").exists():
        walk = analyses.get("walk_isochrones") or {}

    catchment = analyses.get("catchment_coverage") or {}
    need = analyses.get("connectivity_need") or {}
    cmrl = analyses.get("cmrl_phase2_scenario") or _load_json("cmrl_phase2_scenario.json") or {}
    outside = analyses.get("outside_gcc_osm") or _load_json("outside_gcc_osm_meta.json") or {}
    omr_ctx = analyses.get("outside_gcc_omr_context") or _load_json("outside_gcc_omr_context.json") or {}
    sir = _load_json("sir_chennai_summary.json") or {}
    objectives = _load_json("objectives_analysis.json") or {}
    first_mile = next(
        (o for o in (objectives.get("objectives") or []) if o.get("id") == "first_last_mile"),
        None,
    )

    walk_counts = walk.get("counts") or {}
    study_km2 = (walk.get("study") or {}).get("study_area_km2") or walk_counts.get("study_area_km2")

    existing_5 = None
    if cmrl.get("scenarios", {}).get("existing", {}).get("pct_within_5min") is not None:
        existing_5 = cmrl["scenarios"]["existing"]["pct_within_5min"]
    elif walk_counts.get("pct_within_5min") is not None:
        existing_5 = walk_counts.get("pct_within_5min")
    elif walk_counts.get("within_5min_km2") and study_km2:
        existing_5 = round(100 * walk_counts["within_5min_km2"] / study_km2, 1)

    plus_5 = (cmrl.get("scenarios") or {}).get("existing_plus_c5", {}).get("pct_within_5min")

    summary = {
        "status": "partial",
        "generated_at": _now(),
        "title": "Authority coverage assessment — Chennai PT",
        "note": (
            "Unified coverage view for partners/authorities. Combines GCC ward catchments, "
            "OSM walk isochrones over GCC∪OMR study area, outside-GCC road gaps, and a "
            "Partial CMRL Phase II Corridor 5 (Red Line) walk scenario. "
            "No fabricated ridership. Proposed metro coordinates are curated approximations."
        ),
        "study_area": {
            "description": "GCC 2022 wards ∪ OMR corridor buffer ∪ south-town AOIs (not full CMA)",
            "study_area_km2": study_km2,
            "gcc_wards": 200,
        },
        "kpis": {
            "pct_study_within_5min_walk_existing": existing_5,
            "pct_study_within_5min_walk_plus_c5": plus_5,
            "delta_pct_5min_with_c5": cmrl.get("delta_pct_within_5min"),
            "city_mean_pct_outside_400m_wards": catchment.get("city_mean_pct_outside_400m"),
            "high_catchment_gap_wards": (catchment.get("counts") or {}).get("high_gap_wards"),
            "need_line_corridors": (need.get("counts") or {}).get("corridors_mapped")
            or (need.get("counts") or {}).get("urgent"),
            "outside_gcc_unmet_km_shown": (outside.get("counts") or {}).get("top_unmet_km_shown"),
            "outside_gcc_road_km": (outside.get("counts") or {}).get("outside_gcc_road_km"),
            "omr_beyond_10min_km2": (omr_ctx.get("counts") or {}).get("omr_beyond_10min_km2"),
            "omr_settlement_beyond_10min_km2": (omr_ctx.get("counts") or {}).get(
                "omr_settlement_beyond_10min_km2"
            ),
            "omr_south_rail_stations": (omr_ctx.get("counts") or {}).get("omr_south_rail_stations"),
            "cmrl_c5_proposed_stations": cmrl.get("proposed_stations"),
            "sir_chennai_district_electors": sir.get("chennai_district_electors_total"),
            "sir_map_electors": sir.get("map_electors_total"),
        },
        "blocks": {
            "walk_isochrones": {
                "status": walk.get("status") or ("partial" if walk_counts else "unavailable"),
                "counts": walk_counts,
                "note": walk.get("note"),
            },
            "catchment_coverage": {
                "status": catchment.get("status"),
                "counts": catchment.get("counts"),
                "city_mean_pct_outside_400m": catchment.get("city_mean_pct_outside_400m"),
                "note": catchment.get("note"),
            },
            "cmrl_phase2_scenario": {
                "status": cmrl.get("status"),
                "delta_pct_within_5min": cmrl.get("delta_pct_within_5min"),
                "scenarios": cmrl.get("scenarios"),
                "proposed_stations": cmrl.get("proposed_stations"),
                "note": cmrl.get("note"),
                "limitation": cmrl.get("limitation"),
            },
            "outside_gcc_osm": {
                "status": outside.get("status"),
                "counts": outside.get("counts"),
                "note": outside.get("note"),
            },
            "outside_gcc_omr_context": {
                "status": omr_ctx.get("status"),
                "note": omr_ctx.get("note"),
                "limitation": omr_ctx.get("limitation"),
                "counts": omr_ctx.get("counts"),
                "aois": omr_ctx.get("aois"),
                "omr_highlight": omr_ctx.get("omr_highlight"),
                "cmp_corridors_focus": omr_ctx.get("cmp_corridors_focus"),
                "metro_towns": omr_ctx.get("metro_towns"),
                "sources": omr_ctx.get("sources"),
            },
            "connectivity_need": {
                "status": need.get("status"),
                "counts": need.get("counts"),
                "note": need.get("note"),
            },
            "sir_electors": {
                "status": sir.get("status"),
                "grain": sir.get("grain"),
                "as_of": sir.get("as_of"),
                "chennai_district_electors_total": sir.get("chennai_district_electors_total"),
                "map_electors_total": sir.get("map_electors_total"),
                "note": sir.get("note"),
                "reason_not_ward": sir.get("reason_not_ward"),
            },
            "first_last_mile": {
                "status": (first_mile or {}).get("status"),
                "summary": (first_mile or {}).get("summary"),
            },
        },
        "sources": [
            {
                "name": "GTFS stops (MTC + CMRL community feed)",
                "portal": "https://github.com/ungalsoththu/ChennaiGTFS",
            },
            {
                "name": "GCC wards / zones 2022",
                "portal": "https://data.opencity.in/",
            },
            {
                "name": "OSM walk network + major roads + OMR",
                "portal": "https://www.openstreetmap.org/copyright",
            },
            {
                "name": "CMRL Phase II Corridor 5 (Red Line) — curated stations",
                "portal": "https://chennaimetrorail.org/project-status/",
                "status": "partial",
            },
            {
                "name": "TNGIS settlement / habitation (WFS)",
                "portal": "https://tngis.tn.gov.in/",
                "status": "partial",
            },
            {
                "name": "OSM railway stations (south / OMR)",
                "status": "partial",
            },
            {
                "name": "CMP corridors (PDF + Nominatim)",
                "status": "partial",
            },
            {
                "name": "TN SIR voter rolls 2026 (AC electors)",
                "portal": "https://data.opencity.in/dataset/tamil-nadu-sir-voter-rolls-2026",
                "status": "partial",
            },
        ],
        "next_steps_for_authorities": [
            "Field-verify high-gap wards and outside-GCC unmet road segments before capital works.",
            "Prioritise OMR AOI settlements tagged beyond 10 min walk and unmet feeder roads (Mambakkam–Thiruporur).",
            "Replace curated Red Line coordinates with official CMRL station CAD when available.",
            "Add population-weighted coverage (Census / dasymetric) — SIR is electors 18+ at AC grain only.",
            "Ingest Tambaram municipal wards when machine-readable GeoJSON is published (PDF-only today).",
        ],
    }
    return summary


def main() -> int:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    WEB.mkdir(parents=True, exist_ok=True)
    summary = build()
    name = "coverage_assessment.json"
    (PROCESSED / name).write_text(json.dumps(summary, indent=2))
    _copy_web(name)

    for base in (PROCESSED, WEB):
        ap = base / "analyses.json"
        if ap.exists():
            analyses = json.loads(ap.read_text())
            analyses["coverage_assessment"] = summary
            ap.write_text(json.dumps(analyses, indent=2, allow_nan=False))
        mp = base / "manifest.json"
        if mp.exists():
            manifest = json.loads(mp.read_text())
            manifest.setdefault("layers", {})["coverage_assessment"] = {
                "status": summary["status"],
                "file": name,
                "notes": summary["note"],
            }
            mp.write_text(json.dumps(manifest, indent=2, allow_nan=False))

    print(f"[ok] coverage_assessment status={summary['status']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
