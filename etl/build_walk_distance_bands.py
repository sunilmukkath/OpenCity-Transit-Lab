#!/usr/bin/env python3
"""
Walk-distance bands from verified transit access points (geometry only).

Access points = GTFS stops ∪ MRTS/metro hubs (existing only — no proposed stations).

Study area = GCC wards ∪ OMR corridor buffer ∪ Tambaram / Chengalpattu /
Mahabalipuram study polygons (so Kelambakkam → Mahabs are included).

Bands (mutually exclusive):
  - within_100m
  - band_100_500m
  - band_500_1000m
  - over_1000m (map as red)

Not population-weighted. Crow-flies buffers, not street-network walks.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
WEB = ROOT / "apps" / "web" / "public" / "data"

# Buffer around OMR line so roadside settlements (Kelambakkam etc.) enter the study.
OMR_STUDY_BUFFER_M = 2500


def _union(geoms):
    try:
        return unary_union(list(geoms))
    except Exception:  # noqa: BLE001
        return unary_union([g for g in geoms if g is not None and not g.is_empty])


def _load_optional(path: Path) -> gpd.GeoDataFrame | None:
    if not path.exists():
        return None
    try:
        gdf = gpd.read_file(path)
        if gdf.empty:
            return None
        return gdf
    except Exception:  # noqa: BLE001
        return None


def build_study_area(
    wards: gpd.GeoDataFrame,
    *,
    omr: gpd.GeoDataFrame | None = None,
    metro_areas: gpd.GeoDataFrame | None = None,
    corridor_aois: gpd.GeoDataFrame | None = None,
) -> tuple[Any, dict[str, Any]]:
    """Union GCC wards with south corridor polygons / OMR buffer."""
    parts: list[Any] = []
    meta: dict[str, Any] = {"components": []}

    wards_m = wards.to_crs(3857)
    parts.append(_union(wards_m.geometry.values))
    meta["components"].append({"id": "gcc_wards", "features": len(wards)})

    if omr is not None and not omr.empty:
        omr_m = omr.to_crs(3857)
        buf = _union(omr_m.geometry.values).buffer(OMR_STUDY_BUFFER_M)
        parts.append(buf)
        meta["components"].append(
            {
                "id": "omr_corridor_buffer_m",
                "buffer_m": OMR_STUDY_BUFFER_M,
                "features": len(omr),
            }
        )

    for label, gdf in (
        ("metro_area_boundaries", metro_areas),
        ("corridor_aois", corridor_aois),
    ):
        if gdf is None or gdf.empty:
            continue
        g_m = gdf.to_crs(3857)
        parts.append(_union(g_m.geometry.values))
        meta["components"].append({"id": label, "features": len(gdf)})

    study = _union(parts).buffer(0)
    meta["study_area_km2"] = round(float(study.area) / 1e6, 2)
    return study, meta


def build_access_points(
    stops: gpd.GeoDataFrame,
    *,
    hubs: gpd.GeoDataFrame | None = None,
    mrts: gpd.GeoDataFrame | None = None,
) -> tuple[gpd.GeoDataFrame, dict[str, int]]:
    """Existing transit access only — GTFS stops + rail/metro hubs/stations."""
    frames: list[gpd.GeoDataFrame] = []
    counts = {"stops": 0, "hubs": 0, "mrts_stations": 0}

    if stops is not None and not stops.empty:
        s = stops[["geometry"]].copy()
        s["access_kind"] = "gtfs_stop"
        frames.append(s)
        counts["stops"] = len(s)

    if hubs is not None and not hubs.empty:
        h = hubs[["geometry"]].copy()
        h["access_kind"] = "hub"
        frames.append(h)
        counts["hubs"] = len(h)

    if mrts is not None and not mrts.empty:
        m = mrts[["geometry"]].copy()
        m["access_kind"] = "mrts_station"
        frames.append(m)
        counts["mrts_stations"] = len(m)

    if not frames:
        return gpd.GeoDataFrame(columns=["geometry", "access_kind"], crs=4326), counts

    gdf = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs=frames[0].crs)
    if gdf.crs is None:
        gdf = gdf.set_crs(4326)
    # Drop near-duplicates so overlapping hub/stop pairs don't inflate buffers oddly
    gdf = gdf.to_crs(3857)
    gdf["x"] = gdf.geometry.x.round(0)
    gdf["y"] = gdf.geometry.y.round(0)
    gdf = gdf.drop_duplicates(subset=["x", "y"]).drop(columns=["x", "y"]).to_crs(4326)
    counts["unique_access_points"] = len(gdf)
    return gdf, counts


def build_walk_distance_bands(
    stops: gpd.GeoDataFrame,
    study: gpd.GeoDataFrame | Any,
    *,
    hubs: gpd.GeoDataFrame | None = None,
    mrts: gpd.GeoDataFrame | None = None,
    omr: gpd.GeoDataFrame | None = None,
    metro_areas: gpd.GeoDataFrame | None = None,
    corridor_aois: gpd.GeoDataFrame | None = None,
    study_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {"layers": {}, "analysis": {}, "errors": []}

    access, access_counts = build_access_points(stops, hubs=hubs, mrts=mrts)
    if access.empty:
        result["errors"].append("access points missing")
        result["layers"]["walk_distance_bands"] = {
            "status": "unavailable",
            "error": "stops/hubs missing",
        }
        return result

    # If `study` is a GeoDataFrame of wards (legacy), rebuild with south extensions.
    if isinstance(study, gpd.GeoDataFrame):
        study_geom, built_meta = build_study_area(
            study, omr=omr, metro_areas=metro_areas, corridor_aois=corridor_aois
        )
        study_meta = {**(study_meta or {}), **built_meta}
    else:
        study_geom = study
        study_meta = study_meta or {}

    if study_geom is None or getattr(study_geom, "is_empty", False):
        result["errors"].append("study area missing")
        result["layers"]["walk_distance_bands"] = {
            "status": "unavailable",
            "error": "study area missing",
        }
        return result

    access_m = access.to_crs(3857)
    study_union = study_geom.buffer(0)

    buf100 = _union(access_m.geometry.buffer(100).values).buffer(0)
    buf500 = _union(access_m.geometry.buffer(500).values).buffer(0)
    buf1000 = _union(access_m.geometry.buffer(1000).values).buffer(0)

    within_100 = study_union.intersection(buf100)
    ring_100_500 = study_union.intersection(buf500.difference(buf100))
    ring_500_1000 = study_union.intersection(buf1000.difference(buf500))
    over_1000 = study_union.difference(buf1000)

    note = (
        "Crow-flies from existing GTFS stops + MRTS/metro hubs. "
        "Bands: ≤100m, 100–500m, 500m–1km, >1km. "
        "Study = GCC wards + OMR corridor buffer + Tambaram/Chengalpattu/Mahabalipuram. "
        "Proposed metro stations not included (no verified open station points). "
        "Not street-network walk; not population-weighted."
    )

    rows = []
    for band, label, color_hint, geom in [
        ("within_100m", "Within 100m of a transit stop/hub", "teal", within_100),
        ("band_100_500m", "100m–500m from nearest stop/hub", "green", ring_100_500),
        ("band_500_1000m", "500m–1000m from nearest stop/hub", "amber", ring_500_1000),
        ("over_1000m", "Over 1km from any stop/hub", "red", over_1000),
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
                "note": note,
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
    within_500_km2 = round(
        areas.get("within_100m", 0) + areas.get("band_100_500m", 0), 2
    )
    result["layers"]["walk_distance_bands"] = {
        "status": "loaded",
        "file": "walk_distance_bands.geojson",
        "feature_count": len(gdf),
        "notes": note,
        "attributes": ["band", "label", "color_hint", "area_km2", "note"],
    }
    result["analysis"] = {
        "status": "loaded",
        "note": note,
        "method": {
            "access_points": "GTFS stops ∪ hubs ∪ MRTS stations (existing only)",
            "study_area": "GCC wards ∪ OMR buffer ∪ metro town polygons",
            "within_100m": "union of 100m access buffers ∩ study",
            "band_100_500m": "(500m buffer − 100m buffer) ∩ study",
            "band_500_1000m": "(1000m buffer − 500m buffer) ∩ study",
            "over_1000m": "study − 1000m access buffer (rendered red)",
            "proposed_metro": "unavailable — no verified open proposed-station points",
        },
        "access_counts": access_counts,
        "study": study_meta,
        "counts": {
            "study_area_km2": round(study_km2, 2),
            "within_100m_km2": areas.get("within_100m", 0),
            "band_100_500m_km2": areas.get("band_100_500m", 0),
            "within_500m_km2": within_500_km2,
            "band_500_1000m_km2": areas.get("band_500_1000m", 0),
            "over_1000m_km2": areas.get("over_1000m", 0),
            "pct_within_100m": round(100 * areas.get("within_100m", 0) / study_km2, 1)
            if study_km2
            else None,
            "pct_over_1000m": round(100 * areas.get("over_1000m", 0) / study_km2, 1)
            if study_km2
            else None,
        },
    }
    return result


if __name__ == "__main__":
    stops = gpd.read_file(PROCESSED / "stops.geojson")
    wards = gpd.read_file(PROCESSED / "wards.geojson")
    hubs = _load_optional(PROCESSED / "hubs.geojson")
    mrts = _load_optional(PROCESSED / "mrts_stations.geojson")
    omr = _load_optional(PROCESSED / "omr_corridor.geojson")
    metro_areas = _load_optional(PROCESSED / "metro_area_boundaries.geojson")
    corridor_aois = _load_optional(PROCESSED / "corridor_aois.geojson")

    out = build_walk_distance_bands(
        stops,
        wards,
        hubs=hubs,
        mrts=mrts,
        omr=omr,
        metro_areas=metro_areas,
        corridor_aois=corridor_aois,
    )
    print(
        json.dumps(
            {
                "layers": out["layers"],
                "analysis": out.get("analysis"),
                "errors": out["errors"],
            },
            indent=2,
        )
    )

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
