#!/usr/bin/env python3
"""
Chennai Transit Lab — ETL pipeline.

Downloads public datasets, validates geometry, writes GeoJSON + manifest.
Never invents metrics. Missing/corrupt sources are recorded as unavailable.
"""

from __future__ import annotations

import hashlib
import io
import json
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
import requests
from shapely.geometry import Point
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
WEB_PUBLIC = ROOT / "apps" / "web" / "public" / "data"

SOURCES: dict[str, dict[str, Any]] = {
    "gcc_wards_2022": {
        "name": "GCC Ward Map 2022",
        "publisher": "Greater Chennai Corporation via OpenCity CKAN",
        "url": "https://data.opencity.in/dataset/c77de7f8-e377-4990-90fc-4f0f8ca0e2d2/resource/e90176d4-319a-45bd-918e-ecce4f048c4d/download/6a8a05ed-a41c-492a-aade-ff7517e1a4b1.kml",
        "license": "Open Data Commons / see OpenCity portal",
        "portal": "https://data.opencity.in/dataset/gcc-ward-information",
        "kind": "static",
        "filename": "gcc_wards_2022.kml",
    },
    "gcc_zones_2022": {
        "name": "GCC Zones Map 2022",
        "publisher": "Greater Chennai Corporation via OpenCity CKAN",
        "url": "https://data.opencity.in/dataset/c77de7f8-e377-4990-90fc-4f0f8ca0e2d2/resource/00b3ea2e-e3a4-4b28-aec2-769a01404e5b/download/0f0ccbda-9485-4964-b3b1-6ce53af82bbb.kml",
        "license": "Open Data Commons / see OpenCity portal",
        "portal": "https://data.opencity.in/dataset/gcc-ward-information",
        "kind": "static",
        "filename": "gcc_zones_2022.kml",
    },
    "bus_shelters": {
        "name": "Chennai Bus Shelters",
        "publisher": "TNGIS / OpenCity CKAN",
        "url": "https://data.opencity.in/dataset/fc4c6937-2927-4c9c-939b-ac77af811aa7/resource/b1710404-a6e5-4311-ba38-3805a00e36ce/download/6e6ba0e8-8ddd-44b4-84b3-2d672559bf2f.kml",
        "license": "See OpenCity portal",
        "portal": "https://data.opencity.in/dataset/chennai-bus-shelters",
        "kind": "static",
        "filename": "chennai_bus_shelters.kml",
        "notes": "Indicates presence of shelters; not a complete stop inventory.",
    },
    "mrts_stations": {
        "name": "Chennai MRTS Stations 2018",
        "publisher": "GCC via OpenCity CKAN",
        "url": "https://data.opencity.in/dataset/0c84bec3-c682-484b-9cfa-3ef8c7366338/resource/848a8268-8b80-4fa1-b8d3-485abfbece60/download/b3221b7e-cb19-4f5d-a404-1fc96060cb66.kml",
        "license": "Public Domain / see OpenCity",
        "portal": "https://data.opencity.in/dataset/chennai-mrts-data",
        "kind": "static",
        "filename": "mrts_stations.kml",
    },
    "mrts_lines": {
        "name": "Chennai MRTS Lines 2018",
        "publisher": "GCC via OpenCity CKAN",
        "url": "https://data.opencity.in/dataset/0c84bec3-c682-484b-9cfa-3ef8c7366338/resource/daab9817-166e-40a6-aaad-c457f6ad33ea/download/77c9aa1c-d8d3-44e4-b55c-90a1046ba87e.kml",
        "license": "Public Domain / see OpenCity",
        "portal": "https://data.opencity.in/dataset/chennai-mrts-data",
        "kind": "static",
        "filename": "mrts_lines.kml",
    },
    "chennai_gtfs_unified": {
        "name": "Chennai Unified GTFS (MTC + CMRL)",
        "publisher": "UngalSoththu / ChennaiGTFS (community)",
        "url": "https://raw.githubusercontent.com/ungalsoththu/ChennaiGTFS/main/data/chennai-unified-gtfs.zip",
        "license": "See GitHub repository",
        "portal": "https://github.com/ungalsoththu/ChennaiGTFS",
        "kind": "static",
        "filename": "chennai-unified-gtfs.zip",
        "notes": "Unofficial community GTFS. Shapes may be straight-line; no suburban rail; no GTFS-RT.",
    },
}

REALTIME_SLOTS = [
    {
        "id": "gtfs_rt_vehicle",
        "name": "GTFS Realtime — Vehicle Positions",
        "status": "not_connected",
        "would_unlock": "Live bus/metro positions for traffic coordination at hubs and corridors.",
        "how_to_plug": "Set GTFS_RT_VEHICLE_URL env var to an agency GTFS-RT protobuf endpoint.",
    },
    {
        "id": "gtfs_rt_trip_updates",
        "name": "GTFS Realtime — Trip Updates / Arrivals",
        "status": "not_connected",
        "would_unlock": "Arrival reliability and delay heatmaps for policy and operations.",
        "how_to_plug": "Set GTFS_RT_TRIP_URL env var when MTC/CMRL publish a feed.",
    },
    {
        "id": "station_crowd",
        "name": "Station Crowding / Incidents API",
        "status": "not_connected",
        "would_unlock": "Dynamic feeder priority during peaks; incident awareness for traffic dept.",
        "how_to_plug": "Configure AGENCY_CROWD_API_URL when an official API is available.",
    },
]

UNAVAILABLE_ANALYTICS = [
    {
        "id": "equity_sec",
        "name": "Equity / SEC gap scores",
        "status": "unavailable",
        "reason": "Census→2022 ward joins not validated in this pipeline. No invented equity scores are shown.",
        "needed": "Validated Census 2011 (or newer) attributes joined to GCC 2022 ward geometries.",
    },
    {
        "id": "pop_weighted_access",
        "name": "Population-weighted % within 400m of transit",
        "status": "unavailable",
        "reason": "Requires a validated population surface joined to wards. Geometry catchments are available without population weights.",
        "needed": "Ward-level population table with acceptable join rate to GCC 2022 wards.",
    },
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def download(url: str, dest: Path, timeout: int = 120) -> dict[str, Any]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    resp = requests.get(url, timeout=timeout, headers={"User-Agent": "OpenCity-TransitLab/1.0"})
    resp.raise_for_status()
    dest.write_bytes(resp.content)
    return {
        "bytes": len(resp.content),
        "sha256": sha256_bytes(resp.content),
        "fetched_at": utc_now(),
        "path": str(dest.relative_to(ROOT)),
    }


def read_kml_as_gdf(path: Path) -> gpd.GeoDataFrame:
    layers = fiona_listlayers(path)
    frames: list[gpd.GeoDataFrame] = []
    if layers:
        for lyr in layers:
            try:
                frames.append(gpd.read_file(path, driver="KML", layer=lyr))
            except Exception:
                continue
    if not frames:
        frames.append(gpd.read_file(path, driver="KML"))
    gdf = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs=frames[0].crs)
    if gdf.crs is None:
        gdf = gdf.set_crs(4326)
    else:
        gdf = gdf.to_crs(4326)
    gdf = gdf[~gdf.geometry.isna()].copy()
    gdf = gdf[~gdf.geometry.is_empty].copy()
    # Fix invalid polygon geometries; leave points alone
    poly_mask = gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])
    if poly_mask.any():
        gdf.loc[poly_mask, "geometry"] = gdf.loc[poly_mask].geometry.buffer(0)
    return gdf


def fiona_listlayers(path: Path) -> list[str]:
    import fiona

    try:
        return list(fiona.listlayers(path))
    except Exception:
        return []


def gtfs_stops_from_zip(zip_path: Path) -> gpd.GeoDataFrame:
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
        stops_name = next((n for n in names if n.endswith("stops.txt") and not n.startswith("__")), None)
        if not stops_name:
            raise FileNotFoundError("stops.txt not found in GTFS zip")
        with zf.open(stops_name) as f:
            # Some stop names contain unescaped commas; skip malformed rows rather than inventing coords
            df = pd.read_csv(f, dtype=str, on_bad_lines="warn", engine="python")
    required = {"stop_id", "stop_lat", "stop_lon"}
    if not required.issubset(df.columns):
        raise ValueError(f"stops.txt missing columns: {required - set(df.columns)}")
    df["stop_lat"] = pd.to_numeric(df["stop_lat"], errors="coerce")
    df["stop_lon"] = pd.to_numeric(df["stop_lon"], errors="coerce")
    df = df.dropna(subset=["stop_lat", "stop_lon"])
    # Chennai-ish bbox filter to drop clearly invalid coords (no invented fills)
    df = df[
        (df["stop_lat"].between(12.0, 14.0)) & (df["stop_lon"].between(79.5, 81.0))
    ]
    geometry = [Point(xy) for xy in zip(df["stop_lon"], df["stop_lat"])]
    gdf = gpd.GeoDataFrame(df, geometry=geometry, crs=4326)
    keep = [c for c in ["stop_id", "stop_name", "stop_code", "location_type", "parent_station"] if c in gdf.columns]
    return gdf[keep + ["geometry"]]


def bbox_of(gdf: gpd.GeoDataFrame) -> list[float] | None:
    if gdf.empty:
        return None
    minx, miny, maxx, maxy = gdf.total_bounds
    return [float(minx), float(miny), float(maxx), float(maxy)]


def write_geojson(gdf: gpd.GeoDataFrame, path: Path) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    out = gdf.copy()
    for col in out.columns:
        if col == "geometry":
            continue
        if out[col].dtype == "object":
            out[col] = out[col].astype(str)
    out.to_file(path, driver="GeoJSON")
    return len(out)


def project_m(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    # Chennai UTM zone 44N
    return gdf.to_crs(32644)


def make_catchments(stops: gpd.GeoDataFrame, radii_m: list[int]) -> dict[int, gpd.GeoDataFrame]:
    """Dissolved buffers around stops — geometry only, no population weights."""
    if stops.empty:
        return {}
    projected = project_m(stops)
    out: dict[int, gpd.GeoDataFrame] = {}
    for r in radii_m:
        buffers = projected.geometry.buffer(r)
        dissolved = unary_union(buffers.values)
        # Light simplify to keep web payloads manageable (tolerance in metres)
        if hasattr(dissolved, "simplify"):
            dissolved = dissolved.simplify(15, preserve_topology=True)
        gdf = gpd.GeoDataFrame({"radius_m": [r], "geometry": [dissolved]}, crs=32644).to_crs(4326)
        out[r] = gdf
    return out


def count_points_in_polygons(
    polys: gpd.GeoDataFrame, points: gpd.GeoDataFrame, count_col: str
) -> gpd.GeoDataFrame:
    if polys.empty:
        return polys
    left = polys.copy()
    if points.empty:
        left[count_col] = 0
        return left
    joined = gpd.sjoin(points[["geometry"]], left[["geometry"]], how="inner", predicate="within")
    counts = joined.groupby("index_right").size()
    left[count_col] = left.index.map(lambda i: int(counts.get(i, 0)))
    return left


def simplify_ward_attrs(wards: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    cols = list(wards.columns)
    name_col = None
    for c in cols:
        if c.lower() in ("name", "ward_name", "ward", "ward_no", "wardno", "ward_name_1"):
            name_col = c
            break
    # KML often uses Name
    if "Name" in wards.columns:
        name_col = "Name"
    out = wards.copy()
    out["ward_label"] = out[name_col].astype(str) if name_col else out.index.astype(str)
    # Keep description if present (often has HTML attributes from KML)
    keep = ["ward_label", "geometry"]
    if "Description" in out.columns:
        keep.insert(1, "Description")
        out["Description"] = out["Description"].astype(str)
    return out[keep]


def build_metrics(
    wards: gpd.GeoDataFrame | None,
    stops: gpd.GeoDataFrame | None,
    shelters: gpd.GeoDataFrame | None,
    hubs: gpd.GeoDataFrame | None,
) -> dict[str, Any]:
    metrics: dict[str, Any] = {
        "generated_at": utc_now(),
        "note": "Only counts derived from successfully loaded geometries. No equity or population-weighted access scores.",
        "counts": {},
        "unavailable": [u["id"] for u in UNAVAILABLE_ANALYTICS],
    }
    if stops is not None:
        metrics["counts"]["transit_stops"] = int(len(stops))
    if shelters is not None:
        metrics["counts"]["bus_shelters"] = int(len(shelters))
    if hubs is not None:
        metrics["counts"]["rail_hubs"] = int(len(hubs))
    if wards is not None:
        metrics["counts"]["wards"] = int(len(wards))
        if "stop_count" in wards.columns:
            metrics["counts"]["wards_with_zero_stops"] = int((wards["stop_count"] == 0).sum())
            metrics["counts"]["mean_stops_per_ward"] = round(float(wards["stop_count"].mean()), 2)
    return metrics


def copy_to_web(processed_dir: Path, web_dir: Path) -> None:
    web_dir.mkdir(parents=True, exist_ok=True)
    for path in processed_dir.glob("*"):
        if path.is_file():
            target = web_dir / path.name
            target.write_bytes(path.read_bytes())


def main() -> int:
    RAW.mkdir(parents=True, exist_ok=True)
    PROCESSED.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, Any] = {
        "generated_at": utc_now(),
        "platform": "OpenCity Transit Lab — Chennai Last-Mile Decision Support",
        "integrity_rule": "No fabricated metrics. Unavailable or not_connected when data is missing.",
        "sources": {},
        "layers": {},
        "realtime": REALTIME_SLOTS,
        "unavailable_analytics": UNAVAILABLE_ANALYTICS,
    }

    # --- Download ---
    for key, meta in SOURCES.items():
        entry = {
            "id": key,
            "name": meta["name"],
            "publisher": meta["publisher"],
            "url": meta["url"],
            "portal": meta.get("portal"),
            "license": meta.get("license"),
            "kind": meta["kind"],
            "notes": meta.get("notes"),
            "status": "unavailable",
        }
        dest = RAW / meta["filename"]
        try:
            dl = download(meta["url"], dest)
            entry.update(dl)
            entry["status"] = "loaded"
            print(f"[ok] downloaded {key} ({dl['bytes']} bytes)")
        except Exception as exc:  # noqa: BLE001
            entry["status"] = "unavailable"
            entry["error"] = str(exc)
            print(f"[fail] {key}: {exc}", file=sys.stderr)
        manifest["sources"][key] = entry

    layers: dict[str, gpd.GeoDataFrame | None] = {
        "wards": None,
        "zones": None,
        "stops": None,
        "shelters": None,
        "mrts_stations": None,
        "mrts_lines": None,
        "hubs": None,
        "catchment_400m": None,
        "catchment_800m": None,
    }

    # --- Process wards ---
    if manifest["sources"]["gcc_wards_2022"]["status"] == "loaded":
        try:
            wards = simplify_ward_attrs(read_kml_as_gdf(RAW / "gcc_wards_2022.kml"))
            layers["wards"] = wards
            n = write_geojson(wards, PROCESSED / "wards.geojson")
            manifest["layers"]["wards"] = {
                "status": "loaded",
                "feature_count": n,
                "bbox": bbox_of(wards),
                "file": "wards.geojson",
                "derived_from": "gcc_wards_2022",
            }
            print(f"[ok] wards.geojson ({n} features)")
        except Exception as exc:  # noqa: BLE001
            manifest["layers"]["wards"] = {"status": "unavailable", "error": str(exc)}
            print(f"[fail] wards: {exc}", file=sys.stderr)

    if manifest["sources"]["gcc_zones_2022"]["status"] == "loaded":
        try:
            zones = read_kml_as_gdf(RAW / "gcc_zones_2022.kml")
            if "Name" in zones.columns:
                zones = zones.rename(columns={"Name": "zone_label"})
            else:
                zones["zone_label"] = zones.index.astype(str)
            keep = [c for c in ["zone_label", "Description", "geometry"] if c in zones.columns]
            zones = zones[keep]
            layers["zones"] = zones
            n = write_geojson(zones, PROCESSED / "zones.geojson")
            manifest["layers"]["zones"] = {
                "status": "loaded",
                "feature_count": n,
                "bbox": bbox_of(zones),
                "file": "zones.geojson",
                "derived_from": "gcc_zones_2022",
            }
            print(f"[ok] zones.geojson ({n} features)")
        except Exception as exc:  # noqa: BLE001
            manifest["layers"]["zones"] = {"status": "unavailable", "error": str(exc)}
            print(f"[fail] zones: {exc}", file=sys.stderr)

    # --- Shelters ---
    if manifest["sources"]["bus_shelters"]["status"] == "loaded":
        try:
            shelters = read_kml_as_gdf(RAW / "chennai_bus_shelters.kml")
            if "Name" in shelters.columns:
                shelters = shelters.rename(columns={"Name": "shelter_name"})
            elif "name" in shelters.columns:
                shelters = shelters.rename(columns={"name": "shelter_name"})
            else:
                shelters["shelter_name"] = shelters.index.astype(str)
            # Prefer points
            shelters = shelters[shelters.geometry.geom_type.isin(["Point", "MultiPoint"])].copy()
            if (shelters.geometry.geom_type == "MultiPoint").any():
                shelters = shelters.explode(index_parts=False)
            keep_cols = ["shelter_name", "geometry"]
            for optional in ("Description", "description", "id"):
                if optional in shelters.columns:
                    keep_cols.insert(-1, optional)
            layers["shelters"] = shelters[keep_cols]
            n = write_geojson(layers["shelters"], PROCESSED / "shelters.geojson")
            status = "loaded" if n > 0 else "partial"
            manifest["layers"]["shelters"] = {
                "status": status if n > 0 else "unavailable",
                "feature_count": n,
                "bbox": bbox_of(layers["shelters"]) if n else None,
                "file": "shelters.geojson",
                "derived_from": "bus_shelters",
                "notes": SOURCES["bus_shelters"].get("notes"),
            }
            print(f"[ok] shelters.geojson ({n} features)")
        except Exception as exc:  # noqa: BLE001
            manifest["layers"]["shelters"] = {"status": "unavailable", "error": str(exc)}
            print(f"[fail] shelters: {exc}", file=sys.stderr)

    # --- MRTS ---
    if manifest["sources"]["mrts_stations"]["status"] == "loaded":
        try:
            mrts = read_kml_as_gdf(RAW / "mrts_stations.kml")
            if "Name" in mrts.columns:
                mrts = mrts.rename(columns={"Name": "station_name"})
            mrts["mode"] = "MRTS"
            keep = [c for c in ["station_name", "mode", "Description", "geometry"] if c in mrts.columns]
            layers["mrts_stations"] = mrts[keep]
            n = write_geojson(layers["mrts_stations"], PROCESSED / "mrts_stations.geojson")
            manifest["layers"]["mrts_stations"] = {
                "status": "loaded",
                "feature_count": n,
                "bbox": bbox_of(layers["mrts_stations"]),
                "file": "mrts_stations.geojson",
                "derived_from": "mrts_stations",
            }
            print(f"[ok] mrts_stations.geojson ({n} features)")
        except Exception as exc:  # noqa: BLE001
            manifest["layers"]["mrts_stations"] = {"status": "unavailable", "error": str(exc)}
            print(f"[fail] mrts stations: {exc}", file=sys.stderr)

    if manifest["sources"]["mrts_lines"]["status"] == "loaded":
        try:
            lines = read_kml_as_gdf(RAW / "mrts_lines.kml")
            if "Name" in lines.columns:
                lines = lines.rename(columns={"Name": "line_name"})
            keep = [c for c in ["line_name", "Description", "geometry"] if c in lines.columns]
            layers["mrts_lines"] = lines[keep]
            n = write_geojson(layers["mrts_lines"], PROCESSED / "mrts_lines.geojson")
            manifest["layers"]["mrts_lines"] = {
                "status": "loaded",
                "feature_count": n,
                "bbox": bbox_of(layers["mrts_lines"]),
                "file": "mrts_lines.geojson",
                "derived_from": "mrts_lines",
            }
            print(f"[ok] mrts_lines.geojson ({n} features)")
        except Exception as exc:  # noqa: BLE001
            manifest["layers"]["mrts_lines"] = {"status": "unavailable", "error": str(exc)}
            print(f"[fail] mrts lines: {exc}", file=sys.stderr)

    # --- GTFS stops ---
    if manifest["sources"]["chennai_gtfs_unified"]["status"] == "loaded":
        try:
            stops = gtfs_stops_from_zip(RAW / "chennai-unified-gtfs.zip")
            # Tag mode heuristically from stop_id prefix if present
            stops["source"] = "chennai_gtfs_unified"
            layers["stops"] = stops
            n = write_geojson(stops, PROCESSED / "stops.geojson")
            manifest["layers"]["stops"] = {
                "status": "loaded",
                "feature_count": n,
                "bbox": bbox_of(stops),
                "file": "stops.geojson",
                "derived_from": "chennai_gtfs_unified",
                "notes": SOURCES["chennai_gtfs_unified"].get("notes"),
            }
            print(f"[ok] stops.geojson ({n} features)")
        except Exception as exc:  # noqa: BLE001
            manifest["layers"]["stops"] = {"status": "unavailable", "error": str(exc)}
            print(f"[fail] stops: {exc}", file=sys.stderr)

    # --- Hubs = MRTS stations + GTFS location_type stations if any ---
    hub_frames = []
    if layers["mrts_stations"] is not None and not layers["mrts_stations"].empty:
        h = layers["mrts_stations"].copy()
        h["hub_type"] = "MRTS"
        hub_frames.append(h.rename(columns={"station_name": "hub_name"}))
    if layers["stops"] is not None and "location_type" in layers["stops"].columns:
        station_stops = layers["stops"][layers["stops"]["location_type"].fillna(0).astype(int) == 1].copy()
        if not station_stops.empty:
            station_stops["hub_name"] = station_stops.get("stop_name", station_stops["stop_id"])
            station_stops["hub_type"] = "GTFS_station"
            hub_frames.append(station_stops[["hub_name", "hub_type", "geometry"]])
    # Also include CMRL-like stops by name if location_type missing — use stops with "Metro" in name carefully
    if layers["stops"] is not None:
        name_series = layers["stops"].get("stop_name")
        if name_series is not None:
            metroish = layers["stops"][
                name_series.astype(str).str.contains("Metro|CMRL", case=False, na=False)
            ].copy()
            if not metroish.empty:
                metroish["hub_name"] = metroish["stop_name"]
                metroish["hub_type"] = "metro_named"
                hub_frames.append(metroish[["hub_name", "hub_type", "geometry"]])

    if hub_frames:
        hubs = gpd.GeoDataFrame(pd.concat(hub_frames, ignore_index=True), crs=4326)
        hubs = hubs[~hubs.geometry.isna() & ~hubs.geometry.is_empty].copy()
        hubs["wkt"] = hubs.geometry.to_wkt()
        hubs = hubs.drop_duplicates(subset=["wkt"], keep="first").drop(columns=["wkt"])
        # Keep only known columns
        for col in list(hubs.columns):
            if col not in ("hub_name", "hub_type", "geometry"):
                if col not in ("station_name", "stop_name", "mode"):
                    hubs = hubs.drop(columns=[col], errors="ignore")
        if "hub_name" not in hubs.columns and "station_name" in hubs.columns:
            hubs["hub_name"] = hubs["station_name"]
        hubs = hubs[[c for c in ["hub_name", "hub_type", "geometry"] if c in hubs.columns]]
        layers["hubs"] = hubs
        n = write_geojson(hubs, PROCESSED / "hubs.geojson")
        manifest["layers"]["hubs"] = {
            "status": "loaded",
            "feature_count": n,
            "bbox": bbox_of(hubs),
            "file": "hubs.geojson",
            "notes": "Union of MRTS stations and metro-tagged GTFS stops. Not a scored equity index.",
        }
        print(f"[ok] hubs.geojson ({n} features)")
    else:
        manifest["layers"]["hubs"] = {
            "status": "unavailable",
            "error": "No hub geometries available from MRTS/GTFS",
        }

    # --- Catchments from stops (geometry only) ---
    if layers["stops"] is not None and not layers["stops"].empty:
        try:
            catchments = make_catchments(layers["stops"], [400, 800])
            for r, gdf in catchments.items():
                key = f"catchment_{r}m"
                layers[key] = gdf
                n = write_geojson(gdf, PROCESSED / f"{key}.geojson")
                manifest["layers"][key] = {
                    "status": "loaded",
                    "feature_count": n,
                    "bbox": bbox_of(gdf),
                    "file": f"{key}.geojson",
                    "notes": f"Dissolved {r}m buffer around GTFS stops. Not population-weighted.",
                }
                print(f"[ok] {key}.geojson")
        except Exception as exc:  # noqa: BLE001
            manifest["layers"]["catchment_400m"] = {"status": "unavailable", "error": str(exc)}
            print(f"[fail] catchments: {exc}", file=sys.stderr)

    # --- Ward stop counts (verified spatial join) ---
    if layers["wards"] is not None and layers["stops"] is not None:
        try:
            wards_enriched = count_points_in_polygons(layers["wards"], layers["stops"], "stop_count")
            if layers["shelters"] is not None:
                wards_enriched = count_points_in_polygons(
                    wards_enriched, layers["shelters"], "shelter_count"
                )
            else:
                wards_enriched["shelter_count"] = None  # unavailable join
            layers["wards"] = wards_enriched
            n = write_geojson(wards_enriched, PROCESSED / "wards.geojson")
            manifest["layers"]["wards"]["feature_count"] = n
            manifest["layers"]["wards"]["attributes"] = [
                "ward_label",
                "stop_count",
                "shelter_count" if layers["shelters"] is not None else None,
            ]
            manifest["layers"]["wards"]["attributes"] = [
                a for a in manifest["layers"]["wards"]["attributes"] if a
            ]
            print(f"[ok] wards enriched with stop_count")
        except Exception as exc:  # noqa: BLE001
            print(f"[fail] ward stop counts: {exc}", file=sys.stderr)

    metrics = build_metrics(
        layers["wards"], layers["stops"], layers["shelters"], layers["hubs"]
    )
    (PROCESSED / "metrics.json").write_text(json.dumps(metrics, indent=2))
    (PROCESSED / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print("[ok] metrics.json + manifest.json")

    copy_to_web(PROCESSED, WEB_PUBLIC)
    print(f"[ok] copied processed data → {WEB_PUBLIC}")

    loaded = sum(1 for L in manifest["layers"].values() if L.get("status") == "loaded")
    print(f"\nDone. {loaded} layers loaded. Manifest written.")
    return 0 if loaded > 0 else 1


if __name__ == "__main__":
    # Silence unused import warning path for zipfile io
    _ = io
    raise SystemExit(main())
