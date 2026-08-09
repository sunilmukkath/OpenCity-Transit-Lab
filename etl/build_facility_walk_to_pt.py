#!/usr/bin/env python3
"""
OSM-network walk time from schools / healthcare to nearest PT (stop or hub).

One multi-source Dijkstra from PT access points; look up each facility node.
Also writes crow-flies link lines facility → nearest access point for the map.

Partial: OSM completeness + 80 m/min. Not crow-flies minutes. Not equity.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd
from shapely.geometry import LineString, mapping

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
WEB = ROOT / "apps" / "web" / "public" / "data"

WALK_SPEED_M_PER_MIN = 80.0
BANDS = [
    ("within_5min", 5.0),
    ("band_5_10min", 10.0),
    ("band_10_15min", 15.0),
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _copy_web(name: str) -> None:
    src = PROCESSED / name
    if src.exists():
        WEB.mkdir(parents=True, exist_ok=True)
        (WEB / name).write_bytes(src.read_bytes())


def _band(walk_min: float | None) -> str:
    if walk_min is None or not np.isfinite(walk_min):
        return "unroutable"
    if walk_min <= 5:
        return "within_5min"
    if walk_min <= 10:
        return "band_5_10min"
    if walk_min <= 15:
        return "band_10_15min"
    return "over_15min"


def _band_counts(walk_mins: list[float | None]) -> dict[str, int]:
    out = {
        "within_5min": 0,
        "band_5_10min": 0,
        "band_10_15min": 0,
        "over_15min": 0,
        "unroutable": 0,
    }
    for m in walk_mins:
        out[_band(m)] += 1
    return out


def _load_layer(name: str) -> gpd.GeoDataFrame | None:
    for base in (PROCESSED, WEB):
        path = base / f"{name}.geojson"
        if path.exists():
            gdf = gpd.read_file(path)
            if not gdf.empty:
                return gdf
    return None


def enrich_facilities(
    facilities: gpd.GeoDataFrame,
    *,
    layer_key: str,
    lengths: dict,
    G,
    access_ll: gpd.GeoDataFrame,
) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame, dict[str, Any]]:
    import osmnx as ox
    from scipy.spatial import cKDTree

    fac = facilities.copy()
    if fac.crs is None:
        fac = fac.set_crs(4326)
    fac_ll = fac.to_crs(4326)
    lon = [float(g.x) for g in fac_ll.geometry]
    lat = [float(g.y) for g in fac_ll.geometry]
    nodes = ox.distance.nearest_nodes(G, lon, lat)
    if np.isscalar(nodes):
        nodes = [int(nodes)]
    else:
        nodes = [int(n) for n in nodes]

    access_xy = np.array([[float(g.x), float(g.y)] for g in access_ll.geometry])
    tree = cKDTree(access_xy)
    fac_xy = np.column_stack([lon, lat])
    # KDTree in lon/lat is approximate; fine for nearest-stop display link
    _, nn_idx = tree.query(fac_xy, k=1)

    walk_m: list[float | None] = []
    walk_min: list[float | None] = []
    bands: list[str] = []
    link_rows: list[dict[str, Any]] = []

    for i, node in enumerate(nodes):
        d = lengths.get(node)
        if d is None:
            wm: float | None = None
            wmin: float | None = None
        else:
            wm = float(d)
            wmin = round(wm / WALK_SPEED_M_PER_MIN, 2)
        walk_m.append(wm)
        walk_min.append(wmin)
        b = _band(wmin)
        bands.append(b)

        j = int(nn_idx[i]) if np.isscalar(nn_idx) is False else int(nn_idx)
        pt = access_ll.geometry.iloc[j]
        fac_pt = fac_ll.geometry.iloc[i]
        name = (
            fac_ll.iloc[i].get("name")
            or fac_ll.iloc[i].get("Name")
            or fac_ll.iloc[i].get("ADDRESS")
            or f"{layer_key} {i + 1}"
        )
        link_rows.append(
            {
                "facility_layer": layer_key,
                "facility_name": str(name) if name is not None else layer_key,
                "walk_network_m": None if wm is None else round(wm, 1),
                "walk_min_to_pt": wmin,
                "walk_band": b,
                "geometry": LineString(
                    [(float(fac_pt.x), float(fac_pt.y)), (float(pt.x), float(pt.y))]
                ),
            }
        )

    fac_ll["walk_network_m"] = [
        None if v is None else round(v, 1) for v in walk_m
    ]
    fac_ll["walk_min_to_pt"] = walk_min
    fac_ll["walk_band"] = bands
    fac_ll["walk_method"] = "osm_network_to_nearest_pt"
    fac_ll["walk_speed_m_per_min"] = WALK_SPEED_M_PER_MIN

    links = gpd.GeoDataFrame(link_rows, crs=4326)
    counts = _band_counts(walk_min)
    finite = [m for m in walk_min if m is not None and np.isfinite(m)]
    summary = {
        "total": len(fac_ll),
        "band_counts": counts,
        "pct_within_5min": round(100 * counts["within_5min"] / len(fac_ll), 1)
        if len(fac_ll)
        else None,
        "pct_within_10min": round(
            100
            * (counts["within_5min"] + counts["band_5_10min"])
            / len(fac_ll),
            1,
        )
        if len(fac_ll)
        else None,
        "pct_within_15min": round(
            100
            * (
                counts["within_5min"]
                + counts["band_5_10min"]
                + counts["band_10_15min"]
            )
            / len(fac_ll),
            1,
        )
        if len(fac_ll)
        else None,
        "mean_walk_min": round(float(np.mean(finite)), 2) if finite else None,
        "median_walk_min": round(float(np.median(finite)), 2) if finite else None,
    }
    return fac_ll, links, summary


def build() -> dict[str, Any]:
    from build_walk_distance_bands import build_access_points
    from build_ward_walk_access import load_or_build_walk_graph
    import networkx as nx
    import osmnx as ox

    result: dict[str, Any] = {
        "status": "unavailable",
        "generated_at": _now(),
        "layers": {},
        "analysis": {},
        "errors": [],
    }

    stops = _load_layer("stops")
    hubs = _load_layer("hubs")
    mrts = _load_layer("mrts_stations")
    schools = _load_layer("schools")
    healthcare = _load_layer("healthcare")

    if stops is None or stops.empty:
        result["errors"].append("stops missing")
        return result
    if (schools is None or schools.empty) and (healthcare is None or healthcare.empty):
        result["errors"].append("schools and healthcare missing")
        return result

    access, access_counts = build_access_points(stops, hubs=hubs, mrts=mrts)
    if access.empty:
        result["errors"].append("no access points")
        return result

    print("[…] facility walk → PT — loading OSM walk graph")
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

    all_links: list[gpd.GeoDataFrame] = []
    analysis: dict[str, Any] = {
        "status": "partial",
        "note": (
            "OSM network walk minutes from each school / UPHC to the nearest GTFS stop "
            "or MRTS/metro hub at 80 m/min (4.8 km/h). Point colours use the same "
            "≤5 / 5–10 / 10–15 / >15 min bands as city walk isochrones. "
            "Link lines are crow-flies to the nearest access point for display only — "
            "minutes are network. Partial (OSM)."
        ),
        "walk_speed_m_per_min": WALK_SPEED_M_PER_MIN,
        "access_points": access_counts,
        "pt_source_nodes": len(sources),
        "schools": None,
        "healthcare": None,
    }

    PROCESSED.mkdir(parents=True, exist_ok=True)

    for key, gdf in (("schools", schools), ("healthcare", healthcare)):
        if gdf is None or gdf.empty:
            result["layers"][key] = {"status": "unavailable", "reason": "missing"}
            continue
        print(f"  [enrich] {key} n={len(gdf)}")
        enriched, links, summary = enrich_facilities(
            gdf, layer_key=key, lengths=lengths, G=G, access_ll=access_ll
        )
        out_name = f"{key}.geojson"
        enriched.to_file(PROCESSED / out_name, driver="GeoJSON")
        _copy_web(out_name)
        all_links.append(links)
        analysis[key] = summary
        result["layers"][key] = {
            "status": "partial",
            "feature_count": len(enriched),
            "file": out_name,
            "notes": analysis["note"],
            "walk_band_counts": summary["band_counts"],
        }
        print(
            f"  [ok] {key}: within_5min={summary['band_counts']['within_5min']} "
            f"mean_walk_min={summary['mean_walk_min']}"
        )

    if all_links:
        links_gdf = gpd.GeoDataFrame(
            pd.concat(all_links, ignore_index=True),
            geometry="geometry",
            crs=4326,
        )
        # Map clutter: keep all healthcare links + schools beyond 5 min walk
        keep = (links_gdf["facility_layer"] == "healthcare") | (
            links_gdf["walk_band"].isin(
                ["band_5_10min", "band_10_15min", "over_15min", "unroutable"]
            )
        )
        links_gdf = links_gdf.loc[keep].copy()
        link_name = "facility_pt_walk_links.geojson"
        features = []
        for _, row in links_gdf.iterrows():
            props = {
                k: (None if (isinstance(v, float) and not np.isfinite(v)) else v)
                for k, v in row.items()
                if k != "geometry"
            }
            features.append(
                {
                    "type": "Feature",
                    "properties": props,
                    "geometry": mapping(row.geometry),
                }
            )
        fc = {"type": "FeatureCollection", "features": features}
        (PROCESSED / link_name).write_text(json.dumps(fc, separators=(",", ":")))
        _copy_web(link_name)
        result["layers"]["facility_pt_walk_links"] = {
            "status": "partial",
            "feature_count": len(features),
            "file": link_name,
            "notes": (
                "Crow-flies links from schools/healthcare to nearest PT access point. "
                "walk_min_to_pt is OSM network minutes (Partial)."
            ),
        }
        print(f"  [ok] {link_name} ({len(features)} links)")

    result["status"] = "partial"
    result["analysis"] = analysis

    # analyses.json + manifest
    for base in (PROCESSED, WEB):
        ap = base / "analyses.json"
        if ap.exists():
            analyses = json.loads(ap.read_text())
        else:
            analyses = {}
        analyses["facility_walk_to_pt"] = analysis
        ap.write_text(json.dumps(analyses, indent=2, allow_nan=False))

        mp = base / "manifest.json"
        if not mp.exists():
            continue
        manifest = json.loads(mp.read_text())
        layers = manifest.setdefault("layers", {})
        for k, meta in result["layers"].items():
            layers[k] = {**layers.get(k, {}), **meta}
        mp.write_text(json.dumps(manifest, indent=2, allow_nan=False))

    return result


def main() -> int:
    try:
        out = build()
    except Exception as exc:  # noqa: BLE001
        print(f"[fail] facility_walk_to_pt: {exc}")
        return 1
    print(f"facility_walk_to_pt: {out.get('status')} layers={list(out.get('layers', {}))}")
    return 0 if out.get("status") != "unavailable" else 1


if __name__ == "__main__":
    raise SystemExit(main())
