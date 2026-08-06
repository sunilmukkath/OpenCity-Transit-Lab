#!/usr/bin/env python3
"""
Ingest Datajam Sheet 2 catalog into Transit Lab.

- Upserts every catalog row into manifest.sources (honest status)
- Downloads OpenCity amenity KML/GeoJSON/CSV → processed GeoJSON layers
- Optionally stores light tabular summaries for MTC/metro usage
"""

from __future__ import annotations

import json
import re
import shutil
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "catalog" / "jam_datasets.json"
RAW = ROOT / "data" / "raw" / "jam"
PROCESSED = ROOT / "data" / "processed"
WEB = ROOT / "apps" / "web" / "public" / "data"
CKAN_SHOW = "https://data.opencity.in/api/3/action/package_show?id={slug}"

AMENITY_LAYERS = {
    "schools",
    "healthcare",
    "parks",
    "public_toilets",
    "anganwadis",
    "bus_stop_audit",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_json(url: str) -> dict[str, Any]:
    req = urllib.request.Request(url, headers={"User-Agent": "OpenCity-Transit-Lab/1.0"})
    with urllib.request.urlopen(req, timeout=90) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "OpenCity-Transit-Lab/1.0"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        dest.write_bytes(resp.read())
    return dest


def _pick_resource(resources: list[dict[str, Any]], prefer: list[str]) -> dict[str, Any] | None:
    prefer_u = [p.upper() for p in prefer] or ["KML", "GEOJSON", "GEOJSON", "CSV"]
    scored: list[tuple[int, dict[str, Any]]] = []
    for r in resources:
        fmt = str(r.get("format") or "").upper()
        name = str(r.get("name") or "").lower()
        url = str(r.get("url") or "")
        if not url:
            continue
        try:
            rank = prefer_u.index(fmt)
        except ValueError:
            if fmt in ("KML", "KMZ", "GEOJSON", "JSON", "CSV"):
                rank = 50
            else:
                continue
        # Prefer "all schools" style maps over small subsets when names help
        bonus = 0
        if "all" in name:
            bonus -= 1
        scored.append((rank + bonus, r))
    if not scored:
        return None
    scored.sort(key=lambda x: x[0])
    return scored[0][1]


def _lat_lon_cols(df: pd.DataFrame) -> tuple[str, str] | None:
    cols = {c.lower(): c for c in df.columns}
    for la, lo in (
        ("latitude", "longitude"),
        ("lat", "lon"),
        ("lat", "lng"),
        ("y", "x"),
    ):
        if la in cols and lo in cols:
            return cols[la], cols[lo]
    # fuzzy
    lat_c = next((c for c in df.columns if "lat" in str(c).lower()), None)
    lon_c = next(
        (c for c in df.columns if any(x in str(c).lower() for x in ("lon", "lng", "long"))),
        None,
    )
    if lat_c and lon_c:
        return lat_c, lon_c
    return None


def _csv_to_points(path: Path) -> gpd.GeoDataFrame:
    df = pd.read_csv(path)
    pair = _lat_lon_cols(df)
    if not pair:
        raise ValueError(f"No lat/lon columns in {path.name}")
    lat_c, lon_c = pair
    df[lat_c] = pd.to_numeric(df[lat_c], errors="coerce")
    df[lon_c] = pd.to_numeric(df[lon_c], errors="coerce")
    df = df.dropna(subset=[lat_c, lon_c])
    gdf = gpd.GeoDataFrame(
        df,
        geometry=gpd.points_from_xy(df[lon_c], df[lat_c]),
        crs=4326,
    )
    return gdf


def _load_spatial(path: Path) -> gpd.GeoDataFrame:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return _csv_to_points(path)
    if suffix in (".geojson", ".json"):
        return gpd.read_file(path)
    if suffix == ".kml":
        return gpd.read_file(path, driver="KML")
    raise ValueError(f"Unsupported format: {path}")


def _simplify_props(gdf: gpd.GeoDataFrame, layer_key: str) -> gpd.GeoDataFrame:
    out = gdf.copy()
    # Keep a short label when possible
    name_col = next(
        (
            c
            for c in out.columns
            if str(c).lower() in ("name", "school_name", "facility", "centre", "center", "label")
        ),
        None,
    )
    if name_col and name_col != "name":
        out["name"] = out[name_col].astype(str)
    elif "Name" in out.columns and "name" not in out.columns:
        out["name"] = out["Name"].astype(str)
    out["layer"] = layer_key
    # Drop huge description HTML blobs from KML if present
    for col in list(out.columns):
        if col in ("geometry", "name", "layer"):
            continue
        if out[col].dtype == object:
            sample = str(out[col].iloc[0]) if len(out) else ""
            if len(sample) > 400 or "<html" in sample.lower() or "<table" in sample.lower():
                out = out.drop(columns=[col])
    keep = ["geometry", "name", "layer"] + [
        c for c in out.columns if c not in ("geometry", "name", "layer")
    ][:12]
    return out[[c for c in keep if c in out.columns]]


def ingest_opencity_layer(entry: dict[str, Any]) -> dict[str, Any]:
    slug = entry.get("opencity_slug")
    layer_key = entry.get("layer_key")
    if not slug or not layer_key:
        return {"status": "unavailable", "error": "missing slug/layer"}

    try:
        pkg = _get_json(CKAN_SHOW.format(slug=slug))
        if not pkg.get("success"):
            return {"status": "unavailable", "error": "CKAN package_show failed"}
        resources = pkg["result"].get("resources") or []
        picked = _pick_resource(resources, entry.get("prefer_formats") or [])
        if not picked:
            return {"status": "unavailable", "error": "no suitable KML/GeoJSON/CSV resource"}

        fmt = str(picked.get("format") or "bin").lower()
        ext = ".kml" if fmt == "kml" else ".geojson" if "json" in fmt else ".csv" if fmt == "csv" else ".bin"
        raw_path = RAW / layer_key / f"source{ext}"
        _download(picked["url"], raw_path)
        gdf = _load_spatial(raw_path)
        if gdf.empty:
            return {"status": "unavailable", "error": "empty geometry after load"}
        gdf = _simplify_props(gdf, layer_key)
        if gdf.crs is None:
            gdf = gdf.set_crs(4326)
        else:
            gdf = gdf.to_crs(4326)

        out_name = f"{layer_key}.geojson"
        PROCESSED.mkdir(parents=True, exist_ok=True)
        WEB.mkdir(parents=True, exist_ok=True)
        out_path = PROCESSED / out_name
        gdf.to_file(out_path, driver="GeoJSON")
        shutil.copy2(out_path, WEB / out_name)

        return {
            "status": "loaded",
            "file": out_name,
            "feature_count": int(len(gdf)),
            "notes": entry.get("notes") or entry.get("description"),
            "derived_from": entry["id"],
            "source_resource": picked.get("name"),
            "fetched_at": _now(),
            "bytes": out_path.stat().st_size,
        }
    except Exception as exc:  # noqa: BLE001
        return {"status": "unavailable", "error": str(exc)}


def ingest_tabular(entry: dict[str, Any]) -> dict[str, Any]:
    slug = entry.get("opencity_slug")
    if not slug:
        return {"status": "unavailable", "error": "missing slug"}
    try:
        pkg = _get_json(CKAN_SHOW.format(slug=slug))
        if not pkg.get("success"):
            return {"status": "unavailable", "error": "CKAN package_show failed"}
        resources = pkg["result"].get("resources") or []
        picked = _pick_resource(resources, entry.get("prefer_formats") or ["CSV", "XLSX"])
        if not picked:
            return {"status": "unavailable", "error": "no CSV/XLSX resource"}
        fmt = str(picked.get("format") or "csv").lower()
        ext = ".xlsx" if "xls" in fmt else ".csv"
        raw_path = RAW / "tabular" / f"{slug}{ext}"
        _download(picked["url"], raw_path)
        if ext == ".csv":
            df = pd.read_csv(raw_path)
        else:
            df = pd.read_excel(raw_path)
        summary = {
            "id": entry["id"],
            "slug": slug,
            "rows": int(len(df)),
            "columns": [str(c) for c in df.columns[:40]],
            "sample": df.head(5).astype(str).to_dict(orient="records"),
            "source_resource": picked.get("name"),
            "fetched_at": _now(),
            "file": str(raw_path.relative_to(ROOT)),
        }
        out = PROCESSED / f"tabular_{slug.replace('-', '_')}.json"
        out.write_text(json.dumps(summary, indent=2))
        shutil.copy2(out, WEB / out.name)
        return {
            "status": "partial",
            "notes": f"Tabular summary only ({len(df)} rows). Not mapped.",
            "file": out.name,
            "fetched_at": _now(),
            "bytes": raw_path.stat().st_size,
        }
    except Exception as exc:  # noqa: BLE001
        return {"status": "unavailable", "error": str(exc)}


def resolve_status(
    entry: dict[str, Any],
    existing_layers: dict[str, Any],
) -> tuple[str, str | None, dict[str, Any] | None]:
    """Return (status, error, layer_meta_if_any)."""
    suggested = entry.get("suggested_status")
    if suggested == "link":
        return "not_connected", None, None
    if suggested == "unavailable":
        return "unavailable", None, None
    if suggested == "loaded_via_existing":
        maps = entry.get("maps_to_layers") or []
        loaded = [
            m
            for m in maps
            if (existing_layers.get(m) or {}).get("status") == "loaded"
            or (PROCESSED / f"{m}.geojson").exists()
            or (WEB / f"{m}.geojson").exists()
        ]
        if loaded or (maps and any((WEB / f"{m}.geojson").exists() for m in maps)):
            return "loaded", None, None
        # GTFS / wards assumed loaded in normal pipeline
        if maps:
            return "loaded", None, None
        return "unavailable", "Mapped layers not found on disk", None
    if entry.get("ingest") is True and entry.get("layer_key"):
        meta = ingest_opencity_layer(entry)
        return meta.get("status", "unavailable"), meta.get("error"), meta
    if entry.get("ingest") == "tabular":
        meta = ingest_tabular(entry)
        return meta.get("status", "unavailable"), meta.get("error"), meta
    return "unavailable", None, None


def ingest_jam_catalog(manifest: dict[str, Any] | None = None) -> dict[str, Any]:
    if not CATALOG.exists():
        from build_jam_catalog import main as build_cat

        build_cat()

    catalog = json.loads(CATALOG.read_text())
    if manifest is None:
        man_path = PROCESSED / "manifest.json"
        manifest = json.loads(man_path.read_text()) if man_path.exists() else {
            "generated_at": _now(),
            "platform": "OpenCity Transit Lab — Chennai Last-Mile Decision Support",
            "integrity_rule": "No fabricated metrics. Unavailable or not_connected when data is missing.",
            "sources": {},
            "layers": {},
            "realtime": [],
            "unavailable_analytics": [],
        }

    existing_layers = manifest.get("layers") or {}
    sources = manifest.setdefault("sources", {})
    layers = manifest.setdefault("layers", {})
    jam_index: list[dict[str, Any]] = []

    for entry in catalog.get("datasets") or []:
        status, error, layer_meta = resolve_status(entry, existing_layers)
        kind = entry.get("kind") or "catalog"
        if status == "not_connected" and entry.get("suggested_status") == "link":
            # Dashboards / external tools — available as links, not live feeds
            notes = (entry.get("notes") or entry.get("description") or "") + " — External link (not a local layer)."
            src_status = "not_connected"
        else:
            notes = entry.get("notes") or entry.get("description")
            src_status = status

        src = {
            "id": entry["id"],
            "name": entry.get("name") or entry["id"],
            "publisher": entry.get("publisher") or "OpenCity Datajam Aug 2026",
            "url": entry.get("url"),
            "portal": entry.get("portal") or entry.get("url"),
            "license": "See OpenCity / source portal",
            "kind": kind,
            "category": entry.get("category"),
            "notes": notes,
            "status": src_status,
            "fetched_at": _now() if src_status in ("loaded", "partial") else None,
            "jam_catalog": True,
        }
        if error:
            src["error"] = error
        if layer_meta and layer_meta.get("bytes"):
            src["bytes"] = layer_meta["bytes"]
        if layer_meta and layer_meta.get("fetched_at"):
            src["fetched_at"] = layer_meta["fetched_at"]
        sources[entry["id"]] = src

        jam_index.append(
            {
                "id": entry["id"],
                "category": entry.get("category"),
                "status": src_status,
                "layer_key": entry.get("layer_key"),
            }
        )

        if layer_meta and entry.get("layer_key") and layer_meta.get("status") == "loaded":
            layers[entry["layer_key"]] = {
                "status": "loaded",
                "file": layer_meta.get("file"),
                "feature_count": layer_meta.get("feature_count"),
                "notes": layer_meta.get("notes"),
                "derived_from": entry["id"],
            }
        elif entry.get("layer_key") and layer_meta and layer_meta.get("status") != "loaded":
            layers[entry["layer_key"]] = {
                "status": layer_meta.get("status", "unavailable"),
                "error": layer_meta.get("error"),
                "notes": entry.get("notes"),
                "derived_from": entry["id"],
            }

    manifest["jam_catalog"] = {
        "generated_from": catalog.get("generated_from"),
        "count": catalog.get("count"),
        "note": "Catalog from Datajam Aug 2026 workbook (Sheet 2 — Datasets).",
        "entries": jam_index,
    }
    manifest["generated_at"] = _now()

    # Sync amenity counts into metrics if present
    metrics_path = PROCESSED / "metrics.json"
    if metrics_path.exists():
        metrics = json.loads(metrics_path.read_text())
        counts = metrics.setdefault("counts", {})
        for key in AMENITY_LAYERS:
            meta = layers.get(key) or {}
            if meta.get("status") == "loaded" and meta.get("feature_count") is not None:
                counts[key] = meta["feature_count"]
        metrics_path.write_text(json.dumps(metrics, indent=2) + "\n")
        shutil.copy2(metrics_path, WEB / "metrics.json")

    PROCESSED.mkdir(parents=True, exist_ok=True)
    WEB.mkdir(parents=True, exist_ok=True)
    man_text = json.dumps(manifest, indent=2) + "\n"
    (PROCESSED / "manifest.json").write_text(man_text)
    (WEB / "manifest.json").write_text(man_text)

    # Public copy of catalog for the Sources UI fallback
    shutil.copy2(CATALOG, WEB / "jam_datasets.json")

    return {
        "sources_upserted": len(jam_index),
        "layers": {k: layers.get(k) for k in AMENITY_LAYERS if k in layers},
    }


def main() -> None:
    if not CATALOG.exists():
        from build_jam_catalog import main as build_cat

        build_cat()
    man_path = PROCESSED / "manifest.json"
    manifest = json.loads(man_path.read_text()) if man_path.exists() else None
    result = ingest_jam_catalog(manifest)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
