#!/usr/bin/env python3
"""Build OMR / Tambaram / Chengalpattu / Mahabalipuram extension layers from OSM."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import geopandas as gpd
import requests
from shapely.geometry import LineString, Point, box, mapping, shape
from shapely.ops import linemerge, unary_union

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"

UA = {"User-Agent": "OpenCity-TransitLab/1.0 (civic research; Chennai transit lab)"}

OVERPASS_QUERY = """
[out:json][timeout:120];
(
  way["name"="Rajiv Gandhi Salai"](12.55,80.10,13.05,80.30);
  way["name"="Old Mahabalipuram Road"](12.55,80.10,13.05,80.30);
  way["name"~"Old Mahapalipuram Road",i](12.55,80.10,13.05,80.30);
  way["ref"="SH49A"](12.55,80.10,13.05,80.30);
);
out geom;
"""


def fetch_overpass(cache: Path) -> dict[str, Any]:
    if cache.exists() and cache.stat().st_size > 1000:
        return json.loads(cache.read_text())
    last_err: Exception | None = None
    for ep in (
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
    ):
        try:
            resp = requests.post(
                ep, data={"data": OVERPASS_QUERY}, headers=UA, timeout=180
            )
            if resp.ok and resp.text.strip().startswith("{"):
                data = resp.json()
                cache.write_text(json.dumps(data))
                return data
            last_err = RuntimeError(f"{ep} -> {resp.status_code}")
        except Exception as exc:  # noqa: BLE001
            last_err = exc
    raise RuntimeError(f"Overpass failed: {last_err}")


def build_omr_line(overpass: dict[str, Any]) -> gpd.GeoDataFrame:
    lines: list[LineString] = []
    for el in overpass.get("elements", []):
        if el.get("type") != "way" or not el.get("geometry"):
            continue
        tags = el.get("tags") or {}
        name = str(tags.get("name") or "")
        ref = str(tags.get("ref") or "")
        if not (
            "SH49A" in ref
            or "Mahabalipuram" in name
            or "Mahapalipuram" in name
            or "Rajiv Gandhi" in name
        ):
            continue
        coords = [(p["lon"], p["lat"]) for p in el["geometry"]]
        if len(coords) >= 2:
            lines.append(LineString(coords))
    if not lines:
        raise RuntimeError("No OMR segments found in Overpass response")
    merged = linemerge(unary_union(lines))
    parts = list(merged.geoms) if merged.geom_type == "MultiLineString" else [merged]
    # Prefer segments that reach south toward Mahabalipuram
    kept = []
    for ls in parts:
        ys = [c[1] for c in ls.coords]
        xs = [c[0] for c in ls.coords]
        if min(ys) < 12.95 and max(xs) > 80.15:
            kept.append(ls)
    geom = unary_union(kept) if kept else unary_union(parts)
    return gpd.GeoDataFrame(
        [
            {
                "corridor": "OMR / Rajiv Gandhi Salai",
                "ref": "SH49A",
                "to": "Mahabalipuram",
                "note": "OSM ways for OMR / Rajiv Gandhi Salai (SH49A), filtered toward Mamallapuram.",
                "geometry": geom,
            }
        ],
        crs=4326,
    )


def nominatim_relation(query: str) -> dict[str, Any] | None:
    time.sleep(1.05)
    resp = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": query, "format": "json", "polygon_geojson": 1, "limit": 5},
        headers=UA,
        timeout=60,
    )
    resp.raise_for_status()
    hits = resp.json()
    for h in hits:
        g = h.get("geojson")
        if (
            h.get("osm_type") == "relation"
            and g
            and g.get("type") in ("Polygon", "MultiPolygon")
        ):
            return h
    for h in hits:
        g = h.get("geojson")
        if g and g.get("type") in ("Polygon", "MultiPolygon"):
            return h
    return None


def build_metro_boundaries(cache: Path) -> gpd.GeoDataFrame:
    if cache.exists():
        try:
            cached = gpd.read_file(cache)
            if not cached.empty:
                return cached
        except Exception:  # noqa: BLE001
            pass

    rows: list[dict[str, Any]] = []
    for query, label, kind in (
        ("Tambaram, Chengalpattu, Tamil Nadu", "Tambaram", "municipal_boundary"),
        ("Chengalpattu, Tamil Nadu", "Chengalpattu", "admin_boundary"),
    ):
        hit = nominatim_relation(query)
        if not hit:
            continue
        geom = shape(hit["geojson"])
        rows.append(
            {
                "name": label,
                "label": label,
                "kind": kind,
                "source": "OSM Nominatim",
                "osm_id": hit.get("osm_id"),
                "note": (
                    "OSM administrative boundary. Not GCC wards. "
                    "Tambaram official ward maps on OpenCity are PDF-only."
                    if label == "Tambaram"
                    else "OSM administrative boundary covering Chengalpattu area (may be taluk-scale)."
                ),
                "geometry": geom,
            }
        )

    # Mahabalipuram — town often lacks a polygon; use an explicit study buffer
    mam = Point(80.1928, 12.6208).buffer(0.035)
    rows.append(
        {
            "name": "Mahabalipuram",
            "label": "Mahabalipuram (study buffer)",
            "kind": "study_buffer",
            "source": "Derived buffer around Mamallapuram town point",
            "osm_id": None,
            "note": (
                "Approx. 3–4 km study buffer around Mahabalipuram / Mamallapuram — "
                "not an official municipal ward map."
            ),
            "geometry": mam,
        }
    )

    gdf = gpd.GeoDataFrame(rows, crs=4326)
    cache.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(cache, driver="GeoJSON")
    return gdf


def build_corridor_aois(omr: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    omr_geom = omr.geometry.iloc[0]
    buffer = omr_geom.buffer(0.012) if omr_geom and not omr_geom.is_empty else box(
        80.17, 12.60, 80.27, 12.99
    )
    rows = [
        {
            "name": "OMR → Mahabalipuram",
            "label": "OMR → Mahabalipuram",
            "kind": "corridor_aoi",
            "note": "Buffer around OSM OMR / Rajiv Gandhi Salai toward Mahabalipuram.",
            "geometry": buffer,
        },
        {
            "name": "Toward Tambaram",
            "label": "Toward Tambaram",
            "kind": "corridor_aoi",
            "note": "Focus AOI for Tambaram / southern GST approaches (not official wards).",
            "geometry": box(80.05, 12.86, 80.19, 13.02),
        },
        {
            "name": "Toward Chengalpattu",
            "label": "Toward Chengalpattu",
            "kind": "corridor_aoi",
            "note": "Focus AOI along approaches to Chengalpattu (not official wards).",
            "geometry": box(79.90, 12.65, 80.10, 12.88),
        },
    ]
    return gpd.GeoDataFrame(rows, crs=4326)


def count_points_in(poly, points: gpd.GeoDataFrame | None) -> int:
    if points is None or points.empty or poly is None or poly.is_empty:
        return 0
    return int(points.within(poly).sum())


def build_corridor_inventory(
    boundaries: gpd.GeoDataFrame,
    aois: gpd.GeoDataFrame,
    stops: gpd.GeoDataFrame | None,
    shelters: gpd.GeoDataFrame | None,
    hubs: gpd.GeoDataFrame | None,
) -> dict[str, Any]:
    units = []
    for frame, default_kind in ((boundaries, "boundary"), (aois, "aoi")):
        for _, row in frame.iterrows():
            geom = row.geometry
            units.append(
                {
                    "id": row.get("label") or row.get("name"),
                    "label": row.get("label") or row.get("name"),
                    "kind": row.get("kind") or default_kind,
                    "note": row.get("note"),
                    "stop_count": count_points_in(geom, stops),
                    "shelter_count": count_points_in(geom, shelters),
                    "hub_count": count_points_in(geom, hubs),
                    "bbox": [round(float(x), 5) for x in geom.bounds] if geom else None,
                }
            )
    return {
        "status": "loaded",
        "note": (
            "Extended metro corridors beyond GCC wards: OMR to Mahabalipuram, Tambaram, "
            "and Chengalpattu. Boundaries from OSM where available; AOIs are study boxes, "
            "not official ward delimitation (Tambaram ward PDFs are not machine-readable)."
        ),
        "areas": units,
    }


def build_metro_extension(
    *,
    stops: gpd.GeoDataFrame | None = None,
    shelters: gpd.GeoDataFrame | None = None,
    hubs: gpd.GeoDataFrame | None = None,
) -> dict[str, Any]:
    RAW.mkdir(parents=True, exist_ok=True)
    PROCESSED.mkdir(parents=True, exist_ok=True)

    result: dict[str, Any] = {"layers": {}, "inventory": None, "errors": []}

    try:
        overpass = fetch_overpass(RAW / "overpass_omr.json")
        omr = build_omr_line(overpass)
        omr.to_file(PROCESSED / "omr_corridor.geojson", driver="GeoJSON")
        result["layers"]["omr_corridor"] = {
            "status": "loaded",
            "file": "omr_corridor.geojson",
            "feature_count": int(len(omr)),
            "notes": "OSM OMR / Rajiv Gandhi Salai (SH49A) toward Mahabalipuram.",
        }
    except Exception as exc:  # noqa: BLE001
        result["errors"].append(f"omr_corridor: {exc}")
        result["layers"]["omr_corridor"] = {"status": "unavailable", "error": str(exc)}
        omr = gpd.GeoDataFrame(
            [
                {
                    "corridor": "OMR fallback",
                    "geometry": LineString(
                        [(80.22, 12.98), (80.23, 12.85), (80.20, 12.70), (80.19, 12.62)]
                    ),
                }
            ],
            crs=4326,
        )

    try:
        boundaries = build_metro_boundaries(PROCESSED / "metro_area_boundaries.geojson")
        result["layers"]["metro_area_boundaries"] = {
            "status": "loaded",
            "file": "metro_area_boundaries.geojson",
            "feature_count": int(len(boundaries)),
            "notes": "OSM Tambaram & Chengalpattu boundaries + Mahabalipuram study buffer.",
            "attributes": ["name", "kind", "note", "source"],
        }
    except Exception as exc:  # noqa: BLE001
        result["errors"].append(f"metro_area_boundaries: {exc}")
        result["layers"]["metro_area_boundaries"] = {
            "status": "unavailable",
            "error": str(exc),
        }
        boundaries = gpd.GeoDataFrame(geometry=[], crs=4326)

    aois = build_corridor_aois(omr)
    aois.to_file(PROCESSED / "corridor_aois.geojson", driver="GeoJSON")
    result["layers"]["corridor_aois"] = {
        "status": "loaded",
        "file": "corridor_aois.geojson",
        "feature_count": int(len(aois)),
        "notes": "Study AOIs for OMR, Tambaram, Chengalpattu — not official wards.",
    }

    result["inventory"] = build_corridor_inventory(
        boundaries, aois, stops, shelters, hubs
    )
    return result


if __name__ == "__main__":
    import sys

    stops = (
        gpd.read_file(PROCESSED / "stops.geojson")
        if (PROCESSED / "stops.geojson").exists()
        else None
    )
    shelters = (
        gpd.read_file(PROCESSED / "shelters.geojson")
        if (PROCESSED / "shelters.geojson").exists()
        else None
    )
    hubs = (
        gpd.read_file(PROCESSED / "hubs.geojson")
        if (PROCESSED / "hubs.geojson").exists()
        else None
    )
    out = build_metro_extension(stops=stops, shelters=shelters, hubs=hubs)
    print(json.dumps({k: out[k] for k in ("layers", "errors")}, indent=2))
    if out.get("inventory"):
        for a in out["inventory"]["areas"]:
            print(
                f"- {a['label']}: stops={a['stop_count']} shelters={a['shelter_count']} hubs={a['hub_count']}"
            )
    sys.exit(0 if out["layers"] else 1)
