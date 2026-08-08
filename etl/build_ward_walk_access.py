#!/usr/bin/env python3
"""
Ward-level walk access to public transport.

1) Crow-flies mean distance (EPSG:3857 grid samples → nearest stop/hub).
2) OSM pedestrian-network walk distance & time (Partial):
   multi-source Dijkstra on an OSMNx walk graph from all PT-snapped nodes.

Not population-weighted. Not an equity score. Not Google Maps.
"""

from __future__ import annotations

import json
import math
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
RAW = ROOT / "data" / "raw"
GRAPH_CACHE = RAW / "chennai_osm_walk_graph.graphml"

SPACING_M = 150
MAX_SAMPLES = 400
# Typical urban pedestrian speed used in accessibility studies
WALK_SPEED_M_PER_MIN = 80.0  # 4.8 km/h
# Slightly padded GCC / CMA study box (north, south, east, west) for osmnx
WALK_BBOX = (13.28, 12.78, 80.36, 79.98)


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


def load_or_build_walk_graph():
    """Download / cache OSM walk network for the study bbox."""
    import osmnx as ox

    ox.settings.use_cache = True
    ox.settings.log_console = False
    RAW.mkdir(parents=True, exist_ok=True)

    if GRAPH_CACHE.exists() and GRAPH_CACHE.stat().st_size > 1_000_000:
        print(f"  [cache] loading walk graph {GRAPH_CACHE.name}")
        return ox.load_graphml(GRAPH_CACHE)

    north, south, east, west = WALK_BBOX
    print(f"  [download] OSM walk graph bbox N{north} S{south} E{east} W{west} …")
    G = ox.graph_from_bbox(
        bbox=(west, south, east, north),
        network_type="walk",
        simplify=True,
        retain_all=False,
    )
    # Ensure metric edge lengths
    G = ox.distance.add_edge_lengths(G)
    ox.save_graphml(G, GRAPH_CACHE)
    print(f"  [ok] saved {GRAPH_CACHE} nodes={G.number_of_nodes()} edges={G.number_of_edges()}")
    return G


def network_distances_to_pt(
    G,
    sample_lonlat: list[tuple[float, float]],
    pt_lonlat: list[tuple[float, float]],
) -> np.ndarray:
    """
    For each sample (lon, lat), network metres to nearest PT via multi-source Dijkstra.
    Unreachable / failed snaps → NaN.
    """
    import networkx as nx
    import osmnx as ox

    if not sample_lonlat or not pt_lonlat:
        return np.full(len(sample_lonlat), np.nan)

    pt_x = [p[0] for p in pt_lonlat]
    pt_y = [p[1] for p in pt_lonlat]
    pt_nodes = ox.distance.nearest_nodes(G, pt_x, pt_y)
    if np.isscalar(pt_nodes):
        pt_nodes = [int(pt_nodes)]
    else:
        pt_nodes = [int(n) for n in pt_nodes]
    sources = list({n for n in pt_nodes if n in G})

    if not sources:
        return np.full(len(sample_lonlat), np.nan)

    print(f"  [route] multi-source Dijkstra from {len(sources)} PT nodes …")
    lengths = nx.multi_source_dijkstra_path_length(G, sources, weight="length")

    sx = [p[0] for p in sample_lonlat]
    sy = [p[1] for p in sample_lonlat]
    sample_nodes = ox.distance.nearest_nodes(G, sx, sy)
    if np.isscalar(sample_nodes):
        sample_nodes = [int(sample_nodes)]
    else:
        sample_nodes = [int(n) for n in sample_nodes]

    out = np.empty(len(sample_nodes), dtype=float)
    for i, node in enumerate(sample_nodes):
        d = lengths.get(node)
        out[i] = float(d) if d is not None else np.nan
    return out


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

    pt_ll = gpd.GeoDataFrame(
        pd.concat(frames, ignore_index=True),
        crs=stops.crs if stops is not None else hubs.crs,
    )
    pt_ll = pt_ll[~pt_ll.geometry.isna() & ~pt_ll.geometry.is_empty].to_crs(4326).reset_index(drop=True)
    pt_m = pt_ll.to_crs(3857)
    pt_lonlat = [(float(g.x), float(g.y)) for g in pt_ll.geometry]

    w_m = wards.to_crs(3857)
    w_ll = wards.to_crs(4326)
    rng = np.random.default_rng(42)

    # Collect all sample points (3857 + 4326) with ward labels
    sample_records: list[dict[str, Any]] = []
    for idx, w in w_m.iterrows():
        label = str(w.get("ward_label") or "")
        pts_m = sample_points(w.geometry, SPACING_M, rng)
        # matching lon/lat via transform
        g_m = gpd.GeoDataFrame(geometry=pts_m, crs=3857)
        g_ll = g_m.to_crs(4326)
        for pm, pl in zip(g_m.geometry, g_ll.geometry):
            sample_records.append(
                {
                    "label": label,
                    "geom_m": pm,
                    "lon": float(pl.x),
                    "lat": float(pl.y),
                }
            )

    # Crow-flies to nearest PT
    print(f"  [crowflies] {len(sample_records)} samples → {len(pt_m)} PT points")
    sample_g = gpd.GeoDataFrame(
        {"label": [r["label"] for r in sample_records]},
        geometry=[r["geom_m"] for r in sample_records],
        crs=3857,
    )
    joined = gpd.sjoin_nearest(sample_g, pt_m[["geometry"]], how="left", distance_col="d_euclid")
    # sjoin_nearest can duplicate; take min per original index
    euclid = joined.groupby(joined.index)["d_euclid"].min()
    sample_g["d_euclid"] = sample_g.index.map(lambda i: float(euclid.get(i, np.nan)))

    # Network distances
    network_status = "unavailable"
    network_error: str | None = None
    network_meta: dict[str, Any] = {}
    try:
        G = load_or_build_walk_graph()
        network_meta = {
            "nodes": int(G.number_of_nodes()),
            "edges": int(G.number_of_edges()),
            "bbox": list(WALK_BBOX),
            "walk_speed_m_per_min": WALK_SPEED_M_PER_MIN,
            "walk_speed_kmh": round(WALK_SPEED_M_PER_MIN * 0.06, 2),
            "graph_cache": str(GRAPH_CACHE.relative_to(ROOT)),
        }
        d_net = network_distances_to_pt(
            G,
            [(r["lon"], r["lat"]) for r in sample_records],
            pt_lonlat,
        )
        sample_g["d_network"] = d_net
        routed = int(np.isfinite(d_net).sum())
        network_status = "partial" if routed < len(d_net) else "loaded"
        network_meta["samples_routed"] = routed
        network_meta["samples_total"] = int(len(d_net))
        network_meta["pct_routed"] = round(100.0 * routed / max(len(d_net), 1), 1)
        print(f"  [ok] network routed {routed}/{len(d_net)} samples ({network_meta['pct_routed']}%)")
    except Exception as exc:  # noqa: BLE001
        network_error = str(exc)[:500]
        sample_g["d_network"] = np.nan
        print(f"  [fail] network walk: {exc}")

    rows: list[dict[str, Any]] = []
    for label, grp in sample_g.groupby("label"):
        d = grp["d_euclid"]
        dn = grp["d_network"]
        dn_ok = dn[np.isfinite(dn)]
        mean_net = float(dn_ok.mean()) if len(dn_ok) else None
        med_net = float(dn_ok.median()) if len(dn_ok) else None
        p90_net = float(dn_ok.quantile(0.9)) if len(dn_ok) else None
        mean_min = round(mean_net / WALK_SPEED_M_PER_MIN, 1) if mean_net is not None else None
        med_min = round(med_net / WALK_SPEED_M_PER_MIN, 1) if med_net is not None else None
        p90_min = round(p90_net / WALK_SPEED_M_PER_MIN, 1) if p90_net is not None else None
        rows.append(
            {
                "label": str(label),
                "sample_points": int(len(grp)),
                "mean_walk_m": round(float(d.mean()), 1),
                "median_walk_m": round(float(d.median()), 1),
                "p90_walk_m": round(float(d.quantile(0.9)), 1),
                "pct_samples_within_400m": round(float((d <= 400).mean() * 100), 1),
                "pct_samples_within_800m": round(float((d <= 800).mean() * 100), 1),
                "mean_network_m": round(mean_net, 1) if mean_net is not None else None,
                "median_network_m": round(med_net, 1) if med_net is not None else None,
                "p90_network_m": round(p90_net, 1) if p90_net is not None else None,
                "mean_walk_min": mean_min,
                "median_walk_min": med_min,
                "p90_walk_min": p90_min,
                "pct_samples_within_5min": (
                    round(float((dn_ok <= WALK_SPEED_M_PER_MIN * 5).mean() * 100), 1)
                    if len(dn_ok)
                    else None
                ),
                "pct_samples_within_10min": (
                    round(float((dn_ok <= WALK_SPEED_M_PER_MIN * 10).mean() * 100), 1)
                    if len(dn_ok)
                    else None
                ),
                "pct_network_routed": round(100.0 * len(dn_ok) / max(len(grp), 1), 1),
            }
        )

    # Sort by network time when available, else crow-flies
    rows.sort(
        key=lambda r: (
            -(r["mean_walk_min"] if r["mean_walk_min"] is not None else r["mean_walk_m"] or 0),
            r["label"],
        )
    )
    means = [r["mean_walk_m"] for r in rows if r["mean_walk_m"] is not None]
    city_mean = round(sum(means) / len(means), 1) if means else None
    net_means = [r["mean_walk_min"] for r in rows if r["mean_walk_min"] is not None]
    city_mean_min = round(sum(net_means) / len(net_means), 1) if net_means else None

    status = "loaded"
    if network_status == "unavailable":
        status = "partial"

    note = (
        "Ward grid samples (~150m) to nearest GTFS stop or MRTS/metro hub. "
        "mean_walk_m = crow-flies. mean_walk_min = OSM pedestrian-network path length "
        f"÷ {WALK_SPEED_M_PER_MIN:.0f} m/min (4.8 km/h). "
        "OSM walk graph is Partial (missing alleys / sidewalk tags). "
        "Not Google Maps, not population-weighted, not an equity score."
    )

    return {
        "status": status,
        "generated_at": _now(),
        "note": note,
        "method": {
            "spacing_m": SPACING_M,
            "max_samples_per_ward": MAX_SAMPLES,
            "pt_layers": ["stops", "hubs"],
            "crow_flies": "Euclidean (EPSG:3857)",
            "network": "OSMNx network_type=walk + multi-source Dijkstra (length metres)",
            "walk_speed_m_per_min": WALK_SPEED_M_PER_MIN,
            "network_status": network_status,
            "network_error": network_error,
            "network_meta": network_meta,
        },
        "city": {
            "mean_of_ward_means_m": city_mean,
            "mean_of_ward_means_min": city_mean_min,
            "wards": len(rows),
        },
        "wards": rows,
        "priority_long_walk": [
            r
            for r in rows
            if (r["mean_walk_min"] is not None and r["mean_walk_min"] >= 10)
            or (r["mean_walk_min"] is None and (r["mean_walk_m"] or 0) >= 500)
        ][:25],
    }


def merge_into_reports(payload: dict[str, Any]) -> None:
    path = PROCESSED / "reports.json"
    if not path.exists() or payload.get("status") not in ("loaded", "partial"):
        return
    reports = json.loads(path.read_text())
    by = {str(w["label"]): w for w in payload.get("wards") or []}
    fields = [
        "mean_walk_m",
        "median_walk_m",
        "p90_walk_m",
        "pct_samples_within_400m",
        "pct_samples_within_800m",
        "mean_network_m",
        "median_network_m",
        "p90_network_m",
        "mean_walk_min",
        "median_walk_min",
        "p90_walk_min",
        "pct_samples_within_5min",
        "pct_samples_within_10min",
        "pct_network_routed",
    ]
    for unit in reports.get("wards") or []:
        hit = by.get(str(unit.get("label") or ""))
        if not hit:
            continue
        for f in fields:
            unit[f] = hit.get(f)
        unit["walk_sample_points"] = hit.get("sample_points")
    reports["city_mean_walk_m"] = (payload.get("city") or {}).get("mean_of_ward_means_m")
    reports["city_mean_walk_min"] = (payload.get("city") or {}).get("mean_of_ward_means_min")
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

    print("[…] ward walk access (crow-flies + OSM network)")
    payload = build_ward_walk_access(wards, stops, hubs)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    (PROCESSED / "ward_walk_access.json").write_text(json.dumps(payload, indent=2))
    _copy_web("ward_walk_access.json")

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
    city_m = (payload.get("city") or {}).get("mean_of_ward_means_m")
    city_min = (payload.get("city") or {}).get("mean_of_ward_means_min")
    print(
        f"[ok] ward_walk_access status={payload.get('status')} "
        f"city_mean={city_m}m / {city_min}min wards={len(payload.get('wards') or [])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
