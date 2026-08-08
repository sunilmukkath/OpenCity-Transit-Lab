#!/usr/bin/env python3
"""
Map OSM major roads that need better transit / feeder connectivity.

Method (inventory only — not equity or ridership):
1. Pull OSM trunk/primary/secondary/tertiary ways across GCC wards.
2. Keep only road segments outside the 400m GTFS stop catchment (unmet geometry).
3. Rank by unmet length; boost corridors that intersect high Gap Index wards.

Output: connectivity_need_roads.geojson + analysis summary dict.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
import requests
from shapely.geometry import LineString, MultiLineString, mapping
from shapely.ops import linemerge, unary_union

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"

UA = {"User-Agent": "OpenCity-TransitLab/1.0 (civic research; connectivity corridors)"}

# Cap features for map readability
TOP_N = 100
MIN_UNMET_M = 280.0
HIGHWAY_CLASSES = {"trunk", "primary", "secondary", "tertiary"}


def _clean_name(tags: dict[str, Any]) -> str:
    name = str(tags.get("name") or tags.get("name:en") or "").strip()
    ref = str(tags.get("ref") or "").strip()
    if name and ref:
        return f"{name} ({ref})"
    return name or ref or "Unnamed road"


def fetch_roads_overpass(bbox: tuple[float, float, float, float], cache: Path) -> dict[str, Any]:
    """bbox = (south, west, north, east) for Overpass. Tries staged highway classes."""
    if cache.exists() and cache.stat().st_size > 2000:
        return json.loads(cache.read_text())

    south, west, north, east = bbox
    # Stage queries so a large tertiary dump doesn't 502 the whole job
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
                time.sleep(1.2)
                resp = requests.post(ep, data={"data": query}, headers=UA, timeout=120)
                if resp.ok and resp.text.strip().startswith("{"):
                    data = resp.json()
                    els = data.get("elements") or []
                    merged.extend(els)
                    print(f"[ok] overpass {label}: {len(els)} ways via {ep.split('/')[2]}")
                    got = True
                    break
                last_err = RuntimeError(f"{ep} {label} -> {resp.status_code}")
            except Exception as exc:  # noqa: BLE001
                last_err = exc
        if not got:
            print(f"[warn] overpass stage {label} failed: {last_err}")

    if not merged:
        raise RuntimeError(f"Overpass roads failed: {last_err}")

    data = {"elements": merged}
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data))
    return data


def desire_lines_fallback(
    gap_wards: gpd.GeoDataFrame,
    hubs: gpd.GeoDataFrame | None,
) -> gpd.GeoDataFrame:
    """If OSM roads fail, draw ward-centroid → nearest hub desire lines."""
    if hubs is None or hubs.empty or gap_wards.empty:
        return gpd.GeoDataFrame(columns=[], geometry=[], crs=4326)

    hubs_m = hubs.to_crs(3857)
    hub_pts = list(zip(hubs_m.geometry.centroid, hubs_m.index))
    rows: list[dict[str, Any]] = []
    for _, ward in gap_wards.to_crs(3857).iterrows():
        c = ward.geometry.centroid
        best = None
        best_d = float("inf")
        best_i = None
        for pt, idx in hub_pts:
            d = float(c.distance(pt))
            if d < best_d:
                best_d = d
                best = pt
                best_i = idx
        if best is None or best_d > 8000:
            continue
        hub_row = hubs_m.loc[best_i]
        hub_name = str(
            hub_row.get("hub_name")
            or hub_row.get("station_name")
            or hub_row.get("name")
            or "Hub"
        )
        ward_label = str(ward.get("ward_label") or "Ward")
        line = LineString([(c.x, c.y), (best.x, best.y)])
        unmet = best_d
        rows.append(
            {
                "road_name": f"Feeder link: {ward_label} → {hub_name}",
                "highway": "proposed_feeder",
                "ref": "",
                "length_m": round(unmet, 1),
                "unmet_length_m": round(unmet, 1),
                "pct_outside_400m": 100.0,
                "in_high_gap_ward": True,
                "need_score": round(unmet * 1.5, 1),
                "need_band": "urgent" if unmet >= 1500 else ("priority" if unmet >= 700 else "watch"),
                "recommendation": (
                    "Desire line from a high Gap Index ward centroid to the nearest hub — "
                    "not an OSM road. Use to prioritise feeder / walk studies."
                ),
                "geometry": line,
            }
        )

    if not rows:
        return gpd.GeoDataFrame(columns=[], geometry=[], crs=4326)
    out = gpd.GeoDataFrame(rows, crs=3857).to_crs(4326)
    out = out.sort_values("need_score", ascending=False).head(TOP_N).reset_index(drop=True)
    out["rank"] = out.index + 1
    return out


def ways_to_gdf(overpass: dict[str, Any]) -> gpd.GeoDataFrame:
    rows: list[dict[str, Any]] = []
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
        rows.append(
            {
                "osm_id": el.get("id"),
                "road_name": _clean_name(tags),
                "highway": hwy,
                "ref": str(tags.get("ref") or ""),
                "geometry": LineString(coords),
            }
        )
    if not rows:
        return gpd.GeoDataFrame(columns=["osm_id", "road_name", "highway", "ref", "geometry"], crs=4326)
    return gpd.GeoDataFrame(rows, crs=4326)


def high_gap_wards(wards: gpd.GeoDataFrame, reports: dict[str, Any] | None) -> gpd.GeoDataFrame:
    """Select severe/high gap wards; fall back to low stop density."""
    w = wards.copy()
    if "ward_label" not in w.columns:
        return w.iloc[0:0]

    gap_by: dict[str, dict[str, Any]] = {}
    for row in (reports or {}).get("wards") or []:
        label = str(row.get("label") or "")
        if label:
            gap_by[label] = row

    if gap_by:
        keep = []
        for _, r in w.iterrows():
            label = str(r.get("ward_label") or "")
            info = gap_by.get(label)
            if not info:
                continue
            band = str(info.get("gap_band") or "")
            gi = info.get("gap_index")
            if band in ("severe", "high") or (gi is not None and float(gi) >= 45):
                keep.append(True)
            else:
                keep.append(False)
        out = w.loc[keep].copy()
        if not out.empty:
            out["gap_index"] = [
                gap_by.get(str(r.get("ward_label")), {}).get("gap_index") for _, r in out.iterrows()
            ]
            out["gap_band"] = [
                gap_by.get(str(r.get("ward_label")), {}).get("gap_band") for _, r in out.iterrows()
            ]
            return out

    # Fallback: zero / very low stops
    if "stop_count" in w.columns:
        return w[w["stop_count"].fillna(0) <= 3].copy()
    return w.iloc[0:0]


def score_roads(
    roads: gpd.GeoDataFrame,
    catchment: gpd.GeoDataFrame | None,
    gap_wards: gpd.GeoDataFrame,
) -> gpd.GeoDataFrame:
    """Score roads by length outside the 400m stop catchment.

    Geometry kept on the map is the unmet segment (road minus catchment),
    so lines draw only where there is no nearby PT stop.
    """
    if roads.empty:
        return roads

    roads_m = roads.to_crs(3857)
    gap_m = gap_wards.to_crs(3857) if gap_wards is not None and not gap_wards.empty else None
    gap_union = unary_union(gap_m.geometry) if gap_m is not None and not gap_m.empty else None

    catch_union = None
    if catchment is not None and not catchment.empty:
        catch_union = unary_union(catchment.to_crs(3857).geometry)

    records: list[dict[str, Any]] = []
    for _, row in roads_m.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        length_m = float(geom.length)
        if length_m < 80:
            continue

        unmet_geom = geom
        if catch_union is not None:
            try:
                diff = geom.difference(catch_union)
                if diff is not None and not diff.is_empty:
                    unmet_geom = diff
                else:
                    continue
            except Exception:  # noqa: BLE001
                unmet_geom = geom

        unmet_m = float(unmet_geom.length) if unmet_geom is not None and not unmet_geom.is_empty else 0.0
        if unmet_m < 40:
            continue
        pct_unmet = (unmet_m / length_m) * 100.0 if length_m else 0.0

        in_gap = False
        if gap_union is not None:
            try:
                in_gap = bool(unmet_geom.intersects(gap_union))
            except Exception:  # noqa: BLE001
                in_gap = False

        # Prefer long stretches without PT; boost high Gap Index wards
        need_score = unmet_m * (1.35 if in_gap else 1.0) * (1.0 + pct_unmet / 200.0)

        if unmet_m < MIN_UNMET_M and not (in_gap and unmet_m >= 200):
            continue

        records.append(
            {
                "osm_id": row.get("osm_id"),
                "road_name": row.get("road_name"),
                "highway": row.get("highway"),
                "ref": row.get("ref"),
                "length_m": round(length_m, 1),
                "unmet_length_m": round(unmet_m, 1),
                "pct_outside_400m": round(pct_unmet, 1),
                "in_high_gap_ward": in_gap,
                "need_score": round(need_score, 1),
                "geometry": unmet_geom,
            }
        )

    if not records:
        return gpd.GeoDataFrame(columns=[], geometry=[], crs=3857)

    gdf = gpd.GeoDataFrame(records, crs=3857)

    # Dissolve by road name — keep strongest corridors (unmet segments only)
    dissolved_rows: list[dict[str, Any]] = []
    for name, grp in gdf.groupby("road_name"):
        try:
            unioned = unary_union(list(grp.geometry))
            if unioned.geom_type == "LineString":
                merged = unioned
            elif unioned.geom_type == "MultiLineString":
                merged = linemerge(unioned)
            elif unioned.geom_type == "GeometryCollection":
                parts = [
                    g
                    for g in unioned.geoms
                    if g.geom_type in ("LineString", "MultiLineString") and not g.is_empty
                ]
                if not parts:
                    continue
                u2 = unary_union(parts)
                merged = linemerge(u2) if u2.geom_type == "MultiLineString" else u2
            else:
                continue
        except Exception:  # noqa: BLE001
            merged = max(list(grp.geometry), key=lambda g: g.length)
        length_m = float(grp["length_m"].sum())
        unmet_m = float(grp["unmet_length_m"].sum())
        pct = (unmet_m / length_m * 100.0) if length_m else 0.0
        in_gap = bool(grp["in_high_gap_ward"].any())
        need = float(grp["need_score"].sum())
        hwy = (
            grp["highway"].value_counts().index[0]
            if len(grp["highway"].value_counts())
            else "secondary"
        )
        ref = next((str(r) for r in grp["ref"] if r), "")
        if unmet_m < MIN_UNMET_M and not (in_gap and unmet_m >= 200):
            continue
        band = "urgent" if need >= 4000 or pct >= 55 else ("priority" if need >= 1500 or pct >= 35 else "watch")
        dissolved_rows.append(
            {
                "road_name": name,
                "highway": hwy,
                "ref": ref,
                "length_m": round(length_m, 1),
                "unmet_length_m": round(unmet_m, 1),
                "pct_outside_400m": round(pct, 1),
                "in_high_gap_ward": in_gap,
                "need_score": round(need, 1),
                "need_band": band,
                "recommendation": (
                    "Road segments farther than 400m from a GTFS stop — mid-block stops "
                    "or a short feeder may help. Field-verify boarding demand."
                    if pct >= 40
                    else "Partial coverage gaps along this road — field-check before capital works."
                ),
                "geometry": merged,
            }
        )

    out = gpd.GeoDataFrame(dissolved_rows, crs=3857)
    if out.empty:
        return out
    out = out.sort_values("need_score", ascending=False).head(TOP_N).reset_index(drop=True)
    out["rank"] = out.index + 1
    return out.to_crs(4326)


def build_connectivity_need(
    *,
    wards: gpd.GeoDataFrame | None,
    stops: gpd.GeoDataFrame | None,
    catchment_400: gpd.GeoDataFrame | None,
    reports: dict[str, Any] | None = None,
    hubs: gpd.GeoDataFrame | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "layers": {},
        "analysis": {
            "status": "unavailable",
            "corridors": [],
            "counts": {},
        },
        "errors": [],
    }

    if wards is None or wards.empty:
        result["errors"].append("wards missing")
        result["layers"]["connectivity_need"] = {
            "status": "unavailable",
            "error": "wards missing",
        }
        return result

    gap = high_gap_wards(wards, reports)

    # Study bbox = all wards so we map roads without PT citywide
    minx, miny, maxx, maxy = wards.total_bounds
    pad = 0.015
    bbox = (miny - pad, minx - pad, maxy + pad, maxx + pad)

    cache = RAW / "osm_connectivity_roads_city.json"
    scored = gpd.GeoDataFrame(columns=[], geometry=[], crs=4326)
    source_kind = "osm_roads"

    try:
        overpass = fetch_roads_overpass(bbox, cache)
        roads = ways_to_gdf(overpass)
        if not roads.empty:
            # Clip to ward envelope (all GCC wards), not only high-gap polygons
            wards_buf = wards.to_crs(3857).buffer(200)
            study = gpd.GeoDataFrame(geometry=[unary_union(wards_buf)], crs=3857).to_crs(4326)
            roads = gpd.overlay(roads, study, how="intersection", keep_geom_type=False)
            roads = roads.explode(index_parts=False).reset_index(drop=True)
            roads = roads[roads.geometry.type.isin(["LineString", "MultiLineString"])]
            roads = roads[~roads.geometry.is_empty]

            catch = catchment_400
            if catch is None and stops is not None and not stops.empty:
                catch = gpd.GeoDataFrame(
                    geometry=[unary_union(stops.to_crs(3857).buffer(400))],
                    crs=3857,
                ).to_crs(4326)

            gap_for_boost = gap if gap is not None and not gap.empty else wards.iloc[0:0]
            scored = score_roads(roads, catch, gap_for_boost)
    except Exception as exc:  # noqa: BLE001
        result["errors"].append(str(exc))
        print(f"[warn] OSM connectivity roads: {exc}")

    if scored.empty:
        scored = desire_lines_fallback(
            gap if gap is not None and not gap.empty else wards.head(25), hubs
        )
        source_kind = "desire_lines"
        if scored.empty:
            result["errors"].append("no corridors met threshold / no desire lines")
            result["layers"]["connectivity_need"] = {
                "status": "unavailable",
                "error": "no corridors above threshold",
            }
            return result

    out_path = PROCESSED / "connectivity_need_roads.geojson"
    PROCESSED.mkdir(parents=True, exist_ok=True)
    export = scored.copy()
    export["in_high_gap_ward"] = export["in_high_gap_ward"].astype(bool)
    export["source_kind"] = source_kind
    export.to_file(out_path, driver="GeoJSON")

    corridors = []
    for _, r in export.iterrows():
        corridors.append(
            {
                "rank": int(r["rank"]),
                "road_name": r["road_name"],
                "highway": r["highway"],
                "need_band": r["need_band"],
                "need_score": float(r["need_score"]),
                "unmet_length_m": float(r["unmet_length_m"]),
                "pct_outside_400m": float(r["pct_outside_400m"]),
                "in_high_gap_ward": bool(r["in_high_gap_ward"]),
                "recommendation": r["recommendation"],
                "source_kind": source_kind,
            }
        )

    note = (
        "OSM major-road segments farther than 400m from a GTFS stop (unmet geometry). "
        "High Gap Index wards are boosted in ranking. Inventory only — not ridership or equity."
        if source_kind == "osm_roads"
        else (
            "Fallback desire lines from high Gap Index ward centroids to nearest hubs "
            "(OSM road pull failed). Not observed roads — use for feeder studies only."
        )
    )

    result["layers"]["connectivity_need"] = {
        "status": "loaded",
        "file": "connectivity_need_roads.geojson",
        "feature_count": len(export),
        "notes": note,
        "attributes": [
            "road_name",
            "highway",
            "need_band",
            "need_score",
            "unmet_length_m",
            "pct_outside_400m",
            "in_high_gap_ward",
            "recommendation",
            "rank",
            "source_kind",
        ],
    }
    result["analysis"] = {
        "status": "loaded",
        "note": note,
        "method": {
            "inputs": ["GCC wards", "GTFS stops / 400m catchment", "OSM highways (unmet segments)"],
            "source_kind": source_kind,
            "geometry": "road minus 400m stop catchment",
            "bands": {
                "urgent": "highest unmet length / gap overlap",
                "priority": "substantial coverage gaps",
                "watch": "smaller gaps — verify on ground",
            },
        },
        "corridors": corridors,
        "counts": {
            "high_gap_wards": int(len(gap)),
            "corridors_mapped": int(len(export)),
            "urgent": int((export["need_band"] == "urgent").sum()),
            "priority": int((export["need_band"] == "priority").sum()),
            "watch": int((export["need_band"] == "watch").sum()),
            "source_kind_osm": int(source_kind == "osm_roads"),
        },
    }
    return result


if __name__ == "__main__":
    wards = gpd.read_file(PROCESSED / "wards.geojson") if (PROCESSED / "wards.geojson").exists() else None
    stops = gpd.read_file(PROCESSED / "stops.geojson") if (PROCESSED / "stops.geojson").exists() else None
    hubs = gpd.read_file(PROCESSED / "hubs.geojson") if (PROCESSED / "hubs.geojson").exists() else None
    catch = (
        gpd.read_file(PROCESSED / "catchment_400m.geojson")
        if (PROCESSED / "catchment_400m.geojson").exists()
        else None
    )
    reports = None
    if (PROCESSED / "reports.json").exists():
        reports = json.loads((PROCESSED / "reports.json").read_text())
    out = build_connectivity_need(
        wards=wards, stops=stops, catchment_400=catch, reports=reports, hubs=hubs
    )
    print(json.dumps({"layers": out["layers"], "counts": out["analysis"].get("counts"), "errors": out["errors"]}, indent=2))
    if out["layers"].get("connectivity_need", {}).get("status") == "loaded":
        # also refresh analyses snippet + copy to web
        analyses_path = PROCESSED / "analyses.json"
        if analyses_path.exists():
            analyses = json.loads(analyses_path.read_text())
            analyses["connectivity_need"] = out["analysis"]
            analyses_path.write_text(json.dumps(analyses, indent=2))
        manifest_path = PROCESSED / "manifest.json"
        if manifest_path.exists():
            manifest = json.loads(manifest_path.read_text())
            manifest["layers"]["connectivity_need"] = out["layers"]["connectivity_need"]
            manifest_path.write_text(json.dumps(manifest, indent=2))
        web = ROOT / "apps" / "web" / "public" / "data"
        web.mkdir(parents=True, exist_ok=True)
        for name in (
            "connectivity_need_roads.geojson",
            "analyses.json",
            "manifest.json",
        ):
            src = PROCESSED / name
            if src.exists():
                (web / name).write_bytes(src.read_bytes())
        print("[ok] copied to web public/data")
