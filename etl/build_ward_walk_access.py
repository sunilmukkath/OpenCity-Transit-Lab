#!/usr/bin/env python3
"""
Ward-level average crow-flies distance to nearest public transport.

Samples a ~150m grid inside each ward, measures distance to nearest GTFS stop
or rail/metro hub (existing inventory). Not network walk time / not equity.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import Point

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
WEB = ROOT / "apps" / "web" / "public" / "data"

SPACING_M = 150
MAX_SAMPLES = 400


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _copy_web(name: str) -> None:
    src = PROCESSED / name
    if src.exists():
        WEB.mkdir(parents=True, exist_ok=True)
        (WEB / name).write_bytes(src.read_bytes())


def sample_points(geom, spacing: float, rng: np.random.Generator) -> list[Point]:
    if geom is None or geom.is_empty:
        return []
    minx, miny, maxx, maxy = geom.bounds
    xs = np.arange(minx, maxx + spacing, spacing)
    ys = np.arange(miny, maxy + spacing, spacing)
    pts: list[Point] = []
    for x in xs:
        for y in ys:
            p = Point(x, y)
            if geom.contains(p) or geom.intersects(p):
                pts.append(p)
    if not pts:
        pts = [geom.representative_point()]
    if len(pts) > MAX_SAMPLES:
        idx = rng.choice(len(pts), MAX_SAMPLES, replace=False)
        pts = [pts[i] for i in idx]
    return pts


def build_ward_walk_access(
    wards: gpd.GeoDataFrame,
    stops: gpd.GeoDataFrame | None,
    hubs: gpd.GeoDataFrame | None,
) -> dict[str, Any]:
    if wards is None or wards.empty:
        return {"status": "unavailable", "reason": "wards missing", "wards": []}

    frames = []
    if stops is not None and not stops.empty:
        frames.append(stops[["geometry"]])
    if hubs is not None and not hubs.empty:
        frames.append(hubs[["geometry"]])
    if not frames:
        return {"status": "unavailable", "reason": "no stops/hubs", "wards": []}

    pt = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs=stops.crs if stops is not None else hubs.crs)
    pt = pt[~pt.geometry.isna() & ~pt.geometry.is_empty].to_crs(3857).reset_index(drop=True)
    w_m = wards.to_crs(3857)
    rng = np.random.default_rng(42)

    rows: list[dict[str, Any]] = []
    for _, w in w_m.iterrows():
        label = str(w.get("ward_label") or "")
        pts = sample_points(w.geometry, SPACING_M, rng)
        g = gpd.GeoDataFrame(geometry=pts, crs=3857)
        joined = gpd.sjoin_nearest(g, pt[["geometry"]], how="left", distance_col="d")
        d = joined.groupby(joined.index)["d"].min()
        mean_m = float(d.mean())
        med_m = float(d.median())
        p90_m = float(d.quantile(0.9))
        rows.append(
            {
                "label": label,
                "sample_points": int(len(d)),
                "mean_walk_m": round(mean_m, 1),
                "median_walk_m": round(med_m, 1),
                "p90_walk_m": round(p90_m, 1),
                "pct_samples_within_400m": round(float((d <= 400).mean() * 100), 1),
                "pct_samples_within_800m": round(float((d <= 800).mean() * 100), 1),
            }
        )

    rows.sort(key=lambda r: (-(r["mean_walk_m"] or 0), r["label"]))
    means = [r["mean_walk_m"] for r in rows if r["mean_walk_m"] is not None]
    city_mean = round(sum(means) / len(means), 1) if means else None

    return {
        "status": "loaded",
        "generated_at": _now(),
        "note": (
            "Mean crow-flies metres from a ~150m grid of sample points inside each ward "
            "to the nearest GTFS stop or MRTS/metro hub. Not network walk, not population-weighted, "
            "not an equity score. Community GTFS may under-count official MTC stops."
        ),
        "method": {
            "spacing_m": SPACING_M,
            "max_samples_per_ward": MAX_SAMPLES,
            "pt_layers": ["stops", "hubs"],
            "distance": "Euclidean (EPSG:3857)",
        },
        "city": {
            "mean_of_ward_means_m": city_mean,
            "wards": len(rows),
        },
        "wards": rows,
        "priority_long_walk": [r for r in rows if (r["mean_walk_m"] or 0) >= 500][:25],
    }


def merge_into_reports(payload: dict[str, Any]) -> None:
    path = PROCESSED / "reports.json"
    if not path.exists() or payload.get("status") != "loaded":
        return
    reports = json.loads(path.read_text())
    by = {str(w["label"]): w for w in payload.get("wards") or []}
    for unit in (reports.get("wards") or []) + (reports.get("zones") or []):
        # zones: leave null — metric is ward-grid based
        if unit.get("unit_type") == "zone":
            continue
        hit = by.get(str(unit.get("label") or ""))
        if not hit:
            continue
        unit["mean_walk_m"] = hit["mean_walk_m"]
        unit["median_walk_m"] = hit["median_walk_m"]
        unit["p90_walk_m"] = hit["p90_walk_m"]
        unit["pct_samples_within_400m"] = hit["pct_samples_within_400m"]
        unit["pct_samples_within_800m"] = hit["pct_samples_within_800m"]
        unit["walk_sample_points"] = hit["sample_points"]
    reports["city_mean_walk_m"] = (payload.get("city") or {}).get("mean_of_ward_means_m")
    reports["walk_access_note"] = payload.get("note")
    path.write_text(json.dumps(reports, indent=2))
    _copy_web("reports.json")


def main() -> int:
    wards = gpd.read_file(PROCESSED / "wards.geojson") if (PROCESSED / "wards.geojson").exists() else None
    stops = gpd.read_file(PROCESSED / "stops.geojson") if (PROCESSED / "stops.geojson").exists() else None
    hubs = gpd.read_file(PROCESSED / "hubs.geojson") if (PROCESSED / "hubs.geojson").exists() else None
    if wards is None and (WEB / "wards.geojson").exists():
        wards = gpd.read_file(WEB / "wards.geojson")
        stops = gpd.read_file(WEB / "stops.geojson") if (WEB / "stops.geojson").exists() else stops
        hubs = gpd.read_file(WEB / "hubs.geojson") if (WEB / "hubs.geojson").exists() else hubs

    payload = build_ward_walk_access(wards, stops, hubs)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    (PROCESSED / "ward_walk_access.json").write_text(json.dumps(payload, indent=2))
    _copy_web("ward_walk_access.json")

    # manifest + analyses
    if (PROCESSED / "manifest.json").exists():
        manifest = json.loads((PROCESSED / "manifest.json").read_text())
        manifest.setdefault("layers", {})["ward_walk_access"] = {
            "status": payload.get("status"),
            "file": "ward_walk_access.json",
            "feature_count": len(payload.get("wards") or []),
            "notes": payload.get("note"),
        }
        (PROCESSED / "manifest.json").write_text(json.dumps(manifest, indent=2))
        _copy_web("manifest.json")
    if (PROCESSED / "analyses.json").exists():
        analyses = json.loads((PROCESSED / "analyses.json").read_text())
        analyses["ward_walk_access"] = {
            "status": payload.get("status"),
            "city": payload.get("city"),
            "method": payload.get("method"),
            "note": payload.get("note"),
            "priority_long_walk": payload.get("priority_long_walk"),
            "file": "ward_walk_access.json",
        }
        (PROCESSED / "analyses.json").write_text(json.dumps(analyses, indent=2))
        _copy_web("analyses.json")

    merge_into_reports(payload)
    city = (payload.get("city") or {}).get("mean_of_ward_means_m")
    print(f"[ok] ward_walk_access status={payload.get('status')} city_mean={city}m wards={len(payload.get('wards') or [])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
