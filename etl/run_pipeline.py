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
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_metro_extension import build_metro_extension  # noqa: E402
from build_connectivity_need import build_connectivity_need  # noqa: E402

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


def clean_label(value: Any) -> str:
    if value is None:
        return ""
    try:
        import math

        if isinstance(value, float) and math.isnan(value):
            return ""
    except Exception:
        pass
    text = " ".join(str(value).split()).strip()
    if text.lower() in {"", "nan", "none", "null", "undefined"}:
        return ""
    return text


def add_area_km2(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    out = gdf.copy()
    projected = project_m(out)
    out["area_km2"] = (projected.geometry.area / 1_000_000).round(3)
    return out


def build_recommendations(
    *,
    unit_type: str,
    label: str,
    stop_count: int | None,
    shelter_count: int | None,
    hub_count: int | None = None,
    area_km2: float | None = None,
    city_mean_stops: float | None = None,
) -> list[dict[str, str]]:
    """Rule-based prompts from verified inventory only — not equity scores."""
    recs: list[dict[str, str]] = []
    stops = stop_count if stop_count is not None else None
    shelters = shelter_count if shelter_count is not None else None
    hubs = hub_count if hub_count is not None else None

    density = None
    if stops is not None and area_km2 and area_km2 > 0:
        density = round(stops / area_km2, 2)

    if stops == 0:
        recs.append(
            {
                "priority": "critical",
                "title": "No GTFS stops inside boundary",
                "detail": (
                    f"{unit_type.title()} {label} contains zero community-GTFS stops. "
                    "Field-verify against MTC stop lists before concluding service absence; "
                    "if confirmed, prioritize feeder links to the nearest metro/MRTS hub."
                ),
            }
        )
    elif stops is not None and stops < 5:
        recs.append(
            {
                "priority": "high",
                "title": "Very low stop inventory",
                "detail": (
                    f"Only {stops} GTFS stops fall inside this {unit_type}. "
                    "Review stop spacing and short feeder routes to nearby hubs "
                    "(Helsinki-style last-mile access to trunk stations)."
                ),
            }
        )
    elif (
        stops is not None
        and city_mean_stops is not None
        and stops < city_mean_stops * 0.5
    ):
        recs.append(
            {
                "priority": "medium",
                "title": "Below city average stop count",
                "detail": (
                    f"{stops} stops vs city mean ~{city_mean_stops:.1f}. "
                    "Compare with neighbouring wards/zones and check whether catchments "
                    "leave residential pockets beyond 400–800m walk."
                ),
            }
        )

    if shelters == 0 and stops is not None and stops > 0:
        recs.append(
            {
                "priority": "high",
                "title": "Shelter gap relative to stops",
                "detail": (
                    "Stops are present but the shelter map shows none inside this boundary. "
                    "Confirm with field audit (shelter layer is presence-only), then prioritise "
                    "weather protection at high-boarding locations."
                ),
            }
        )
    elif shelters is not None and stops is not None and stops > 0 and shelters / max(stops, 1) < 0.15:
        recs.append(
            {
                "priority": "medium",
                "title": "Low shelter-to-stop ratio",
                "detail": (
                    f"{shelters} mapped shelters vs {stops} stops. "
                    "Target shelters at transfer points and long-wait corridors first."
                ),
            }
        )
    elif shelters is None:
        recs.append(
            {
                "priority": "info",
                "title": "Shelter counts unavailable",
                "detail": "Shelter layer was not joined for this unit — see Data Sources.",
            }
        )

    if hubs == 0:
        recs.append(
            {
                "priority": "medium",
                "title": "No rail/metro hub inside boundary",
                "detail": (
                    "No MRTS/metro-tagged hub falls inside this unit. "
                    "Map walk/feeder access to the nearest hub and improve last-mile links."
                ),
            }
        )
    elif hubs is not None and hubs > 0:
        recs.append(
            {
                "priority": "info",
                "title": "Hub present — strengthen last-mile",
                "detail": (
                    f"{hubs} hub(s) inside boundary. Prioritise clear walk paths, "
                    "feeder stop clustering within ~100–300m of the hub, and passenger information."
                ),
            }
        )

    if density is not None and density < 5 and stops is not None and stops > 0:
        recs.append(
            {
                "priority": "medium",
                "title": "Low stop density for land area",
                "detail": (
                    f"About {density} stops per km² across {area_km2} km². "
                    "Large blocks may need mid-block stops or shared mobility feeders."
                ),
            }
        )

    if not recs:
        recs.append(
            {
                "priority": "info",
                "title": "Inventory looks non-empty",
                "detail": (
                    "Loaded layers show coverage inside this boundary. "
                    "Use 400m/800m catchments on the map for walk-access checks; "
                    "equity scores remain withheld until census joins are validated."
                ),
            }
        )

    return recs


def build_gap_index(
    *,
    stop_count: int | None,
    shelter_count: int | None,
    hub_count: int | None,
    area_km2: float | None,
    city_mean_stops: float | None,
) -> dict[str, Any]:
    """
    Inventory Gap Index 0–100 (higher = larger gap).
    Built only from verified point-in-polygon counts — not census equity.
    """
    stops = stop_count
    shelters = shelter_count
    hubs = hub_count
    density = None
    if stops is not None and area_km2 and area_km2 > 0:
        density = stops / area_km2

    # Stop access gap — max 40
    stop_gap = 0
    if stops is None:
        stop_gap = 0
    elif stops == 0:
        stop_gap = 40
    elif stops < 5:
        stop_gap = 30
    elif city_mean_stops and stops < city_mean_stops * 0.35:
        stop_gap = 26
    elif city_mean_stops and stops < city_mean_stops * 0.5:
        stop_gap = 18
    elif city_mean_stops and stops < city_mean_stops * 0.75:
        stop_gap = 10
    elif city_mean_stops and stops < city_mean_stops:
        stop_gap = 4

    # Shelter gap — max 30
    shelter_gap = 0
    if shelters is None:
        shelter_gap = 0
    elif stops is not None and stops > 0:
        ratio = shelters / max(stops, 1)
        if shelters == 0:
            shelter_gap = 30
        elif ratio < 0.08:
            shelter_gap = 24
        elif ratio < 0.15:
            shelter_gap = 16
        elif ratio < 0.25:
            shelter_gap = 8
    elif stops == 0 and shelters == 0:
        shelter_gap = 10  # no amenities either

    # Hub / last-mile trunk access — max 20
    hub_gap = 0
    if hubs is None:
        hub_gap = 0
    elif hubs == 0:
        hub_gap = 20
    elif hubs == 1:
        hub_gap = 6

    # Density gap — max 10
    density_gap = 0
    if density is not None and stops is not None and stops > 0:
        if density < 3:
            density_gap = 10
        elif density < 5:
            density_gap = 7
        elif density < 8:
            density_gap = 4
        elif density < 12:
            density_gap = 2

    components = {
        "stop_gap": stop_gap,
        "shelter_gap": shelter_gap,
        "hub_gap": hub_gap,
        "density_gap": density_gap,
    }
    total = int(sum(components.values()))
    total = max(0, min(100, total))

    if total >= 70:
        band = "severe"
    elif total >= 45:
        band = "high"
    elif total >= 25:
        band = "moderate"
    else:
        band = "low"

    return {
        "gap_index": total,
        "gap_band": band,
        "gap_components": components,
        "gap_max": {
            "stop_gap": 40,
            "shelter_gap": 30,
            "hub_gap": 20,
            "density_gap": 10,
        },
    }


def build_unit_report(
    row: dict[str, Any],
    unit_type: str,
    city_mean_stops: float | None,
) -> dict[str, Any]:
    label = clean_label(row.get("label") or row.get("ward_label") or row.get("zone_label") or "")
    if not label:
        label = f"Unnamed {unit_type}"
    stop_count = row.get("stop_count")
    shelter_count = row.get("shelter_count")
    hub_count = row.get("hub_count")
    area_km2 = row.get("area_km2")
    stops_i = int(stop_count) if stop_count is not None and str(stop_count) != "nan" else None
    shelters_i = (
        int(shelter_count) if shelter_count is not None and str(shelter_count) != "nan" else None
    )
    hubs_i = int(hub_count) if hub_count is not None and str(hub_count) != "nan" else None
    area_f = float(area_km2) if area_km2 is not None and str(area_km2) != "nan" else None

    gap = build_gap_index(
        stop_count=stops_i,
        shelter_count=shelters_i,
        hub_count=hubs_i,
        area_km2=area_f,
        city_mean_stops=city_mean_stops,
    )

    # Keep priority_score as alias of gap_index for older UI consumers
    priority_score = gap["gap_index"]

    return {
        "id": label,
        "label": label,
        "unit_type": unit_type,
        "stop_count": stops_i,
        "shelter_count": shelters_i,
        "hub_count": hubs_i,
        "area_km2": area_f,
        "stops_per_km2": round(stops_i / area_f, 2) if stops_i is not None and area_f else None,
        "priority_score": priority_score,
        "gap_index": gap["gap_index"],
        "gap_band": gap["gap_band"],
        "gap_components": gap["gap_components"],
        "recommendations": build_recommendations(
            unit_type=unit_type,
            label=label,
            stop_count=stops_i,
            shelter_count=shelters_i,
            hub_count=hubs_i,
            area_km2=area_f,
            city_mean_stops=city_mean_stops,
        ),
    }


def build_spatial_reports(
    wards: gpd.GeoDataFrame | None,
    zones: gpd.GeoDataFrame | None,
) -> dict[str, Any]:
    city_mean = None
    ward_reports: list[dict[str, Any]] = []
    zone_reports: list[dict[str, Any]] = []

    if wards is not None and not wards.empty and "stop_count" in wards.columns:
        city_mean = float(wards["stop_count"].mean())
        for _, row in wards.iterrows():
            ward_reports.append(
                build_unit_report(
                    {
                        "label": row.get("ward_label"),
                        "stop_count": row.get("stop_count"),
                        "shelter_count": row.get("shelter_count"),
                        "hub_count": row.get("hub_count"),
                        "area_km2": row.get("area_km2"),
                    },
                    "ward",
                    city_mean,
                )
            )

    if zones is not None and not zones.empty:
        for _, row in zones.iterrows():
            zone_reports.append(
                build_unit_report(
                    {
                        "label": row.get("zone_label"),
                        "stop_count": row.get("stop_count"),
                        "shelter_count": row.get("shelter_count"),
                        "hub_count": row.get("hub_count"),
                        "area_km2": row.get("area_km2"),
                    },
                    "zone",
                    city_mean,
                )
            )

    ward_reports.sort(key=lambda r: (-r["gap_index"], r["label"]))
    zone_reports.sort(key=lambda r: (-r["gap_index"], r["label"]))

    ward_gaps = [w["gap_index"] for w in ward_reports]
    city_gap = round(sum(ward_gaps) / len(ward_gaps), 1) if ward_gaps else None

    return {
        "generated_at": utc_now(),
        "note": (
            "Reports use verified spatial joins only (stops/shelters/hubs inside polygons). "
            "Gap Index and recommendations are inventory rules — not census equity scores."
        ),
        "gap_index_method": {
            "scale": "0–100 (higher = larger inventory gap)",
            "bands": {
                "severe": "≥70",
                "high": "45–69",
                "moderate": "25–44",
                "low": "<25",
            },
            "components": {
                "stop_gap": "max 40 — zero / very low / below city-mean stop counts",
                "shelter_gap": "max 30 — shelter presence vs stops",
                "hub_gap": "max 20 — no MRTS/metro hub inside boundary",
                "density_gap": "max 10 — low stops per km²",
            },
            "disclaimer": (
                "Not a population-weighted equity score. Field-verify before capital works. "
                "Community GTFS may under-count official MTC stops."
            ),
        },
        "city_mean_stops_per_ward": round(city_mean, 2) if city_mean is not None else None,
        "city_mean_gap_index": city_gap,
        "wards": ward_reports,
        "zones": zone_reports,
        "priority_wards": [w for w in ward_reports if w["gap_index"] >= 45][:25],
        "priority_zones": [z for z in zone_reports if z["gap_index"] >= 35][:16],
        "severe_gap_wards": [w for w in ward_reports if w["gap_band"] == "severe"][:25],
    }


def build_hub_last_mile(
    hubs: gpd.GeoDataFrame | None,
    stops: gpd.GeoDataFrame | None,
    shelters: gpd.GeoDataFrame | None,
) -> dict[str, Any]:
    """Per-hub feeder access within 300m/500m — inventory only."""
    if hubs is None or hubs.empty:
        return {
            "status": "unavailable",
            "reason": "Hub layer not loaded",
            "hubs": [],
            "priority_hubs": [],
        }
    if stops is None or stops.empty:
        return {
            "status": "unavailable",
            "reason": "Stops layer not loaded",
            "hubs": [],
            "priority_hubs": [],
        }

    hubs_ll = hubs.to_crs(4326).reset_index(drop=True)
    hubs_m = project_m(hubs).reset_index(drop=True)
    stops_m = project_m(stops).reset_index(drop=True)
    shelters_m = (
        project_m(shelters).reset_index(drop=True)
        if shelters is not None and not shelters.empty
        else None
    )

    nearest = gpd.sjoin_nearest(
        hubs_m[["geometry"]],
        stops_m[["geometry"]],
        how="left",
        distance_col="nearest_stop_m",
    )
    nearest_dist = nearest.groupby(nearest.index)["nearest_stop_m"].min()

    rows: list[dict[str, Any]] = []
    for idx, hub in hubs_m.iterrows():
        src = hubs_ll.loc[idx]
        name = clean_label(
            src.get("hub_name")
            or src.get("station_name")
            or src.get("stop_name")
            or hub.get("hub_name")
            or f"Hub {idx}"
        )
        if not name:
            name = f"Hub {idx}"
        hub_type = clean_label(src.get("hub_type") or hub.get("hub_type") or "") or "hub"
        pt = hub.geometry
        ll = src.geometry
        if pt is None or pt.is_empty:
            continue

        buf300 = pt.buffer(300)
        buf500 = pt.buffer(500)
        stops_300 = int(stops_m.within(buf300).sum())
        stops_500 = int(stops_m.within(buf500).sum())
        shelters_300 = int(shelters_m.within(buf300).sum()) if shelters_m is not None else None
        nearest_m = nearest_dist.get(idx)
        nearest_m_f = (
            round(float(nearest_m), 1)
            if nearest_m is not None and str(nearest_m) != "nan"
            else None
        )

        # Last-mile gap 0–100 (higher = weaker feeder access)
        nearest_gap = 0
        if nearest_m_f is None:
            nearest_gap = 40
        elif nearest_m_f > 500:
            nearest_gap = 40
        elif nearest_m_f > 300:
            nearest_gap = 30
        elif nearest_m_f > 150:
            nearest_gap = 18
        elif nearest_m_f > 80:
            nearest_gap = 8

        stop300_gap = 0
        if stops_300 == 0:
            stop300_gap = 30
        elif stops_300 < 3:
            stop300_gap = 22
        elif stops_300 < 6:
            stop300_gap = 12
        elif stops_300 < 10:
            stop300_gap = 5

        stop500_gap = 0
        if stops_500 < 3:
            stop500_gap = 15
        elif stops_500 < 8:
            stop500_gap = 8

        shelter_gap = 0
        if shelters_300 is None:
            shelter_gap = 0
        elif shelters_300 == 0 and stops_300 > 0:
            shelter_gap = 15
        elif shelters_300 == 0:
            shelter_gap = 10

        components = {
            "nearest_stop_gap": nearest_gap,
            "stops_300m_gap": stop300_gap,
            "stops_500m_gap": stop500_gap,
            "shelter_300m_gap": shelter_gap,
        }
        score = int(min(100, sum(components.values())))
        if score >= 55:
            band = "weak"
        elif score >= 30:
            band = "moderate"
        else:
            band = "strong"

        lon = round(float(ll.x), 6) if ll is not None and hasattr(ll, "x") else None
        lat = round(float(ll.y), 6) if ll is not None and hasattr(ll, "y") else None
        # Rough GCC / Chennai urban box — flags suburban rail hubs outside city GTFS density
        in_chennai_core = (
            lon is not None
            and lat is not None
            and 80.05 <= lon <= 80.35
            and 12.85 <= lat <= 13.28
        )

        rows.append(
            {
                "id": name,
                "label": name,
                "hub_type": hub_type,
                "lon": lon,
                "lat": lat,
                "in_chennai_core": in_chennai_core,
                "nearest_stop_m": nearest_m_f,
                "stops_within_300m": stops_300,
                "stops_within_500m": stops_500,
                "shelters_within_300m": shelters_300,
                "last_mile_score": score,
                "last_mile_band": band,
                "components": components,
                "recommendation": (
                    "Hub sits outside dense Chennai GTFS coverage (likely suburban rail) — treat separately from city feeders."
                    if not in_chennai_core and score >= 55
                    else (
                        "Few feeders near this hub — prioritise stop clustering within 100–300m and clear walk links."
                        if score >= 55
                        else (
                            "Moderate feeder access — check shelters and mid-block walk paths to the entrance."
                            if score >= 30
                            else "Relatively strong stop presence near this hub — focus on wayfinding and passenger info."
                        )
                    )
                ),
            }
        )

    rows.sort(key=lambda r: (-r["last_mile_score"], r["label"]))
    core_weak = [h for h in rows if h["in_chennai_core"] and h["last_mile_score"] >= 55]
    priority = core_weak[:25] or [h for h in rows if h["last_mile_score"] >= 55][:25]
    return {
        "status": "loaded",
        "note": (
            "Last-mile score uses verified stop/shelter distances to hubs only. "
            "Not ridership or equity. Higher score = weaker feeder access. "
            "Priority list prefers hubs inside the Chennai urban box."
        ),
        "method": {
            "scale": "0–100 (higher = weaker last-mile / feeder access)",
            "bands": {"weak": "≥55", "moderate": "30–54", "strong": "<30"},
            "components": {
                "nearest_stop_gap": "max 40 — distance to nearest GTFS stop",
                "stops_300m_gap": "max 30 — stop count inside 300m",
                "stops_500m_gap": "max 15 — stop count inside 500m",
                "shelter_300m_gap": "max 15 — shelter presence inside 300m",
            },
        },
        "hubs": rows,
        "priority_hubs": priority,
        "counts": {
            "hubs_scored": len(rows),
            "hubs_in_chennai_core": sum(1 for h in rows if h["in_chennai_core"]),
            "weak_hubs": sum(1 for h in rows if h["last_mile_band"] == "weak"),
            "weak_hubs_chennai_core": len(core_weak),
            "moderate_hubs": sum(1 for h in rows if h["last_mile_band"] == "moderate"),
            "strong_hubs": sum(1 for h in rows if h["last_mile_band"] == "strong"),
        },
    }


def build_shelter_mismatch(
    wards: gpd.GeoDataFrame | None,
    zones: gpd.GeoDataFrame | None,
) -> dict[str, Any]:
    """Units with stops present but weak shelter coverage."""

    def score_unit(row: dict[str, Any], unit_type: str) -> dict[str, Any] | None:
        label = clean_label(row.get("label") or "")
        if not label:
            label = f"Unnamed {unit_type}"
        stops = row.get("stop_count")
        shelters = row.get("shelter_count")
        if stops is None or str(stops) == "nan":
            return None
        stops_i = int(stops)
        if stops_i <= 0:
            return None
        shelters_i = (
            int(shelters) if shelters is not None and str(shelters) != "nan" else 0
        )
        ratio = shelters_i / max(stops_i, 1)
        # Mismatch 0–100
        if shelters_i == 0:
            mismatch = min(100, 55 + min(stops_i, 40))
        elif ratio < 0.08:
            mismatch = 70
        elif ratio < 0.15:
            mismatch = 55
        elif ratio < 0.25:
            mismatch = 40
        elif ratio < 0.4:
            mismatch = 25
        else:
            return None  # not a meaningful mismatch

        return {
            "id": label,
            "label": label,
            "unit_type": unit_type,
            "stop_count": stops_i,
            "shelter_count": shelters_i,
            "shelter_to_stop_ratio": round(ratio, 3),
            "mismatch_score": int(mismatch),
            "recommendation": (
                "Stops present but shelters absent or scarce — field-audit high-boarding locations "
                "and prioritise weather protection at transfer points."
            ),
        }

    ward_rows: list[dict[str, Any]] = []
    zone_rows: list[dict[str, Any]] = []
    if wards is not None and not wards.empty and "stop_count" in wards.columns:
        for _, row in wards.iterrows():
            item = score_unit(
                {
                    "label": row.get("ward_label"),
                    "stop_count": row.get("stop_count"),
                    "shelter_count": row.get("shelter_count"),
                },
                "ward",
            )
            if item:
                ward_rows.append(item)
    if zones is not None and not zones.empty and "stop_count" in zones.columns:
        for _, row in zones.iterrows():
            item = score_unit(
                {
                    "label": row.get("zone_label"),
                    "stop_count": row.get("stop_count"),
                    "shelter_count": row.get("shelter_count"),
                },
                "zone",
            )
            if item:
                zone_rows.append(item)

    ward_rows.sort(key=lambda r: (-r["mismatch_score"], -r["stop_count"], r["label"]))
    zone_rows.sort(key=lambda r: (-r["mismatch_score"], -r["stop_count"], r["label"]))
    return {
        "status": "loaded" if ward_rows or zone_rows else "unavailable",
        "note": (
            "Shelter mismatch ranks units where GTFS stops exist but mapped shelters are scarce. "
            "Shelter layer is presence-only — confirm with field audit."
        ),
        "wards": ward_rows,
        "zones": zone_rows,
        "priority_wards": ward_rows[:25],
        "priority_zones": zone_rows[:10],
        "counts": {
            "mismatch_wards": len(ward_rows),
            "mismatch_zones": len(zone_rows),
            "zero_shelter_wards": sum(1 for w in ward_rows if w["shelter_count"] == 0),
        },
    }


def build_catchment_coverage(
    wards: gpd.GeoDataFrame | None,
    catchment_400: gpd.GeoDataFrame | None,
    catchment_800: gpd.GeoDataFrame | None,
) -> dict[str, Any]:
    """Share of each ward's land area inside dissolved stop catchments (geometry only)."""
    if wards is None or wards.empty:
        return {
            "status": "unavailable",
            "reason": "Wards not loaded",
            "wards": [],
            "priority_wards": [],
        }
    if catchment_400 is None or catchment_400.empty:
        return {
            "status": "unavailable",
            "reason": "400m catchment not loaded",
            "wards": [],
            "priority_wards": [],
        }

    wards_m = project_m(wards).reset_index(drop=True)
    c400 = unary_union(project_m(catchment_400).geometry.values)
    c800 = None
    if catchment_800 is not None and not catchment_800.empty:
        c800 = unary_union(project_m(catchment_800).geometry.values)

    rows: list[dict[str, Any]] = []
    for _, row in wards_m.iterrows():
        label = clean_label(row.get("ward_label") or "") or "Unnamed ward"
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue
        area = float(geom.area)
        if area <= 0:
            continue
        try:
            inter400 = geom.intersection(c400)
            pct400 = round(100.0 * float(inter400.area) / area, 1)
        except Exception:  # noqa: BLE001
            pct400 = None
        pct800 = None
        if c800 is not None:
            try:
                inter800 = geom.intersection(c800)
                pct800 = round(100.0 * float(inter800.area) / area, 1)
            except Exception:  # noqa: BLE001
                pct800 = None

        # Coverage gap: how much of the ward sits outside 400m walk of a stop
        outside400 = None if pct400 is None else round(100.0 - pct400, 1)
        band = "unknown"
        if outside400 is not None:
            if outside400 >= 60:
                band = "high_gap"
            elif outside400 >= 35:
                band = "moderate_gap"
            else:
                band = "low_gap"

        rows.append(
            {
                "id": label,
                "label": label,
                "unit_type": "ward",
                "area_km2": round(area / 1_000_000, 3),
                "pct_area_within_400m": pct400,
                "pct_area_within_800m": pct800,
                "pct_area_outside_400m": outside400,
                "coverage_band": band,
                "stop_count": int(row["stop_count"])
                if "stop_count" in row and row.get("stop_count") is not None and str(row.get("stop_count")) != "nan"
                else None,
                "recommendation": (
                    "Large share of ward area sits beyond 400m of a mapped stop — review mid-block stops or feeders."
                    if band == "high_gap"
                    else (
                        "Moderate walk-coverage gaps remain — check residential pockets against the 400m catchment map."
                        if band == "moderate_gap"
                        else "Most land area falls inside 400m stop catchments (geometry only — not population-weighted)."
                    )
                ),
            }
        )

    rows.sort(
        key=lambda r: (
            -(r["pct_area_outside_400m"] if r["pct_area_outside_400m"] is not None else -1),
            r["label"],
        )
    )
    mean_outside = None
    outs = [r["pct_area_outside_400m"] for r in rows if r["pct_area_outside_400m"] is not None]
    if outs:
        mean_outside = round(sum(outs) / len(outs), 1)

    return {
        "status": "loaded",
        "note": (
            "Catchment coverage is the share of ward polygon area inside dissolved 400m/800m "
            "stop buffers. Geometry only — not population-weighted access."
        ),
        "city_mean_pct_outside_400m": mean_outside,
        "wards": rows,
        "priority_wards": [w for w in rows if w["coverage_band"] == "high_gap"][:25],
        "counts": {
            "wards_scored": len(rows),
            "high_gap_wards": sum(1 for w in rows if w["coverage_band"] == "high_gap"),
            "moderate_gap_wards": sum(1 for w in rows if w["coverage_band"] == "moderate_gap"),
            "low_gap_wards": sum(1 for w in rows if w["coverage_band"] == "low_gap"),
        },
    }


def build_advanced_analyses(
    *,
    hubs: gpd.GeoDataFrame | None,
    stops: gpd.GeoDataFrame | None,
    shelters: gpd.GeoDataFrame | None,
    wards: gpd.GeoDataFrame | None,
    zones: gpd.GeoDataFrame | None,
    catchment_400: gpd.GeoDataFrame | None,
    catchment_800: gpd.GeoDataFrame | None,
) -> dict[str, Any]:
    hub_lm = build_hub_last_mile(hubs, stops, shelters)
    shelter_mm = build_shelter_mismatch(wards, zones)
    coverage = build_catchment_coverage(wards, catchment_400, catchment_800)
    return {
        "generated_at": utc_now(),
        "note": (
            "Advanced analyses derived only from verified spatial joins and buffers. "
            "No census equity or ridership scores."
        ),
        "hub_last_mile": hub_lm,
        "shelter_mismatch": shelter_mm,
        "catchment_coverage": coverage,
    }


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

    # --- Ward / zone inventory joins (verified spatial counts) ---
    if layers["wards"] is not None:
        try:
            wards_enriched = layers["wards"].copy()
            wards_enriched["ward_label"] = wards_enriched["ward_label"].map(clean_label)
            wards_enriched = add_area_km2(wards_enriched)
            if layers["stops"] is not None:
                wards_enriched = count_points_in_polygons(
                    wards_enriched, layers["stops"], "stop_count"
                )
            else:
                wards_enriched["stop_count"] = None
            if layers["shelters"] is not None:
                wards_enriched = count_points_in_polygons(
                    wards_enriched, layers["shelters"], "shelter_count"
                )
            else:
                wards_enriched["shelter_count"] = None
            if layers["hubs"] is not None:
                wards_enriched = count_points_in_polygons(
                    wards_enriched, layers["hubs"], "hub_count"
                )
            else:
                wards_enriched["hub_count"] = None
            layers["wards"] = wards_enriched
            n = write_geojson(wards_enriched, PROCESSED / "wards.geojson")
            manifest["layers"]["wards"]["feature_count"] = n
            manifest["layers"]["wards"]["attributes"] = [
                a
                for a in ["ward_label", "stop_count", "shelter_count", "hub_count", "area_km2"]
                if a in wards_enriched.columns
            ]
            print(f"[ok] wards enriched with inventory counts ({n})")
        except Exception as exc:  # noqa: BLE001
            print(f"[fail] ward enrichment: {exc}", file=sys.stderr)

    if layers["zones"] is not None:
        try:
            zones_enriched = layers["zones"].copy()
            zones_enriched["zone_label"] = zones_enriched["zone_label"].map(clean_label)
            zones_enriched = add_area_km2(zones_enriched)
            if layers["stops"] is not None:
                zones_enriched = count_points_in_polygons(
                    zones_enriched, layers["stops"], "stop_count"
                )
            else:
                zones_enriched["stop_count"] = None
            if layers["shelters"] is not None:
                zones_enriched = count_points_in_polygons(
                    zones_enriched, layers["shelters"], "shelter_count"
                )
            else:
                zones_enriched["shelter_count"] = None
            if layers["hubs"] is not None:
                zones_enriched = count_points_in_polygons(
                    zones_enriched, layers["hubs"], "hub_count"
                )
            else:
                zones_enriched["hub_count"] = None
            layers["zones"] = zones_enriched
            n = write_geojson(zones_enriched, PROCESSED / "zones.geojson")
            if "zones" in manifest["layers"]:
                manifest["layers"]["zones"]["feature_count"] = n
                manifest["layers"]["zones"]["attributes"] = [
                    a
                    for a in ["zone_label", "stop_count", "shelter_count", "hub_count", "area_km2"]
                    if a in zones_enriched.columns
                ]
            print(f"[ok] zones enriched with inventory counts ({n})")
        except Exception as exc:  # noqa: BLE001
            print(f"[fail] zone enrichment: {exc}", file=sys.stderr)

    reports = build_spatial_reports(layers["wards"], layers["zones"])
    (PROCESSED / "reports.json").write_text(json.dumps(reports, indent=2))
    print(
        f"[ok] reports.json ({len(reports.get('wards', []))} wards, {len(reports.get('zones', []))} zones)"
    )

    analyses = build_advanced_analyses(
        hubs=layers.get("hubs"),
        stops=layers.get("stops"),
        shelters=layers.get("shelters"),
        wards=layers.get("wards"),
        zones=layers.get("zones"),
        catchment_400=layers.get("catchment_400m"),
        catchment_800=layers.get("catchment_800m"),
    )

    # Extended metro: OMR → Mahabalipuram, Tambaram, Chengalpattu
    try:
        metro_ext = build_metro_extension(
            stops=layers.get("stops"),
            shelters=layers.get("shelters"),
            hubs=layers.get("hubs"),
        )
        for key, meta in metro_ext.get("layers", {}).items():
            manifest["layers"][key] = meta
            if meta.get("status") == "loaded" and meta.get("file"):
                print(f"[ok] {meta['file']}")
        if metro_ext.get("inventory"):
            analyses["metro_corridors"] = metro_ext["inventory"]
            print(
                f"[ok] metro corridor inventory ({len(metro_ext['inventory'].get('areas', []))} areas)"
            )
        for err in metro_ext.get("errors") or []:
            print(f"[warn] metro extension: {err}", file=sys.stderr)
    except Exception as exc:  # noqa: BLE001
        print(f"[fail] metro extension: {exc}", file=sys.stderr)
        analyses["metro_corridors"] = {
            "status": "unavailable",
            "reason": str(exc),
            "areas": [],
        }

    # Roads that need better feeder / mid-block connectivity
    try:
        conn = build_connectivity_need(
            wards=layers.get("wards"),
            stops=layers.get("stops"),
            catchment_400=layers.get("catchment_400m"),
            reports=reports,
            hubs=layers.get("hubs"),
        )
        for key, meta in conn.get("layers", {}).items():
            manifest["layers"][key] = meta
            if meta.get("status") == "loaded" and meta.get("file"):
                print(f"[ok] {meta['file']} ({meta.get('feature_count')} corridors)")
        analyses["connectivity_need"] = conn.get("analysis") or {
            "status": "unavailable",
            "corridors": [],
        }
        for err in conn.get("errors") or []:
            print(f"[warn] connectivity need: {err}", file=sys.stderr)
    except Exception as exc:  # noqa: BLE001
        print(f"[fail] connectivity need: {exc}", file=sys.stderr)
        analyses["connectivity_need"] = {
            "status": "unavailable",
            "reason": str(exc),
            "corridors": [],
        }

    (PROCESSED / "analyses.json").write_text(json.dumps(analyses, indent=2))
    hub_n = len(analyses.get("hub_last_mile", {}).get("hubs", []))
    mm_n = analyses.get("shelter_mismatch", {}).get("counts", {}).get("mismatch_wards", 0)
    cov_n = analyses.get("catchment_coverage", {}).get("counts", {}).get("wards_scored", 0)
    print(f"[ok] analyses.json (hubs={hub_n}, shelter_mismatch_wards={mm_n}, coverage_wards={cov_n})")

    metrics = build_metrics(
        layers["wards"], layers["stops"], layers["shelters"], layers["hubs"]
    )
    if reports.get("city_mean_stops_per_ward") is not None:
        metrics["counts"]["city_mean_stops_per_ward"] = reports["city_mean_stops_per_ward"]
    if reports.get("city_mean_gap_index") is not None:
        metrics["counts"]["city_mean_gap_index"] = reports["city_mean_gap_index"]
    if reports.get("priority_wards") is not None:
        metrics["counts"]["high_gap_wards"] = len(reports["priority_wards"])
        metrics["counts"]["priority_wards"] = len(reports["priority_wards"])
    if reports.get("severe_gap_wards") is not None:
        metrics["counts"]["severe_gap_wards"] = len(reports["severe_gap_wards"])
    if reports.get("priority_zones") is not None:
        metrics["counts"]["priority_zones"] = len(reports["priority_zones"])
        metrics["counts"]["high_gap_zones"] = len(reports["priority_zones"])
    # Advanced analysis rollups
    hlm = analyses.get("hub_last_mile", {})
    if hlm.get("status") == "loaded":
        metrics["counts"]["weak_last_mile_hubs"] = hlm.get("counts", {}).get("weak_hubs", 0)
    smm = analyses.get("shelter_mismatch", {})
    if smm.get("status") == "loaded":
        metrics["counts"]["shelter_mismatch_wards"] = smm.get("counts", {}).get(
            "mismatch_wards", 0
        )
        metrics["counts"]["zero_shelter_with_stops_wards"] = smm.get("counts", {}).get(
            "zero_shelter_wards", 0
        )
    cov = analyses.get("catchment_coverage", {})
    if cov.get("status") == "loaded":
        metrics["counts"]["high_catchment_gap_wards"] = cov.get("counts", {}).get(
            "high_gap_wards", 0
        )
        if cov.get("city_mean_pct_outside_400m") is not None:
            metrics["counts"]["city_mean_pct_outside_400m"] = cov["city_mean_pct_outside_400m"]
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
