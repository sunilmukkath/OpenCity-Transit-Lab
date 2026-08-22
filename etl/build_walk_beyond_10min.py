#!/usr/bin/env python3
"""
Areas beyond a 10-minute OSM network walk to nearest GTFS stop / hub.

Builds:
  - walk_beyond_10min.geojson — study area minus ≤10 min isochrones (Partial)
  - walk_beyond_10min_wards.csv — GCC wards ranked by share of samples >10 min

Uses existing walk_isochrones rings (within_5min ∪ band_5_10min). Not population-weighted.
"""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import geopandas as gpd
from shapely.geometry import mapping
from shapely.ops import unary_union

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
    from build_walk_distance_bands import build_study_area

    iso = _load_gdf("walk_isochrones.geojson")
    wards = _load_gdf("wards.geojson")
    omr = _load_gdf("omr_corridor.geojson")
    metro = _load_gdf("metro_area_boundaries.geojson")
    aois = _load_gdf("corridor_aois.geojson")
    reports = _load_json("reports.json") or {}

    if iso is None or wards is None:
        return {"status": "unavailable", "reason": "walk_isochrones or wards missing"}

    within10_parts = iso[iso["band"].isin(["within_5min", "band_5_10min"])]
    if within10_parts.empty:
        return {"status": "unavailable", "reason": "≤10 min isochrone bands missing"}

    def _valid(geom):
        if geom is None or geom.is_empty:
            return geom
        try:
            from shapely import make_valid

            geom = make_valid(geom)
        except Exception:  # noqa: BLE001
            pass
        try:
            return geom.buffer(0)
        except Exception:  # noqa: BLE001
            return geom

    within_geoms = [_valid(g) for g in within10_parts.to_crs(3857).geometry]
    within_geoms = [g for g in within_geoms if g is not None and not g.is_empty]
    within10_m = _valid(unary_union(within_geoms))
    study_geom, study_meta = build_study_area(
        wards, omr=omr, metro_areas=metro, corridor_aois=aois
    )
    study_geom = _valid(study_geom)
    try:
        beyond_m = _valid(study_geom.difference(within10_m))
    except Exception:  # noqa: BLE001
        beyond_m = _valid(study_geom.buffer(1).difference(within10_m.buffer(1)))
        if beyond_m is not None and not beyond_m.is_empty:
            beyond_m = _valid(beyond_m.buffer(-1))
    if beyond_m is None or beyond_m.is_empty:
        return {"status": "unavailable", "reason": "no area beyond 10 min in study polygon"}

    # Explode for a usable "list of areas" (keep only sizable pieces)
    exploded = gpd.GeoDataFrame(geometry=[beyond_m], crs=3857).explode(index_parts=False)
    exploded["area_km2"] = exploded.geometry.area / 1e6
    exploded = exploded[exploded["area_km2"] >= 0.05].copy()
    exploded = exploded.sort_values("area_km2", ascending=False).reset_index(drop=True)
    exploded["area_id"] = [f"beyond10_{i+1:03d}" for i in range(len(exploded))]
    exploded["band"] = "beyond_10min"
    exploded["max_walk_min"] = None
    exploded["min_walk_min"] = 10
    exploded["method"] = "study_minus_osm_isochrones_le_10min"
    exploded["note"] = (
        "Study area (GCC wards ∪ OMR corridor ∪ south towns) outside ≤10 min OSM network "
        "walk to nearest GTFS stop/hub at 80 m/min. Partial — OSM completeness; not population-weighted."
    )
    exploded["area_km2"] = exploded["area_km2"].round(2)

    # Tag with intersecting named places when available
    names: list[str] = []
    if metro is not None and not metro.empty:
        metro_m = metro.to_crs(3857)
        for _, row in exploded.iterrows():
            hits = []
            for _, mrow in metro_m.iterrows():
                if row.geometry.intersects(mrow.geometry):
                    label = (
                        mrow.get("name")
                        or mrow.get("label")
                        or mrow.get("NAME")
                        or mrow.get("town")
                    )
                    if label:
                        hits.append(str(label))
            names.append(", ".join(sorted(set(hits))) if hits else "")
    else:
        names = [""] * len(exploded)
    exploded["place_hints"] = names

    out_ll = exploded.to_crs(4326)
    props_cols = [
        "area_id",
        "band",
        "min_walk_min",
        "max_walk_min",
        "area_km2",
        "place_hints",
        "method",
        "note",
    ]
    features = []
    for _, row in out_ll.iterrows():
        features.append(
            {
                "type": "Feature",
                "properties": {c: (None if row[c] != row[c] else row[c]) for c in props_cols},
                "geometry": mapping(row.geometry),
            }
        )

    fc = {"type": "FeatureCollection", "features": features}
    geo_name = "walk_beyond_10min.geojson"
    (PROCESSED / geo_name).write_text(json.dumps(fc, separators=(",", ":"), ensure_ascii=False))
    _copy_web(geo_name)

    # Ward CSV from reports (sample-based — honest Partial)
    ward_rows: list[dict[str, Any]] = []
    for w in reports.get("wards") or []:
        within10 = w.get("pct_samples_within_10min")
        beyond = None if within10 is None else round(100 - float(within10), 1)
        ward_rows.append(
            {
                "ward_label": w.get("label"),
                "mean_walk_min": w.get("mean_walk_min"),
                "median_walk_min": w.get("median_walk_min"),
                "p90_walk_min": w.get("p90_walk_min"),
                "pct_samples_within_10min": within10,
                "pct_samples_beyond_10min": beyond,
                "gap_band": w.get("gap_band"),
                "gap_index": w.get("gap_index"),
                "stop_count": w.get("stop_count"),
                "area_km2": w.get("area_km2"),
            }
        )
    ward_rows.sort(
        key=lambda r: (
            -(r["pct_samples_beyond_10min"] if r["pct_samples_beyond_10min"] is not None else -1),
            -(r["mean_walk_min"] if r["mean_walk_min"] is not None else -1),
        )
    )
    csv_name = "walk_beyond_10min_wards.csv"
    csv_path = PROCESSED / csv_name
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "ward_label",
                "mean_walk_min",
                "median_walk_min",
                "p90_walk_min",
                "pct_samples_within_10min",
                "pct_samples_beyond_10min",
                "gap_band",
                "gap_index",
                "stop_count",
                "area_km2",
            ],
        )
        writer.writeheader()
        writer.writerows(ward_rows)
    _copy_web(csv_name)

    study_km2 = study_meta.get("study_area_km2") or _km2(study_geom)
    beyond_km2 = round(float(exploded["area_km2"].sum()), 2)
    within10_km2 = _km2(within10_m.intersection(study_geom))

    high = [
        r
        for r in ward_rows
        if (r.get("pct_samples_beyond_10min") or 0) >= 50
        or (r.get("mean_walk_min") or 0) > 10
    ]

    analysis = {
        "status": "partial",
        "generated_at": _now(),
        "note": (
            "Areas in the GCC∪OMR study polygon outside a 10-minute OSM network walk to "
            "nearest GTFS stop/hub (80 m/min). Derived from existing isochrone rings. "
            "Ward CSV uses sample-grid walk minutes — Partial, not population-weighted."
        ),
        "files": {
            "geojson": geo_name,
            "wards_csv": csv_name,
            "isochrones": "walk_isochrones.geojson",
        },
        "counts": {
            "study_area_km2": study_km2,
            "within_10min_km2": within10_km2,
            "beyond_10min_km2": beyond_km2,
            "pct_study_beyond_10min": round(100 * beyond_km2 / study_km2, 1) if study_km2 else None,
            "polygon_pieces_ge_0_05km2": len(features),
            "gcc_wards_listed": len(ward_rows),
            "gcc_wards_high_beyond_10min": len(high),
        },
        "high_beyond_10min_wards": [
            {
                "ward_label": r["ward_label"],
                "mean_walk_min": r["mean_walk_min"],
                "pct_samples_beyond_10min": r["pct_samples_beyond_10min"],
                "gap_band": r["gap_band"],
            }
            for r in high[:40]
        ],
        "limitation": (
            "Not official MTC service areas; OSM graph gaps can inflate beyond-10min land; "
            "includes water/vacant land in study polygon; ward metrics are samples not people."
        ),
    }

    meta_name = "walk_beyond_10min_meta.json"
    (PROCESSED / meta_name).write_text(json.dumps(analysis, indent=2))
    _copy_web(meta_name)

    for base in (PROCESSED, WEB):
        ap = base / "analyses.json"
        if ap.exists():
            analyses = json.loads(ap.read_text())
            analyses["walk_beyond_10min"] = analysis
            ap.write_text(json.dumps(analyses, indent=2, allow_nan=False))
        mp = base / "manifest.json"
        if mp.exists():
            manifest = json.loads(mp.read_text())
            layers = manifest.setdefault("layers", {})
            layers["walk_beyond_10min"] = {
                "status": "partial",
                "feature_count": len(features),
                "file": geo_name,
                "notes": analysis["note"],
                "limitation": analysis["limitation"],
            }
            mp.write_text(json.dumps(manifest, indent=2, allow_nan=False))

    print(
        f"[ok] walk_beyond_10min pieces={len(features)} "
        f"beyond_km2={beyond_km2} high_wards={len(high)}"
    )
    return analysis


def main() -> int:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    WEB.mkdir(parents=True, exist_ok=True)
    try:
        out = build()
    except Exception as exc:  # noqa: BLE001
        print(f"[fail] walk_beyond_10min: {exc}")
        return 1
    return 0 if out.get("status") != "unavailable" else 1


if __name__ == "__main__":
    raise SystemExit(main())
