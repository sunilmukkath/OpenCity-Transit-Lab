#!/usr/bin/env python3
"""
CMRL Phase II Corridor 5 (Red Line) — proposed stations + walk-coverage scenario.

Stations are curated approximate points (Partial — not official CMRL CAD).
Compares OSM-network walk catchment ≤5/10/15 min: existing PT vs existing + Red Line.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import LineString, Point, mapping
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
WEB = ROOT / "apps" / "web" / "public" / "data"
STATIONS_JSON = RAW / "cmrl_c5_red_line_stations.json"

WALK_SPEED_M_PER_MIN = 80.0
NODE_BUFFER_M = 70.0
BANDS_MIN = (5, 10, 15)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _copy_web(name: str) -> None:
    src = PROCESSED / name
    if src.exists():
        WEB.mkdir(parents=True, exist_ok=True)
        (WEB / name).write_bytes(src.read_bytes())


def _load_gdf(name: str) -> gpd.GeoDataFrame | None:
    for base in (PROCESSED, WEB):
        path = base / name
        if path.exists():
            try:
                gdf = gpd.read_file(path)
                return None if gdf.empty else gdf
            except Exception:  # noqa: BLE001
                continue
    return None


def _km2(geom) -> float:
    if geom is None or geom.is_empty:
        return 0.0
    return round(float(gpd.GeoSeries([geom], crs=3857).area.sum()) / 1e6, 2)


def write_station_layers(payload: dict[str, Any]) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    rows = []
    for s in payload.get("stations") or []:
        rows.append(
            {
                "name": s["name"],
                "seq": s.get("seq"),
                "corridor": "C5_red",
                "phase": "II",
                "status": "proposed",
                "geometry_note": payload.get("note"),
                "geometry": Point(float(s["lon"]), float(s["lat"])),
            }
        )
    stations = gpd.GeoDataFrame(rows, crs=4326)
    coords = [(float(s["lon"]), float(s["lat"])) for s in sorted(payload["stations"], key=lambda x: x["seq"])]
    line = gpd.GeoDataFrame(
        [
            {
                "name": "CMRL Phase II Corridor 5 (Red Line)",
                "corridor": "C5_red",
                "phase": "II",
                "status": "proposed",
                "station_count": len(coords),
                "geometry_note": payload.get("note"),
                "geometry": LineString(coords),
            }
        ],
        crs=4326,
    )
    stations.to_file(PROCESSED / "cmrl_phase2_stations.geojson", driver="GeoJSON")
    line.to_file(PROCESSED / "cmrl_phase2_line.geojson", driver="GeoJSON")
    _copy_web("cmrl_phase2_stations.geojson")
    _copy_web("cmrl_phase2_line.geojson")
    return stations, line


def dissolve_reachable(G, lengths: dict, max_m: float, study_m):
    from build_walk_isochrones import dissolve_nodes, _as_multipolygon

    ids = [n for n, d in lengths.items() if d is not None and d <= max_m]
    poly = dissolve_nodes(G, ids, buffer_m=NODE_BUFFER_M)
    if poly is None:
        return None
    clipped = study_m.intersection(poly)
    return _as_multipolygon(clipped.buffer(0) if hasattr(clipped, "buffer") else clipped)


def scenario_coverage(
    stations: gpd.GeoDataFrame,
) -> dict[str, Any]:
    from build_walk_distance_bands import build_access_points, build_study_area
    from build_ward_walk_access import load_or_build_walk_graph
    import networkx as nx
    import osmnx as ox

    stops = _load_gdf("stops.geojson")
    hubs = _load_gdf("hubs.geojson")
    mrts = _load_gdf("mrts_stations.geojson")
    wards = _load_gdf("wards.geojson")
    omr = _load_gdf("omr_corridor.geojson")
    metro = _load_gdf("metro_area_boundaries.geojson")
    aois = _load_gdf("corridor_aois.geojson")

    if stops is None or wards is None:
        return {"status": "unavailable", "reason": "stops or wards missing"}

    access, access_counts = build_access_points(stops, hubs=hubs, mrts=mrts)
    study_geom, study_meta = build_study_area(
        wards, omr=omr, metro_areas=metro, corridor_aois=aois
    )
    study_m = study_geom.buffer(0)

    print("[…] CMRL scenario — loading walk graph")
    G = load_or_build_walk_graph()

    access_ll = access.to_crs(4326)
    pt_nodes = ox.distance.nearest_nodes(
        G,
        [float(g.x) for g in access_ll.geometry],
        [float(g.y) for g in access_ll.geometry],
    )
    if np.isscalar(pt_nodes):
        existing_sources = [int(pt_nodes)]
    else:
        existing_sources = list({int(n) for n in pt_nodes if n in G})

    prop_ll = stations.to_crs(4326)
    prop_nodes = ox.distance.nearest_nodes(
        G,
        [float(g.x) for g in prop_ll.geometry],
        [float(g.y) for g in prop_ll.geometry],
    )
    if np.isscalar(prop_nodes):
        proposed_sources = [int(prop_nodes)]
    else:
        proposed_sources = list({int(n) for n in prop_nodes if n in G})

    combined = list({*existing_sources, *proposed_sources})

    print(f"  [route] existing sources={len(existing_sources)}")
    lengths_ex = nx.multi_source_dijkstra_path_length(G, existing_sources, weight="length")
    print(f"  [route] combined sources={len(combined)}")
    lengths_combo = nx.multi_source_dijkstra_path_length(G, combined, weight="length")

    scenarios: dict[str, Any] = {}
    for label, lengths in (("existing", lengths_ex), ("existing_plus_c5", lengths_combo)):
        band_km2: dict[str, float] = {}
        for minutes in BANDS_MIN:
            poly = dissolve_reachable(G, lengths, minutes * WALK_SPEED_M_PER_MIN, study_m)
            band_km2[f"within_{minutes}min_km2"] = _km2(poly)
        study_km2 = study_meta.get("study_area_km2") or 0
        scenarios[label] = {
            "band_km2": band_km2,
            "pct_within_5min": round(100 * band_km2["within_5min_km2"] / study_km2, 1)
            if study_km2
            else None,
            "pct_within_10min": round(100 * band_km2["within_10min_km2"] / study_km2, 1)
            if study_km2
            else None,
            "pct_within_15min": round(100 * band_km2["within_15min_km2"] / study_km2, 1)
            if study_km2
            else None,
        }

    # Crow-flies 400m buffers as secondary inventory check
    def buffer_km2(points: gpd.GeoDataFrame, metres: float) -> float:
        if points is None or points.empty:
            return 0.0
        buf = unary_union(list(points.to_crs(3857).geometry.buffer(metres)))
        clipped = study_m.intersection(buf)
        return _km2(clipped)

    crow = {
        "existing_400m_km2": buffer_km2(access, 400),
        "existing_plus_c5_400m_km2": buffer_km2(
            gpd.GeoDataFrame(
                pd.concat([access[["geometry"]], stations[["geometry"]]], ignore_index=True),
                geometry="geometry",
                crs=4326,
            ),
            400,
        ),
    }

    ex5 = scenarios["existing"]["pct_within_5min"]
    c5 = scenarios["existing_plus_c5"]["pct_within_5min"]
    delta = round(c5 - ex5, 1) if ex5 is not None and c5 is not None else None

    return {
        "status": "partial",
        "generated_at": _now(),
        "note": (
            "OSM network walk catchment comparison: existing GTFS/hubs vs existing + "
            "approximate CMRL Phase II Corridor 5 (Red Line) stations. "
            "Station coordinates are curated approximations — not official CMRL CAD. Partial."
        ),
        "walk_speed_m_per_min": WALK_SPEED_M_PER_MIN,
        "study": study_meta,
        "access_points_existing": access_counts,
        "proposed_stations": len(stations),
        "proposed_graph_nodes": len(proposed_sources),
        "scenarios": scenarios,
        "crow_flies_400m_km2": crow,
        "delta_pct_within_5min": delta,
        "limitation": (
            "Proposed stations approximate; OSM walk graph Partial; not population-weighted; "
            "not official ridership or opening-year forecast."
        ),
    }


def update_manifest(stations_n: int, line_n: int, analysis: dict[str, Any]) -> None:
    note = analysis.get("note") or ""
    for base in (PROCESSED, WEB):
        mp = base / "manifest.json"
        if not mp.exists():
            continue
        manifest = json.loads(mp.read_text())
        layers = manifest.setdefault("layers", {})
        layers["cmrl_phase2_stations"] = {
            "status": "partial",
            "feature_count": stations_n,
            "file": "cmrl_phase2_stations.geojson",
            "derived_from": "cmrl_c5_red_line_stations.json",
            "notes": note,
        }
        layers["cmrl_phase2_line"] = {
            "status": "partial",
            "feature_count": line_n,
            "file": "cmrl_phase2_line.geojson",
            "derived_from": "cmrl_c5_red_line_stations.json",
            "notes": note,
        }
        sources = manifest.setdefault("sources", {})
        sources["cmrl_phase2_c5"] = {
            "id": "cmrl_phase2_c5",
            "name": "CMRL Phase II Corridor 5 (Red Line) — curated stations",
            "publisher": "Curated from public CMRL / Wikipedia station lists",
            "url": "https://chennaimetrorail.org/project-status/",
            "portal": "https://chennaimetrorail.org/project-status/",
            "kind": "curated_partial",
            "status": "partial",
            "notes": note,
        }
        mp.write_text(json.dumps(manifest, indent=2, allow_nan=False))


def main() -> int:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    WEB.mkdir(parents=True, exist_ok=True)
    if not STATIONS_JSON.exists():
        print(f"[fail] missing {STATIONS_JSON}")
        return 1

    payload = json.loads(STATIONS_JSON.read_text())
    stations, line = write_station_layers(payload)
    print(f"[ok] cmrl_phase2_stations n={len(stations)} line={len(line)}")

    try:
        analysis = scenario_coverage(stations)
    except Exception as exc:  # noqa: BLE001
        print(f"[fail] scenario: {exc}")
        analysis = {
            "status": "unavailable",
            "reason": str(exc),
            "proposed_stations": len(stations),
            "note": payload.get("note"),
        }

    (PROCESSED / "cmrl_phase2_scenario.json").write_text(json.dumps(analysis, indent=2))
    _copy_web("cmrl_phase2_scenario.json")

    for base in (PROCESSED, WEB):
        ap = base / "analyses.json"
        if not ap.exists():
            continue
        analyses = json.loads(ap.read_text())
        analyses["cmrl_phase2_scenario"] = analysis
        ap.write_text(json.dumps(analyses, indent=2, allow_nan=False))

    update_manifest(len(stations), len(line), analysis)
    print(
        f"cmrl_phase2: {analysis.get('status')} "
        f"delta_5min={analysis.get('delta_pct_within_5min')}"
    )
    return 0 if analysis.get("status") != "unavailable" else 1


if __name__ == "__main__":
    raise SystemExit(main())
