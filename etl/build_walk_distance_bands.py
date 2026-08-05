#!/usr/bin/env python3
"""
Walk-distance bands from verified GTFS stops (geometry only).

Bands inside the GCC ward study area:
  - within_500m  — land within 500m of a stop
  - band_500_1000m — between 500m and 1000m
  - over_1000m — more than 1km from any stop (map as red)

Not population-weighted. Crow-flies buffers, not street-network walks.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import geopandas as gpd
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
WEB = ROOT / "apps" / "web" / "public" / "data"


def _union(geoms):
    try:
        return unary_union(list(geoms))
    except Exception:  # noqa: BLE001
        return unary_union([g for g in geoms if g is not None and not g.is_empty])


def build_walk_distance_bands(
    stops: gpd.GeoDataFrame,
    study: gpd.GeoDataFrame,
) -> dict[str, Any]:
    result: dict[str, Any] = {"layers": {}, "analysis": {}, "errors": []}
    if stops is None or stops.empty:
        result["errors"].append("stops missing")
        result["layers"]["walk_distance_bands"] = {
            "status": "unavailable",
            "error": "stops missing",
        }
        return result
    if study is None or study.empty:
        result["errors"].append("study area missing")
        result["layers"]["walk_distance_bands"] = {
            "status": "unavailable",
            "error": "wards/study missing",
        }
        return result

    stops_m = stops.to_crs(3857)
    study_m = study.to_crs(3857)
    study_union = _union(study_m.geometry.values)
    study_union = study_union.buffer(0)

    buf500 = _union(stops_m.geometry.buffer(500).values).buffer(0)
    buf1000 = _union(stops_m.geometry.buffer(1000).values).buffer(0)

    within_500 = study_union.intersection(buf500)
    ring_500_1000 = study_union.intersection(buf1000.difference(buf500))
    over_1000 = study_union.difference(buf1000)

    rows = []
    for band, label, color_hint, geom in [
        (
            "within_500m",
            "Within 500m of a transit stop",
            "green",
            within_500,
        ),
        (
            "band_500_1000m",
            "500m–1000m from nearest stop",
            "amber",
            ring_500_1000,
        ),
        (
            "over_1000m",
            "Over 1km from any transit stop",
            "red",
            over_1000,
        ),
    ]:
        if geom is None or geom.is_empty:
            continue
        area_km2 = float(geom.area) / 1e6
        rows.append(
            {
                "band": band,
                "label": label,
                "color_hint": color_hint,
                "area_km2": round(area_km2, 2),
                "note": (
                    "Crow-flies buffer from GTFS stops, clipped to GCC wards. "
                    "Not street-network walk distance; not population-weighted."
                ),
                "geometry": geom,
            }
        )

    if not rows:
        result["errors"].append("empty band geometries")
        result["layers"]["walk_distance_bands"] = {
            "status": "unavailable",
            "error": "empty geometries",
        }
        return result

    gdf = gpd.GeoDataFrame(rows, crs=3857).to_crs(4326)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    out_path = PROCESSED / "walk_distance_bands.geojson"
    gdf.to_file(out_path, driver="GeoJSON")

    study_km2 = float(study_union.area) / 1e6
    areas = {r["band"]: r["area_km2"] for r in rows}
    result["layers"]["walk_distance_bands"] = {
        "status": "loaded",
        "file": "walk_distance_bands.geojson",
        "feature_count": len(gdf),
        "notes": (
            "Walk-distance bands from GTFS stops: <500m, 500–1000m, >1km (red). "
            "Crow-flies buffers clipped to GCC wards — not population-weighted."
        ),
        "attributes": ["band", "label", "color_hint", "area_km2", "note"],
    }
    result["analysis"] = {
        "status": "loaded",
        "note": (
            "Areas classified by crow-flies distance to the nearest GTFS stop, "
            "inside GCC ward boundaries. Red = more than 1km from any stop. "
            "Not street-network distance and not population-weighted."
        ),
        "method": {
            "within_500m": "union of 500m stop buffers ∩ wards",
            "band_500_1000m": "(1000m buffer − 500m buffer) ∩ wards",
            "over_1000m": "wards − 1000m stop buffer (rendered red)",
        },
        "counts": {
            "study_area_km2": round(study_km2, 2),
            "within_500m_km2": areas.get("within_500m", 0),
            "band_500_1000m_km2": areas.get("band_500_1000m", 0),
            "over_1000m_km2": areas.get("over_1000m", 0),
            "pct_over_1000m": round(100 * areas.get("over_1000m", 0) / study_km2, 1)
            if study_km2
            else None,
        },
    }
    return result


if __name__ == "__main__":
    stops = gpd.read_file(PROCESSED / "stops.geojson")
    wards = gpd.read_file(PROCESSED / "wards.geojson")
    out = build_walk_distance_bands(stops, wards)
    print(json.dumps({"layers": out["layers"], "analysis": out.get("analysis"), "errors": out["errors"]}, indent=2))

    analyses_path = PROCESSED / "analyses.json"
    if analyses_path.exists() and out.get("analysis"):
        analyses = json.loads(analyses_path.read_text())
        analyses["walk_distance_bands"] = out["analysis"]
        analyses_path.write_text(json.dumps(analyses, indent=2))

    manifest_path = PROCESSED / "manifest.json"
    if manifest_path.exists() and out["layers"].get("walk_distance_bands"):
        manifest = json.loads(manifest_path.read_text())
        manifest["layers"]["walk_distance_bands"] = out["layers"]["walk_distance_bands"]
        manifest_path.write_text(json.dumps(manifest, indent=2))

    WEB.mkdir(parents=True, exist_ok=True)
    for name in ("walk_distance_bands.geojson", "analyses.json", "manifest.json"):
        src = PROCESSED / name
        if src.exists():
            (WEB / name).write_bytes(src.read_bytes())
    print("[ok] copied to web public/data")
