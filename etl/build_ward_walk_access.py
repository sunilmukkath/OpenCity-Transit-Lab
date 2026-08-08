#!/usr/bin/env python3
"""
Ward-level OSM pedestrian-network walk time to public transport.

Samples a ~150m grid inside each ward, routes on an OSMNx walk graph to the
nearest GTFS stop or MRTS/metro hub (multi-source Dijkstra), converts path
length to minutes at 4.8 km/h.

Partial: OSM completeness. Not Google Maps. Not population-weighted. Not equity.
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
RAW = ROOT / "data" / "raw"
GRAPH_CACHE = RAW / "chennai_osm_walk_graph.graphml"

SPACING_M = 150
MAX_SAMPLES = 400
WALK_SPEED_M_PER_MIN = 80.0  # 4.8 km/h
WALK_BBOX = (13.28, 12.78, 80.36, 79.98)  # north, south, east, west (display); graph_from_bbox uses W,S,E,N


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
    G = ox.distance.add_edge_lengths(G)
    ox.save_graphml(G, GRAPH_CACHE)
    print(f"  [ok] saved {GRAPH_CACHE} nodes={G.number_of_nodes()} edges={G.number_of_edges()}")
    return G


def network_distances_to_pt(
    G,
    sample_lonlat: list[tuple[float, float]],
    pt_lonlat: list[tuple[float, float]],
) -> np.ndarray:
    import networkx as nx
    import osmnx as ox

    if not sample_lonlat or not pt_lonlat:
        return np.full(len(sample_lonlat), np.nan)

    pt_nodes = ox.distance.nearest_nodes(
        G, [p[0] for p in pt_lonlat], [p[1] for p in pt_lonlat]
    )
    if np.isscalar(pt_nodes):
        pt_nodes = [int(pt_nodes)]
    else:
        pt_nodes = [int(n) for n in pt_nodes]
    sources = list({n for n in pt_nodes if n in G})
    if not sources:
        return np.full(len(sample_lonlat), np.nan)

    print(f"  [route] multi-source Dijkstra from {len(sources)} PT nodes …")
    lengths = nx.multi_source_dijkstra_path_length(G, sources, weight="length")

    sample_nodes = ox.distance.nearest_nodes(
        G, [p[0] for p in sample_lonlat], [p[1] for p in sample_lonlat]
    )
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
    pt_lonlat = [(float(g.x), float(g.y)) for g in pt_ll.geometry]

    w_m = wards.to_crs(3857)
    rng = np.random.default_rng(42)

    sample_records: list[dict[str, Any]] = []
    for _, w in w_m.iterrows():
        label = str(w.get("ward_label") or "")
        pts_m = sample_points(w.geometry, SPACING_M, rng)
        g_ll = gpd.GeoDataFrame(geometry=pts_m, crs=3857).to_crs(4326)
        for pl in g_ll.geometry:
            sample_records.append(
                {"label": label, "lon": float(pl.x), "lat": float(pl.y)}
            )

    print(f"  [samples] {len(sample_records)} grid points → {len(pt_lonlat)} PT points")

    try:
        G = load_or_build_walk_graph()
        d_net = network_distances_to_pt(
            G,
            [(r["lon"], r["lat"]) for r in sample_records],
            pt_lonlat,
        )
        routed = int(np.isfinite(d_net).sum())
        network_meta = {
            "nodes": int(G.number_of_nodes()),
            "edges": int(G.number_of_edges()),
            "bbox": list(WALK_BBOX),
            "walk_speed_m_per_min": WALK_SPEED_M_PER_MIN,
            "walk_speed_kmh": round(WALK_SPEED_M_PER_MIN * 0.06, 2),
            "graph_cache": str(GRAPH_CACHE.relative_to(ROOT)),
            "samples_routed": routed,
            "samples_total": int(len(d_net)),
            "pct_routed": round(100.0 * routed / max(len(d_net), 1), 1),
        }
        print(f"  [ok] network routed {routed}/{len(d_net)} ({network_meta['pct_routed']}%)")
    except Exception as exc:  # noqa: BLE001
        return {
            "status": "unavailable",
            "reason": str(exc)[:500],
            "note": "OSM network walk failed — no crow-flies fallback.",
            "wards": [],
        }

    sample_g = gpd.GeoDataFrame(
        {
            "label": [r["label"] for r in sample_records],
            "d_network": d_net,
        }
    )

    rows: list[dict[str, Any]] = []
    for label, grp in sample_g.groupby("label"):
        dn = grp["d_network"]
        dn_ok = dn[np.isfinite(dn)]
        if len(dn_ok) == 0:
            rows.append(
                {
                    "label": str(label),
                    "sample_points": int(len(grp)),
                    "mean_network_m": None,
                    "median_network_m": None,
                    "p90_network_m": None,
                    "mean_walk_min": None,
                    "median_walk_min": None,
                    "p90_walk_min": None,
                    "pct_samples_within_5min": None,
                    "pct_samples_within_10min": None,
                    "pct_network_routed": 0.0,
                }
            )
            continue
        mean_net = float(dn_ok.mean())
        med_net = float(dn_ok.median())
        p90_net = float(dn_ok.quantile(0.9))
        rows.append(
            {
                "label": str(label),
                "sample_points": int(len(grp)),
                "mean_network_m": round(mean_net, 1),
                "median_network_m": round(med_net, 1),
                "p90_network_m": round(p90_net, 1),
                "mean_walk_min": round(mean_net / WALK_SPEED_M_PER_MIN, 1),
                "median_walk_min": round(med_net / WALK_SPEED_M_PER_MIN, 1),
                "p90_walk_min": round(p90_net / WALK_SPEED_M_PER_MIN, 1),
                "pct_samples_within_5min": round(
                    float((dn_ok <= WALK_SPEED_M_PER_MIN * 5).mean() * 100), 1
                ),
                "pct_samples_within_10min": round(
                    float((dn_ok <= WALK_SPEED_M_PER_MIN * 10).mean() * 100), 1
                ),
                "pct_network_routed": round(100.0 * len(dn_ok) / max(len(grp), 1), 1),
            }
        )

    rows.sort(key=lambda r: (-(r["mean_walk_min"] or 0), r["label"]))
    net_means = [r["mean_walk_min"] for r in rows if r["mean_walk_min"] is not None]
    city_mean_min = round(sum(net_means) / len(net_means), 1) if net_means else None

    note = (
        "Ward grid samples (~150m) routed on an OSM pedestrian network to the nearest "
        "GTFS stop or MRTS/metro hub. mean_walk_min = network metres ÷ "
        f"{WALK_SPEED_M_PER_MIN:.0f} m/min (4.8 km/h). "
        "OSM walk graph is Partial (missing alleys / sidewalk tags). "
        "Not Google Maps, not population-weighted, not an equity score. "
        "No crow-flies walk metric."
    )

    return {
        "status": "loaded" if network_meta.get("pct_routed", 0) >= 95 else "partial",
        "generated_at": _now(),
        "note": note,
        "method": {
            "spacing_m": SPACING_M,
            "max_samples_per_ward": MAX_SAMPLES,
            "pt_layers": ["stops", "hubs"],
            "network": "OSMNx network_type=walk + multi-source Dijkstra (length metres)",
            "walk_speed_m_per_min": WALK_SPEED_M_PER_MIN,
            "network_meta": network_meta,
        },
        "city": {
            "mean_of_ward_means_min": city_mean_min,
            "wards": len(rows),
        },
        "wards": rows,
        "priority_long_walk": [
            r for r in rows if r["mean_walk_min"] is not None and r["mean_walk_min"] >= 10
        ][:25],
    }


def merge_into_reports(payload: dict[str, Any]) -> None:
    path = PROCESSED / "reports.json"
    if not path.exists() or payload.get("status") not in ("loaded", "partial"):
        return
    from gap_index import apply_gap_to_unit

    reports = json.loads(path.read_text())
    by = {str(w["label"]): w for w in payload.get("wards") or []}
    fields = [
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
    crow_drop = [
        "mean_walk_m",
        "median_walk_m",
        "p90_walk_m",
        "pct_samples_within_400m",
        "pct_samples_within_800m",
    ]
    city_mean_stops = reports.get("city_mean_stops_per_ward")
    for unit in reports.get("wards") or []:
        hit = by.get(str(unit.get("label") or ""))
        for f in crow_drop:
            unit.pop(f, None)
        if not hit:
            continue
        for f in fields:
            unit[f] = hit.get(f)
        unit["walk_sample_points"] = hit.get("sample_points")
        # Recompute Gap Index with walk_gap once OSM minutes are attached
        apply_gap_to_unit(
            unit,
            city_mean_stops=city_mean_stops,
            mean_walk_min=hit.get("mean_walk_min"),
        )
        # Surface long-walk recommendation when walk drives gap
        walk_min = hit.get("mean_walk_min")
        if walk_min is not None and float(walk_min) >= 10:
            recs = list(unit.get("recommendations") or [])
            title = "Long OSM walk to nearest PT"
            if not any(r.get("title") == title for r in recs):
                recs.insert(
                    0,
                    {
                        "priority": "high" if float(walk_min) >= 12 else "medium",
                        "title": title,
                        "detail": (
                            f"Mean network walk is ~{float(walk_min):.1f} min "
                            "(80 m/min on OSM pedestrian graph). "
                            "Prioritise mid-block stops or feeder links; verify on the ground."
                        ),
                    },
                )
                unit["recommendations"] = recs[:6]

    reports.pop("city_mean_walk_m", None)
    reports["city_mean_walk_min"] = (payload.get("city") or {}).get("mean_of_ward_means_min")
    reports["walk_access_note"] = payload.get("note")

    ward_reports = reports.get("wards") or []
    if ward_reports:
        ward_reports.sort(key=lambda r: (-(r.get("gap_index") or 0), str(r.get("label") or "")))
        reports["wards"] = ward_reports
        gaps = [w["gap_index"] for w in ward_reports if w.get("gap_index") is not None]
        reports["city_mean_gap_index"] = round(sum(gaps) / len(gaps), 1) if gaps else None
        reports["priority_wards"] = [w for w in ward_reports if (w.get("gap_index") or 0) >= 45][:25]
        reports["severe_gap_wards"] = [w for w in ward_reports if w.get("gap_band") == "severe"][:25]

    # Keep method text in sync when walk merge refreshes reports
    method = reports.get("gap_index_method") or {}
    method["components"] = {
        "stop_gap": "max 30 with walk / 40 legacy — stop counts vs city mean",
        "shelter_gap": "max 25 with walk / 30 legacy — shelter presence vs stops",
        "hub_gap": "max 15 with walk / 20 legacy — MRTS/metro hub inside boundary",
        "density_gap": "max 10 — low stops per km²",
        "walk_gap": "max 20 — OSM network mean walk minutes to nearest PT (wards)",
    }
    method["pt_index"] = "pt_index = 100 − gap_index (higher = better inventory/walk access)"
    method["scale"] = "0–100 (higher = larger inventory / walk gap)"
    reports["gap_index_method"] = method
    reports["note"] = (
        "Reports use verified spatial joins (stops/shelters/hubs inside polygons). "
        "Ward Gap Index also includes OSM network mean walk minutes to PT when Loaded. "
        "Mode fields split MRTS stations, CMRL metro-named hubs, and OSM railway stations. "
        "Nearest_*_m are crow-flies from unit representative point — not network walk. "
        "Gap Index and recommendations are inventory + walk rules — not census equity scores."
    )

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

    print("[…] ward walk access (OSM network only)")
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
    city_min = (payload.get("city") or {}).get("mean_of_ward_means_min")
    print(
        f"[ok] ward_walk_access status={payload.get('status')} "
        f"city_mean={city_min}min wards={len(payload.get('wards') or [])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
