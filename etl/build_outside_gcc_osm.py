#!/usr/bin/env python3
"""
OSM major roads outside Greater Chennai Corporation wards (OMR / south corridor).

Pulls trunk/primary/secondary/tertiary ways in the extended study bbox, keeps
geometry outside GCC ward polygons, and scores unmet length vs 400m GTFS buffers.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import geopandas as gpd
import requests
from shapely.geometry import LineString, mapping
from shapely.ops import linemerge, unary_union

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
WEB = ROOT / "apps" / "web" / "public" / "data"

UA = {"User-Agent": "OpenCity-TransitLab/1.0 (civic research; outside-GCC OSM)"}
# south/west/north/east — extends past GCC toward OMR / Tambaram / Chengalpattu
BBOX = (12.70, 79.95, 13.28, 80.35)
TOP_N = 150
MIN_UNMET_M = 200.0
HIGHWAY_CLASSES = {"trunk", "primary", "secondary", "tertiary"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _copy_web(name: str) -> None:
    src = PROCESSED / name
    if src.exists():
        WEB.mkdir(parents=True, exist_ok=True)
        (WEB / name).write_bytes(src.read_bytes())


def _load(name: str) -> gpd.GeoDataFrame | None:
    for base in (PROCESSED, WEB):
        path = base / name
        if path.exists():
            try:
                gdf = gpd.read_file(path)
                return None if gdf.empty else gdf
            except Exception:  # noqa: BLE001
                continue
    return None


def fetch_roads(cache: Path) -> dict[str, Any]:
    if cache.exists() and cache.stat().st_size > 2000:
        return json.loads(cache.read_text())
    south, west, north, east = BBOX
    stages = [
        ("trunk|primary", 'way["highway"~"^(trunk|primary)$"]'),
        ("secondary", 'way["highway"="secondary"]'),
        ("tertiary", 'way["highway"="tertiary"]'),
    ]
    merged: list[dict[str, Any]] = []
    last_err: Exception | None = None
    for label, selector in stages:
        query = f"""
[out:json][timeout:90];
(
  {selector}({south},{west},{north},{east});
);
out geom;
"""
        got = False
        for ep in (
            "https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
        ):
            try:
                time.sleep(1.0)
                resp = requests.post(ep, data={"data": query}, headers=UA, timeout=120)
                if resp.ok and resp.text.strip().startswith("{"):
                    els = resp.json().get("elements") or []
                    merged.extend(els)
                    print(f"[ok] overpass {label}: {len(els)} via {ep.split('/')[2]}")
                    got = True
                    break
                last_err = RuntimeError(f"{ep} {label} -> {resp.status_code}")
            except Exception as exc:  # noqa: BLE001
                last_err = exc
        if not got:
            print(f"[warn] stage {label}: {last_err}")
    if not merged:
        raise RuntimeError(f"Overpass failed: {last_err}")
    data = {"elements": merged}
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data))
    return data


def ways_to_gdf(overpass: dict[str, Any]) -> gpd.GeoDataFrame:
    rows = []
    for el in overpass.get("elements", []):
        if el.get("type") != "way" or not el.get("geometry"):
            continue
        tags = el.get("tags") or {}
        hwy = str(tags.get("highway") or "")
        if hwy not in HIGHWAY_CLASSES:
            continue
        coords = [(p["lon"], p["lat"]) for p in el["geometry"]]
        if len(coords) < 2:
            continue
        name = str(tags.get("name") or tags.get("ref") or "Unnamed road")
        rows.append(
            {
                "osm_id": el.get("id"),
                "road_name": name,
                "highway": hwy,
                "ref": str(tags.get("ref") or ""),
                "geometry": LineString(coords),
            }
        )
    if not rows:
        return gpd.GeoDataFrame(columns=[], geometry=[], crs=4326)
    return gpd.GeoDataFrame(rows, crs=4326)


def build() -> dict[str, Any]:
    wards = _load("wards.geojson")
    stops = _load("stops.geojson")
    if wards is None:
        return {"status": "unavailable", "reason": "wards missing", "layers": {}}

    cache = RAW / "overpass_outside_gcc_roads.json"
    print("[…] outside-GCC OSM — Overpass roads")
    try:
        overpass = fetch_roads(cache)
    except Exception as exc:  # noqa: BLE001
        # Fall back to connectivity_need cache if present
        alt = RAW / "overpass_connectivity_roads.json"
        if alt.exists():
            print(f"[warn] using fallback cache {alt.name}: {exc}")
            overpass = json.loads(alt.read_text())
        else:
            return {"status": "unavailable", "reason": str(exc), "layers": {}}

    roads = ways_to_gdf(overpass)
    if roads.empty:
        return {"status": "unavailable", "reason": "no roads", "layers": {}}

    gcc = unary_union(list(wards.to_crs(3857).geometry))
    roads_m = roads.to_crs(3857)
    outside_rows = []
    for _, row in roads_m.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        try:
            diff = geom.difference(gcc)
        except Exception:  # noqa: BLE001
            continue
        if diff is None or diff.is_empty:
            continue
        parts = [diff] if diff.geom_type == "LineString" else list(getattr(diff, "geoms", []))
        for part in parts:
            if part is None or part.is_empty or part.geom_type != "LineString":
                continue
            if float(part.length) < 80:
                continue
            outside_rows.append(
                {
                    "osm_id": row.get("osm_id"),
                    "road_name": row.get("road_name"),
                    "highway": row.get("highway"),
                    "ref": row.get("ref"),
                    "length_m": round(float(part.length), 1),
                    "geometry": part,
                }
            )

    if not outside_rows:
        return {"status": "unavailable", "reason": "no outside-GCC segments", "layers": {}}

    outside = gpd.GeoDataFrame(outside_rows, crs=3857)

    catch_union = None
    if stops is not None and not stops.empty:
        catch_union = unary_union(list(stops.to_crs(3857).geometry.buffer(400)))

    scored = []
    for _, row in outside.iterrows():
        geom = row.geometry
        unmet = geom
        if catch_union is not None:
            try:
                d = geom.difference(catch_union)
                if d is None or d.is_empty:
                    continue
                unmet = d
            except Exception:  # noqa: BLE001
                unmet = geom
        unmet_m = float(unmet.length) if unmet and not unmet.is_empty else 0.0
        if unmet_m < MIN_UNMET_M:
            continue
        length_m = float(row["length_m"])
        pct = (unmet_m / length_m * 100.0) if length_m else 0.0
        # explode multilines
        parts = [unmet] if unmet.geom_type == "LineString" else [
            g for g in getattr(unmet, "geoms", []) if g.geom_type == "LineString"
        ]
        for part in parts:
            um = float(part.length)
            if um < MIN_UNMET_M:
                continue
            scored.append(
                {
                    "osm_id": row.get("osm_id"),
                    "road_name": row.get("road_name"),
                    "highway": row.get("highway"),
                    "ref": row.get("ref"),
                    "length_m": round(length_m, 1),
                    "unmet_length_m": round(um, 1),
                    "pct_outside_400m": round(min(100.0, um / length_m * 100.0), 1),
                    "outside_gcc": True,
                    "need_score": round(um * (1.0 + pct / 200.0), 1),
                    "geometry": part,
                }
            )

    if not scored:
        out_gdf = outside.to_crs(4326).head(TOP_N)
        out_gdf["unmet_length_m"] = out_gdf["length_m"]
        out_gdf["pct_outside_400m"] = 100.0
        out_gdf["outside_gcc"] = True
        out_gdf["need_score"] = out_gdf["length_m"]
    else:
        out_gdf = (
            gpd.GeoDataFrame(scored, crs=3857)
            .sort_values("need_score", ascending=False)
            .head(TOP_N)
            .reset_index(drop=True)
            .to_crs(4326)
        )
        out_gdf["rank"] = out_gdf.index + 1

    out_name = "outside_gcc_roads.geojson"
    out_gdf.to_file(PROCESSED / out_name, driver="GeoJSON")
    _copy_web(out_name)

    total_km = round(float(outside["length_m"].sum()) / 1000.0, 1)
    unmet_km = round(float(out_gdf["unmet_length_m"].sum()) / 1000.0, 1)
    by_hwy = out_gdf["highway"].value_counts().to_dict() if "highway" in out_gdf.columns else {}

    analysis = {
        "status": "partial",
        "generated_at": _now(),
        "note": (
            "OSM trunk/primary/secondary/tertiary road segments outside GCC 2022 ward polygons "
            "(OMR / south-corridor study bbox). Unmet = farther than 400m from a GTFS stop. "
            "Partial — OSM completeness; not ridership."
        ),
        "bbox": list(BBOX),
        "counts": {
            "outside_gcc_segments_scored": len(out_gdf),
            "outside_gcc_road_km": total_km,
            "top_unmet_km_shown": unmet_km,
            "by_highway": {str(k): int(v) for k, v in by_hwy.items()},
        },
        "file": out_name,
        "limitation": "Crow-flies 400m stop buffer; OSM Partial; GCC clip uses 2022 wards only.",
    }

    layer_meta = {
        "status": "partial",
        "feature_count": len(out_gdf),
        "file": out_name,
        "derived_from": "osm_overpass_outside_gcc",
        "notes": analysis["note"],
    }

    for base in (PROCESSED, WEB):
        mp = base / "manifest.json"
        if mp.exists():
            manifest = json.loads(mp.read_text())
            manifest.setdefault("layers", {})["outside_gcc_roads"] = layer_meta
            manifest.setdefault("sources", {})["osm_outside_gcc"] = {
                "id": "osm_outside_gcc",
                "name": "OSM major roads outside GCC",
                "publisher": "OpenStreetMap contributors",
                "url": "https://www.openstreetmap.org/copyright",
                "kind": "overpass",
                "status": "partial",
                "notes": analysis["note"],
                "bbox": list(BBOX),
            }
            mp.write_text(json.dumps(manifest, indent=2, allow_nan=False))
        ap = base / "analyses.json"
        if ap.exists():
            analyses = json.loads(ap.read_text())
            analyses["outside_gcc_osm"] = analysis
            ap.write_text(json.dumps(analyses, indent=2, allow_nan=False))

    (PROCESSED / "outside_gcc_osm_meta.json").write_text(json.dumps(analysis, indent=2))
    _copy_web("outside_gcc_osm_meta.json")
    print(f"[ok] outside_gcc_roads n={len(out_gdf)} unmet_km≈{unmet_km}")
    return {"status": "partial", "layers": {"outside_gcc_roads": layer_meta}, "analysis": analysis}


def main() -> int:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    WEB.mkdir(parents=True, exist_ok=True)
    try:
        out = build()
    except Exception as exc:  # noqa: BLE001
        print(f"[fail] outside_gcc_osm: {exc}")
        return 1
    return 0 if out.get("status") != "unavailable" else 1


if __name__ == "__main__":
    raise SystemExit(main())
