#!/usr/bin/env python3
"""
Citywide OSM-network walk isochrones from GTFS stops + hubs.

Multi-source Dijkstra on the cached walk graph; dissolve node buffers into
exclusive rings at 5 / 10 / 15 minutes (80 m/min).

Partial: OSM completeness + speed assumption. Not crow-flies. Not population-weighted.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
from shapely.geometry import GeometryCollection, MultiPolygon, Point, Polygon, mapping
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
WEB = ROOT / "apps" / "web" / "public" / "data"

WALK_SPEED_M_PER_MIN = 80.0
# Exclusive rings (network metres)
BANDS = [
    ("within_5min", 5, 0, 5 * WALK_SPEED_M_PER_MIN),
    ("band_5_10min", 10, 5 * WALK_SPEED_M_PER_MIN, 10 * WALK_SPEED_M_PER_MIN),
    ("band_10_15min", 15, 10 * WALK_SPEED_M_PER_MIN, 15 * WALK_SPEED_M_PER_MIN),
]
NODE_BUFFER_M = 70.0
SIMPLIFY_M = 25.0


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _copy_web(name: str) -> None:
    src = PROCESSED / name
    if src.exists():
        WEB.mkdir(parents=True, exist_ok=True)
        (WEB / name).write_bytes(src.read_bytes())


def _as_multipolygon(geom) -> MultiPolygon | Polygon | None:
    if geom is None or geom.is_empty:
        return None
    if isinstance(geom, (Polygon, MultiPolygon)):
        return geom
    if isinstance(geom, GeometryCollection):
        polys = [g for g in geom.geoms if isinstance(g, (Polygon, MultiPolygon))]
        if not polys:
            return None
        return unary_union(polys)
    return None


def _km2(geom) -> float:
    if geom is None or geom.is_empty:
        return 0.0
    g = gpd.GeoSeries([geom], crs=3857)
    return round(float(g.area.sum()) / 1e6, 2)


def nodes_within(G, lengths: dict, max_m: float) -> list:
    return [n for n, d in lengths.items() if d is not None and d <= max_m]


def dissolve_nodes(G, node_ids: list, buffer_m: float = NODE_BUFFER_M):
    if not node_ids:
        return None
    # osmnx: x=lon, y=lat
    pts = []
    for n in node_ids:
        data = G.nodes[n]
        x = data.get("x")
        y = data.get("y")
        if x is None or y is None:
            continue
        pts.append(Point(float(x), float(y)))
    if not pts:
        return None
    gdf = gpd.GeoDataFrame(geometry=pts, crs=4326).to_crs(3857)
    dissolved = unary_union(list(gdf.geometry.buffer(buffer_m).values))
    dissolved = dissolved.buffer(0)
    if SIMPLIFY_M > 0:
        dissolved = dissolved.simplify(SIMPLIFY_M, preserve_topology=True)
    return _as_multipolygon(dissolved)


def build_walk_isochrones(
    stops: gpd.GeoDataFrame | None,
    hubs: gpd.GeoDataFrame | None = None,
    mrts: gpd.GeoDataFrame | None = None,
    wards: gpd.GeoDataFrame | None = None,
    omr: gpd.GeoDataFrame | None = None,
    metro_areas: gpd.GeoDataFrame | None = None,
    corridor_aois: gpd.GeoDataFrame | None = None,
) -> dict[str, Any]:
    from build_walk_distance_bands import build_access_points, build_study_area
    from build_ward_walk_access import load_or_build_walk_graph
    import networkx as nx
    import osmnx as ox

    result: dict[str, Any] = {"status": "unavailable", "layers": {}, "analysis": {}, "errors": []}

    if wards is None or wards.empty:
        result["errors"].append("wards missing")
        return result
    if stops is None or stops.empty:
        result["errors"].append("stops missing")
        return result

    access, access_counts = build_access_points(stops, hubs=hubs, mrts=mrts)
    if access.empty:
        result["errors"].append("no access points")
        return result

    study_geom, study_meta = build_study_area(
        wards, omr=omr, metro_areas=metro_areas, corridor_aois=corridor_aois
    )
    study_m = study_geom.buffer(0)

    print("[…] walk isochrones — loading OSM walk graph")
    G = load_or_build_walk_graph()

    access_ll = access.to_crs(4326)
    pt_lon = [float(g.x) for g in access_ll.geometry]
    pt_lat = [float(g.y) for g in access_ll.geometry]
    pt_nodes = ox.distance.nearest_nodes(G, pt_lon, pt_lat)
    if np.isscalar(pt_nodes):
        sources = [int(pt_nodes)]
    else:
        sources = list({int(n) for n in pt_nodes if n in G})
    if not sources:
        result["errors"].append("no graph nodes near access points")
        return result

    print(f"  [route] multi-source Dijkstra from {len(sources)} PT nodes …")
    lengths = nx.multi_source_dijkstra_path_length(G, sources, weight="length")
    print(f"  [route] reachable nodes={len(lengths)}")

    # Cumulative dissolves at 5 / 10 / 15 min
    cum: dict[int, Any] = {}
    for minutes in (5, 10, 15):
        max_m = minutes * WALK_SPEED_M_PER_MIN
        ids = nodes_within(G, lengths, max_m)
        print(f"  [band] ≤{minutes} min → {len(ids)} nodes")
        poly = dissolve_nodes(G, ids)
        if poly is not None:
            poly = study_m.intersection(poly)
            poly = _as_multipolygon(poly.buffer(0) if hasattr(poly, "buffer") else poly)
        cum[minutes] = poly

    features: list[dict[str, Any]] = []
    counts: dict[str, Any] = {
        "access_points": access_counts,
        "pt_source_nodes": len(sources),
        "reachable_nodes": len(lengths),
        "study_area_km2": study_meta.get("study_area_km2"),
        "walk_speed_m_per_min": WALK_SPEED_M_PER_MIN,
        "node_buffer_m": NODE_BUFFER_M,
    }

    prev = None
    for band_id, max_min, lo_m, hi_m in BANDS:
        outer = cum.get(max_min)
        if outer is None or outer.is_empty:
            counts[f"{band_id}_km2"] = 0.0
            continue
        if prev is not None and not prev.is_empty:
            ring = outer.difference(prev)
        else:
            ring = outer
        ring = _as_multipolygon(ring.buffer(0) if hasattr(ring, "buffer") else ring)
        prev = outer
        if ring is None or ring.is_empty:
            counts[f"{band_id}_km2"] = 0.0
            continue
        area = _km2(ring)
        counts[f"{band_id}_km2"] = area
        # to WGS84 for GeoJSON
        ring_ll = gpd.GeoSeries([ring], crs=3857).to_crs(4326).iloc[0]
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "band": band_id,
                    "max_walk_min": max_min,
                    "min_network_m": lo_m,
                    "max_network_m": hi_m,
                    "area_km2": area,
                    "method": "osm_network_multisource",
                    "walk_speed_m_per_min": WALK_SPEED_M_PER_MIN,
                    "note": (
                        "OSM pedestrian network isochrone (Partial). "
                        f"Nodes within {max_min} min of nearest GTFS stop/hub at "
                        f"{WALK_SPEED_M_PER_MIN:.0f} m/min."
                    ),
                },
                "geometry": mapping(ring_ll),
            }
        )

    if not features:
        result["errors"].append("no isochrone polygons produced")
        return result

    fc = {"type": "FeatureCollection", "features": features}
    PROCESSED.mkdir(parents=True, exist_ok=True)
    out_name = "walk_isochrones.geojson"
    (PROCESSED / out_name).write_text(json.dumps(fc))
    _copy_web(out_name)

    note = (
        "OSM network walk isochrones from existing GTFS stops + MRTS/metro hubs. "
        "Bands: ≤5 min, 5–10 min, 10–15 min at 80 m/min (4.8 km/h). "
        "Multi-source Dijkstra on osmnx walk graph; node buffers dissolved. "
        "Partial — OSM completeness. Not crow-flies; not population-weighted. "
        "Proposed metro stations not included."
    )
    study_km2 = counts.get("study_area_km2") or 0
    for band_id, *_ in BANDS:
        a = counts.get(f"{band_id}_km2") or 0
        if study_km2:
            counts[f"pct_{band_id}"] = round(100.0 * a / study_km2, 1)

    meta = {
        "status": "partial",
        "file": out_name,
        "feature_count": len(features),
        "attributes": ["band", "max_walk_min", "min_network_m", "max_network_m", "area_km2"],
        "notes": note,
        "derived_from": ["stops", "hubs", "mrts_stations", "chennai_osm_walk_graph"],
    }
    result["status"] = "partial"
    result["layers"]["walk_isochrones"] = meta
    result["analysis"] = {
        "status": "partial",
        "generated_at": _now(),
        "note": note,
        "method": {
            "network": "OSMNx walk + multi_source_dijkstra_path_length",
            "walk_speed_m_per_min": WALK_SPEED_M_PER_MIN,
            "bands_min": [5, 10, 15],
            "node_buffer_m": NODE_BUFFER_M,
        },
        "counts": counts,
        "study": study_meta,
        "file": out_name,
    }
    print(
        f"[ok] walk_isochrones features={len(features)} "
        f"km2={ {b[0]: counts.get(f'{b[0]}_km2') for b in BANDS} }"
    )
    return result


def main() -> int:
    def _load(name: str) -> gpd.GeoDataFrame | None:
        for base in (PROCESSED, WEB):
            path = base / name
            if path.exists():
                try:
                    return gpd.read_file(path)
                except Exception as exc:  # noqa: BLE001
                    print(f"[warn] {path}: {exc}", file=sys.stderr)
        return None

    stops = _load("stops.geojson")
    hubs = _load("hubs.geojson")
    mrts = _load("mrts_stations.geojson")
    wards = _load("wards.geojson")
    omr = _load("omr_corridor.geojson")
    metro = _load("metro_area_boundaries.geojson")
    aois = _load("corridor_aois.geojson")

    payload = build_walk_isochrones(
        stops,
        hubs=hubs,
        mrts=mrts,
        wards=wards,
        omr=omr,
        metro_areas=metro,
        corridor_aois=aois,
    )

    if (PROCESSED / "manifest.json").exists():
        manifest = json.loads((PROCESSED / "manifest.json").read_text())
        for key, meta in payload.get("layers", {}).items():
            manifest.setdefault("layers", {})[key] = meta
        (PROCESSED / "manifest.json").write_text(json.dumps(manifest, indent=2))
        _copy_web("manifest.json")

    if (PROCESSED / "analyses.json").exists() and payload.get("analysis"):
        analyses = json.loads((PROCESSED / "analyses.json").read_text())
        analyses["walk_isochrones"] = payload["analysis"]
        (PROCESSED / "analyses.json").write_text(json.dumps(analyses, indent=2))
        _copy_web("analyses.json")

    if payload.get("status") not in ("partial", "loaded"):
        print(f"[fail] walk_isochrones: {payload.get('errors')}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
