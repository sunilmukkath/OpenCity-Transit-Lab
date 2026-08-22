#!/usr/bin/env python3
"""
Outside-GCC / OMR corridor context — Partial inventory from existing open layers.

Joins study AOIs (OMR, Tambaram, Chengalpattu) with:
  - outside-GCC unmet roads
  - TNGIS settlements / habitation outside GCC wards
  - walk-beyond-10min polygons
  - OSM railway stations
  - CMP OMR / GST corridors (geocoded Partial)

Does not invent ridership, equity scores, or official Tambaram ward maps.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import geopandas as gpd
from shapely import make_valid
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


def _valid(geom):
    if geom is None or geom.is_empty:
        return geom
    try:
        geom = make_valid(geom)
    except Exception:  # noqa: BLE001
        pass
    try:
        return geom.buffer(0)
    except Exception:  # noqa: BLE001
        return geom


def _km2(geom) -> float:
    if geom is None or geom.is_empty:
        return 0.0
    return round(float(gpd.GeoSeries([geom], crs=3857).area.sum()) / 1e6, 2)


def _km(length_m: float) -> float:
    return round(float(length_m) / 1000.0, 2)


def build() -> dict[str, Any]:
    wards = _load("wards.geojson")
    aois = _load("corridor_aois.geojson")
    roads = _load("outside_gcc_roads.geojson")
    sett = _load("tngis_settlement_area.geojson")
    hab = _load("tngis_habitation.geojson")
    beyond = _load("walk_beyond_10min.geojson")
    rail = _load("railway_stations.geojson")
    cmp = _load("cmp_corridors.geojson")
    metro = _load("metro_area_boundaries.geojson")
    omr = _load("omr_corridor.geojson")

    if wards is None or aois is None:
        return {"status": "unavailable", "reason": "wards or corridor_aois missing"}

    gcc = _valid(unary_union(list(wards.to_crs(3857).geometry)))
    beyond_u = None
    if beyond is not None:
        beyond_u = _valid(unary_union(list(beyond.to_crs(3857).geometry)))

    # --- Settlements outside GCC ---
    sett_out = None
    if sett is not None:
        s3857 = sett.to_crs(3857).copy()
        s3857["geometry"] = s3857.geometry.map(_valid)
        s3857 = s3857[~s3857.geometry.isna() & ~s3857.geometry.is_empty]
        # keep only pieces outside GCC
        clipped = []
        for _, row in s3857.iterrows():
            try:
                g = row.geometry.difference(gcc)
            except Exception:  # noqa: BLE001
                continue
            g = _valid(g)
            if g is None or g.is_empty:
                continue
            area = float(g.area)
            if area < 500:  # drop tiny slivers (m²)
                continue
            beyond_flag = False
            beyond_share = 0.0
            if beyond_u is not None and not beyond_u.is_empty:
                try:
                    inter = _valid(g.intersection(beyond_u))
                    if inter is not None and not inter.is_empty:
                        beyond_flag = True
                        beyond_share = round(100.0 * float(inter.area) / area, 1)
                except Exception:  # noqa: BLE001
                    pass
            aoi_hits = []
            for _, a in aois.to_crs(3857).iterrows():
                try:
                    if g.intersects(a.geometry):
                        aoi_hits.append(str(a.get("label") or a.get("name") or "AOI"))
                except Exception:  # noqa: BLE001
                    continue
            if not aoi_hits and not beyond_flag:
                # keep only AOI-relevant or beyond-10min pieces to limit file size
                continue
            props = {
                "label": row.get("label") or row.get("Habitation_name") or row.get("village_name"),
                "habitation_name": row.get("Habitation_name"),
                "District": row.get("District"),
                "taluk": row.get("taluk"),
                "ac_name": row.get("ac_name"),
                "landuse_level_1": row.get("landuse_level_1"),
                "outside_gcc": True,
                "beyond_10min": beyond_flag,
                "pct_area_beyond_10min": beyond_share,
                "aoi_hints": ", ".join(sorted(set(aoi_hits))),
                "area_km2": round(area / 1e6, 3),
                "source_layer": "tngis_settlement_area",
                "note": "TNGIS settlement outside GCC wards (Partial). Not population-weighted.",
            }
            clipped.append({**props, "geometry": g})
        if clipped:
            sett_out = (
                gpd.GeoDataFrame(clipped, crs=3857)
                .sort_values("area_km2", ascending=False)
                .head(400)
                .to_crs(4326)
            )

    # --- Habitation points outside GCC in AOIs / beyond-10 ---
    hab_out = None
    if hab is not None:
        h = hab.to_crs(3857).copy()
        h = h[~h.geometry.isna() & ~h.geometry.is_empty]
        h = h[~h.geometry.within(gcc) & ~h.geometry.intersects(gcc.buffer(-1))]
        # Prefer points clearly outside: difference centroid check
        keep = []
        aoi3857 = aois.to_crs(3857)
        for _, row in h.iterrows():
            pt = row.geometry
            if gcc.contains(pt) or gcc.covers(pt):
                continue
            in_aoi = False
            aoi_name = ""
            for _, a in aoi3857.iterrows():
                if a.geometry.contains(pt) or a.geometry.intersects(pt.buffer(50)):
                    in_aoi = True
                    aoi_name = str(a.get("label") or a.get("name") or "")
                    break
            beyond_flag = bool(beyond_u is not None and beyond_u.contains(pt))
            if not in_aoi and not beyond_flag:
                continue
            keep.append(
                {
                    "label": row.get("label")
                    or row.get("Habitation_name")
                    or row.get("habitation_name")
                    or row.get("name"),
                    "Habitation_name": row.get("Habitation_name"),
                    "District": row.get("District"),
                    "taluk": row.get("taluk"),
                    "ac_name": row.get("ac_name"),
                    "outside_gcc": True,
                    "beyond_10min": beyond_flag,
                    "aoi_hints": aoi_name,
                    "source_layer": "tngis_habitation",
                    "geometry": pt,
                }
            )
        if keep:
            hab_out = gpd.GeoDataFrame(keep, crs=3857).head(800).to_crs(4326)

    # --- Tag unmet roads with AOI ---
    roads_tagged = None
    if roads is not None:
        r = roads.to_crs(3857).copy()
        aoi_names = []
        for _, row in r.iterrows():
            hits = []
            for _, a in aois.to_crs(3857).iterrows():
                try:
                    if row.geometry.intersects(a.geometry):
                        hits.append(str(a.get("label") or a.get("name")))
                except Exception:  # noqa: BLE001
                    continue
            aoi_names.append(", ".join(sorted(set(hits))) if hits else "")
        r["aoi_hints"] = aoi_names
        r["corridor_focus"] = r["aoi_hints"].str.contains("OMR", case=False, na=False)
        roads_tagged = r.to_crs(4326)

    # --- Railway stations in south AOIs / outside GCC ---
    rail_out = None
    if rail is not None:
        rr = rail.to_crs(3857).copy()
        rows = []
        aoi3857 = aois.to_crs(3857)
        for _, row in rr.iterrows():
            pt = row.geometry
            if pt is None or pt.is_empty:
                continue
            outside = not (gcc.contains(pt) or gcc.covers(pt))
            hits = []
            for _, a in aoi3857.iterrows():
                if a.geometry.buffer(1500).contains(pt):  # 1.5 km of AOI
                    hits.append(str(a.get("label") or a.get("name")))
            if not hits and not outside:
                continue
            if not hits and outside:
                # keep outside-GCC rail only if within ~8km of OMR line
                if omr is not None:
                    omr_m = omr.to_crs(3857).union_all()
                    if omr_m.distance(pt) > 8000:
                        continue
                    hits = ["Near OMR (outside AOI polygon)"]
                else:
                    continue
            rows.append(
                {
                    "label": row.get("label") or row.get("name"),
                    "hub_type": row.get("hub_type") or "railway",
                    "railway": row.get("railway"),
                    "network": row.get("network"),
                    "operator": row.get("operator"),
                    "outside_gcc": outside,
                    "aoi_hints": ", ".join(sorted(set(hits))),
                    "note": "OSM railway station — GTFS unified feed has no suburban rail shapes.",
                    "geometry": pt,
                }
            )
        if rows:
            rail_out = gpd.GeoDataFrame(rows, crs=3857).to_crs(4326)

    # --- Per-AOI summary ---
    aoi_summaries: list[dict[str, Any]] = []
    for _, a in aois.to_crs(3857).iterrows():
        name = str(a.get("label") or a.get("name") or "AOI")
        poly = _valid(a.geometry)
        entry: dict[str, Any] = {
            "aoi": name,
            "aoi_km2": _km2(poly),
        }
        if roads_tagged is not None:
            rt = roads_tagged.to_crs(3857)
            mask = rt.intersects(poly)
            sub = rt[mask]
            entry["unmet_road_segments"] = int(len(sub))
            entry["unmet_road_km"] = _km(float(sub["unmet_length_m"].sum())) if len(sub) else 0.0
            # top road names
            if len(sub) and "road_name" in sub.columns:
                top = (
                    sub.groupby(sub["road_name"].fillna("Unnamed"))["unmet_length_m"]
                    .sum()
                    .sort_values(ascending=False)
                    .head(5)
                )
                entry["top_unmet_roads"] = [
                    {"road_name": str(k), "unmet_km": _km(float(v))} for k, v in top.items()
                ]
        if sett_out is not None:
            so = sett_out.to_crs(3857)
            mask = so.intersects(poly)
            sub = so[mask]
            entry["settlement_pieces"] = int(len(sub))
            entry["settlement_km2"] = round(float(sub["area_km2"].sum()), 2) if len(sub) else 0.0
            entry["settlement_beyond_10min_km2"] = (
                round(float(sub.loc[sub["beyond_10min"], "area_km2"].sum()), 2)
                if len(sub)
                else 0.0
            )
        if hab_out is not None:
            ho = hab_out.to_crs(3857)
            mask = ho.intersects(poly) | ho.within(poly)
            entry["habitation_points"] = int(mask.sum())
            entry["habitation_beyond_10min"] = (
                int(ho.loc[mask & ho["beyond_10min"]].shape[0]) if mask.any() else 0
            )
        if rail_out is not None:
            ro = rail_out.to_crs(3857)
            mask = ro["aoi_hints"].fillna("").str.contains(name.split()[0], case=False) | ro.intersects(
                poly.buffer(1500)
            )
            entry["railway_stations"] = int(mask.sum())
            entry["railway_station_names"] = [
                str(x) for x in ro.loc[mask, "label"].dropna().unique().tolist()[:12]
            ]
        if beyond_u is not None:
            try:
                inter = _valid(poly.intersection(beyond_u))
                entry["beyond_10min_km2"] = _km2(inter)
            except Exception:  # noqa: BLE001
                entry["beyond_10min_km2"] = None
        aoi_summaries.append(entry)

    # CMP corridors mentioning OMR / GST / IT
    cmp_focus = []
    if cmp is not None:
        for _, row in cmp.iterrows():
            cname = str(row.get("corridor_name") or row.get("query") or "")
            if any(k in cname.upper() for k in ("OMR", "IT CORRIDOR", "GST", "OUTER RING", "RAJIV")):
                cmp_focus.append(
                    {
                        "corridor_name": cname,
                        "osm_display_name": row.get("osm_display_name"),
                        "note": "CMP PDF name geocoded via Nominatim — Partial, not CMDA CAD.",
                    }
                )

    # Write layers
    layer_files: dict[str, str] = {}
    if sett_out is not None and len(sett_out):
        name = "outside_gcc_settlements.geojson"
        sett_out.to_file(PROCESSED / name, driver="GeoJSON")
        _copy_web(name)
        layer_files["outside_gcc_settlements"] = name
    if hab_out is not None and len(hab_out):
        name = "outside_gcc_habitation.geojson"
        hab_out.to_file(PROCESSED / name, driver="GeoJSON")
        _copy_web(name)
        layer_files["outside_gcc_habitation"] = name
    if roads_tagged is not None and len(roads_tagged):
        name = "outside_gcc_roads.geojson"
        # refresh with aoi_hints
        roads_tagged.to_file(PROCESSED / name, driver="GeoJSON")
        _copy_web(name)
        layer_files["outside_gcc_roads"] = name
    if rail_out is not None and len(rail_out):
        name = "omr_south_rail_stations.geojson"
        rail_out.to_file(PROCESSED / name, driver="GeoJSON")
        _copy_web(name)
        layer_files["omr_south_rail_stations"] = name

    omr_block = next((x for x in aoi_summaries if "OMR" in x["aoi"].upper()), None)

    analysis = {
        "status": "partial",
        "generated_at": _now(),
        "title": "Outside GCC — OMR / south corridor context",
        "note": (
            "Inventory for areas outside Greater Chennai Corporation wards, focused on the "
            "OMR → Mahabalipuram corridor and Tambaram / Chengalpattu study AOIs. Combines "
            "OSM unmet roads, TNGIS settlements/habitation, OSM walk-beyond-10min, and "
            "suburban rail stations. Partial — not official municipal wards; not ridership."
        ),
        "aois": aoi_summaries,
        "omr_highlight": omr_block,
        "cmp_corridors_focus": cmp_focus,
        "metro_towns": [
            {
                "name": str(r.get("label") or r.get("name")),
                "kind": r.get("kind"),
                "note": r.get("note"),
            }
            for _, r in (metro.iterrows() if metro is not None else [])
        ],
        "files": layer_files,
        "counts": {
            "outside_gcc_settlement_pieces": int(len(sett_out)) if sett_out is not None else 0,
            "outside_gcc_habitation_points": int(len(hab_out)) if hab_out is not None else 0,
            "omr_south_rail_stations": int(len(rail_out)) if rail_out is not None else 0,
            "unmet_road_segments": int(len(roads_tagged)) if roads_tagged is not None else 0,
            "omr_unmet_road_km": (omr_block or {}).get("unmet_road_km"),
            "omr_settlement_beyond_10min_km2": (omr_block or {}).get(
                "settlement_beyond_10min_km2"
            ),
            "omr_beyond_10min_km2": (omr_block or {}).get("beyond_10min_km2"),
        },
        "limitation": (
            "Tambaram official ward maps are PDF-only (not ingested). TNGIS Partial. "
            "Settlement area includes non-residential landuse. Beyond-10min includes vacant/water. "
            "CMP corridors are Nominatim approximations."
        ),
        "sources": [
            {"name": "TNGIS settlement / habitation WFS", "status": "partial"},
            {"name": "OSM outside-GCC major roads", "status": "partial"},
            {"name": "OSM walk isochrones → beyond 10 min", "status": "partial"},
            {"name": "OSM railway stations (manual download)", "status": "loaded"},
            {"name": "CMP corridors (PDF + Nominatim)", "status": "partial"},
            {"name": "Corridor AOIs / OMR line (OSM)", "status": "loaded"},
        ],
    }

    meta_name = "outside_gcc_omr_context.json"
    (PROCESSED / meta_name).write_text(json.dumps(analysis, indent=2, allow_nan=False))
    _copy_web(meta_name)

    # Manifest + analyses
    for base in (PROCESSED, WEB):
        ap = base / "analyses.json"
        if ap.exists():
            analyses = json.loads(ap.read_text())
            analyses["outside_gcc_omr_context"] = analysis
            ap.write_text(json.dumps(analyses, indent=2, allow_nan=False))
        mp = base / "manifest.json"
        if not mp.exists():
            continue
        manifest = json.loads(mp.read_text())
        layers = manifest.setdefault("layers", {})
        if sett_out is not None and len(sett_out):
            layers["outside_gcc_settlements"] = {
                "status": "partial",
                "feature_count": len(sett_out),
                "file": "outside_gcc_settlements.geojson",
                "notes": analysis["note"],
            }
        if hab_out is not None and len(hab_out):
            layers["outside_gcc_habitation"] = {
                "status": "partial",
                "feature_count": len(hab_out),
                "file": "outside_gcc_habitation.geojson",
                "notes": analysis["note"],
            }
        if rail_out is not None and len(rail_out):
            layers["omr_south_rail_stations"] = {
                "status": "partial",
                "feature_count": len(rail_out),
                "file": "omr_south_rail_stations.geojson",
                "notes": "OSM railway stations near OMR / south AOIs or outside GCC.",
            }
        # Ensure AOI + beyond-10 are listed for map loading
        if (PROCESSED / "corridor_aois.geojson").exists():
            layers["corridor_aois"] = {
                "status": "loaded",
                "feature_count": len(aois),
                "file": "corridor_aois.geojson",
                "notes": "Study AOIs for OMR, Tambaram, Chengalpattu — not official wards.",
            }
        if (PROCESSED / "walk_beyond_10min.geojson").exists():
            layers["walk_beyond_10min"] = {
                "status": "partial",
                "feature_count": int(
                    (json.loads((PROCESSED / "walk_beyond_10min_meta.json").read_text()).get("counts") or {}).get(
                        "polygon_pieces_ge_0_05km2"
                    )
                    or 0
                )
                or None,
                "file": "walk_beyond_10min.geojson",
                "notes": "Study area outside ≤10 min OSM walk (Partial).",
            }
        if roads_tagged is not None:
            layers.setdefault("outside_gcc_roads", {})
            layers["outside_gcc_roads"]["status"] = "partial"
            layers["outside_gcc_roads"]["feature_count"] = len(roads_tagged)
            layers["outside_gcc_roads"]["file"] = "outside_gcc_roads.geojson"
            layers["outside_gcc_roads"]["notes"] = (
                "Outside-GCC unmet roads tagged with OMR / Tambaram / Chengalpattu AOI hints."
            )
        mp.write_text(json.dumps(manifest, indent=2, allow_nan=False))

    print(
        f"[ok] outside_gcc_omr_context sett={analysis['counts']['outside_gcc_settlement_pieces']} "
        f"hab={analysis['counts']['outside_gcc_habitation_points']} "
        f"rail={analysis['counts']['omr_south_rail_stations']} "
        f"omr_unmet_km={analysis['counts']['omr_unmet_road_km']}"
    )
    return analysis


def main() -> int:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    WEB.mkdir(parents=True, exist_ok=True)
    try:
        out = build()
    except Exception as exc:  # noqa: BLE001
        print(f"[fail] outside_gcc_omr_context: {exc}")
        import traceback

        traceback.print_exc()
        return 1
    return 0 if out.get("status") != "unavailable" else 1


if __name__ == "__main__":
    raise SystemExit(main())
