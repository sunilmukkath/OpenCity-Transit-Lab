#!/usr/bin/env python3
"""
Fetch selected TNGIS WFS layers for the Chennai / CMA study bbox.

Public GetFeature works for some generic_viewer layers; others return 400/500
(server DB connection failures). Status is recorded honestly in the manifest.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
WEB = ROOT / "apps" / "web" / "public" / "data"

WFS_URL = "https://tngis.tn.gov.in/tngismaps/wfs"
WFS_PORTAL = "https://tngis.tn.gov.in/"
# lon/lat — same study box as other Chennai clips
BBOX = (79.95, 12.70, 80.40, 13.30)
UA = "OpenCity-Transit-Lab/1.0 (+https://github.com/sunilmukkath/OpenCity-Transit-Lab)"

# Layers we attempt. Only verified GetFeature successes are marked loaded.
LAYER_SPECS: list[dict[str, Any]] = [
    {
        "key": "tngis_settlement_area",
        "typename": "generic_viewer:settlement_area",
        "label": "TNGIS settlement area (built-up)",
        "geometry": "polygon",
        "keep": [
            "label",
            "landuse_level_1",
            "landuse_level_2",
            "landuse_level_3",
            "Habitation_name",
            "District",
            "taluk",
            "ac_name",
            "pc_name",
            "object_id",
            "source_layer",
        ],
    },
    {
        "key": "tngis_habitation",
        "typename": "generic_viewer:habitation",
        "label": "TNGIS habitation points",
        "geometry": "point",
        "keep": [
            "label",
            "habitation_name",
            "village_name",
            "block_name",
            "ac_name",
            "pc_name",
            "object_id",
            "source_layer",
        ],
    },
    {
        "key": "tngis_slum_boundary",
        "typename": "generic_viewer:slum_boundary",
        "label": "TNGIS slum boundary",
        "geometry": "polygon",
        "keep": ["label", "source_layer"],
    },
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _copy_web(name: str) -> None:
    src = PROCESSED / name
    if src.exists():
        WEB.mkdir(parents=True, exist_ok=True)
        (WEB / name).write_bytes(src.read_bytes())


def _fetch_page(typename: str, start: int, count: int = 500) -> dict[str, Any]:
    minx, miny, maxx, maxy = BBOX
    q = {
        "service": "WFS",
        "version": "2.0.0",
        "request": "GetFeature",
        "typeNames": typename,
        "srsName": "EPSG:4326",
        "bbox": f"{minx},{miny},{maxx},{maxy},EPSG:4326",
        "outputFormat": "application/json",
        "count": str(count),
        "startIndex": str(start),
    }
    url = WFS_URL + "?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as resp:
        raw = resp.read()
    if raw.lstrip().startswith(b"<?xml") or b"ExceptionReport" in raw[:400]:
        raise RuntimeError(raw[:400].decode("utf-8", "replace"))
    return json.loads(raw)


def fetch_typename(typename: str) -> gpd.GeoDataFrame:
    features: list[dict[str, Any]] = []
    start = 0
    matched: int | None = None
    while True:
        page = _fetch_page(typename, start)
        batch = page.get("features") or []
        matched = page.get("numberMatched", matched)
        features.extend(batch)
        print(f"    {typename} +{len(batch)} total={len(features)} matched={matched}")
        if not batch:
            break
        start += len(batch)
        if matched is not None and len(features) >= int(matched):
            break
        if len(batch) < 500:
            break
        time.sleep(0.35)
    if not features:
        return gpd.GeoDataFrame(geometry=[], crs="EPSG:4326")
    gdf = gpd.GeoDataFrame.from_features(
        {"type": "FeatureCollection", "features": features}, crs="EPSG:4326"
    )
    return gdf


def _clean_settlement(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    out = gdf.copy()
    out["source_layer"] = "generic_viewer:settlement_area"
    name = out.get("Habitation_name")
    lu3 = out.get("landuse_level_3")
    lu2 = out.get("landuse_level_2")
    out["label"] = (
        name.astype(str).where(name.notna() & (name.astype(str) != "nan"), None)
        if name is not None
        else None
    )
    if out["label"].isna().all() and lu3 is not None:
        out["label"] = lu3.astype(str)
    elif lu3 is not None:
        out["label"] = out["label"].fillna(lu3.astype(str))
    if lu2 is not None:
        out["label"] = out["label"].fillna(lu2.astype(str))
    out["label"] = out["label"].fillna("Settlement").astype(str)
    # Light simplify for web payload (topology-preserving)
    out["geometry"] = out.geometry.simplify(0.00012, preserve_topology=True)
    return out


def _clean_habitation(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    out = gdf.copy()
    out["source_layer"] = "generic_viewer:habitation"
    hab = out.get("habitation_name")
    vil = out.get("village_name")
    if hab is not None:
        out["label"] = hab.astype(str)
    else:
        out["label"] = "Habitation"
    if vil is not None:
        out.loc[out["label"].isin(["nan", "None", ""]), "label"] = vil.astype(str)
    out["label"] = out["label"].fillna("Habitation").astype(str)
    return out


def _write_layer(key: str, gdf: gpd.GeoDataFrame, keep: list[str]) -> int:
    cols = [c for c in keep if c in gdf.columns] + ["geometry"]
    slim = gdf[cols].copy()
    # Replace NaN with None for JSON
    for c in slim.columns:
        if c == "geometry":
            continue
        slim[c] = slim[c].where(pd.notna(slim[c]), None)
    path = PROCESSED / f"{key}.geojson"
    slim.to_file(path, driver="GeoJSON")
    _copy_web(f"{key}.geojson")
    return len(slim)


def update_manifest(results: dict[str, dict[str, Any]]) -> None:
    path = PROCESSED / "manifest.json"
    if not path.exists():
        return
    manifest = json.loads(path.read_text())
    layers = manifest.setdefault("layers", {})
    sources = manifest.setdefault("sources", {})

    loaded_any = False
    for key, meta in results.items():
        layers[key] = meta
        if meta.get("status") == "loaded":
            loaded_any = True

    # Flip the jam catalog stub to reflect connector status
    jam = sources.get("jam_tngis_server") or {
        "id": "jam_tngis_server",
        "name": "TNGIS server",
        "url": WFS_URL,
        "portal": WFS_PORTAL,
        "publisher": "TNeGA / TNGIS",
        "kind": "wfs",
    }
    jam.update(
        {
            "status": "loaded" if loaded_any else "unavailable",
            "fetched_at": _now(),
            "notes": (
                "WFS connector wired for settlement_area + habitation (CMA bbox). "
                "Slum and many TNGIS_V2 layers return server errors on GetFeature — marked Unavailable."
                if loaded_any
                else "TNGIS WFS GetFeature failed for allowlisted layers."
            ),
            "layers_loaded": [k for k, m in results.items() if m.get("status") == "loaded"],
        }
    )
    sources["jam_tngis_server"] = jam
    sources["tngis_wfs"] = {
        "id": "tngis_wfs",
        "name": "TNGIS WFS (settlement / habitation)",
        "publisher": "TNeGA / Tamil Nadu Geographical Information System",
        "url": WFS_URL,
        "portal": WFS_PORTAL,
        "license": "See TNGIS terms of use — inventory context only",
        "kind": "wfs",
        "status": "loaded" if loaded_any else "unavailable",
        "fetched_at": _now(),
        "notes": jam["notes"],
        "bbox": list(BBOX),
    }

    path.write_text(json.dumps(manifest, indent=2))
    _copy_web("manifest.json")


def ingest_layer(spec: dict[str, Any]) -> dict[str, Any]:
    key = spec["key"]
    typename = spec["typename"]
    base: dict[str, Any] = {
        "status": "unavailable",
        "file": f"{key}.geojson",
        "derived_from": "tngis_wfs",
        "source_typename": typename,
        "bbox": list(BBOX),
        "notes": spec["label"],
    }
    try:
        gdf = fetch_typename(typename)
        if gdf.empty:
            base["reason"] = "GetFeature returned zero features in study bbox"
            return base
        if key == "tngis_settlement_area":
            gdf = _clean_settlement(gdf)
        elif key == "tngis_habitation":
            gdf = _clean_habitation(gdf)
        else:
            gdf = gdf.copy()
            gdf["source_layer"] = typename
            gdf["label"] = key
        n = _write_layer(key, gdf, spec["keep"])
        base.update(
            {
                "status": "loaded",
                "feature_count": n,
                "attributes": [c for c in spec["keep"] if c in gdf.columns],
                "notes": (
                    f"{spec['label']} via public TNGIS WFS, clipped to CMA study bbox. "
                    "Inventory context only — not an equity score."
                ),
            }
        )
        return base
    except Exception as exc:  # noqa: BLE001
        base["reason"] = str(exc)[:400]
        base["notes"] = (
            f"{spec['label']} — GetFeature failed ({type(exc).__name__}). "
            "Export from QGIS if you have departmental access."
        )
        return base


def main() -> int:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    results: dict[str, dict[str, Any]] = {}
    print("[…] TNGIS WFS ingest")
    for spec in LAYER_SPECS:
        print(f"  → {spec['key']} ({spec['typename']})")
        meta = ingest_layer(spec)
        results[spec["key"]] = meta
        print(f"     {meta.get('status')} n={meta.get('feature_count')} {meta.get('reason') or ''}")

    update_manifest(results)

    # Lightweight analyses note
    analyses_path = PROCESSED / "analyses.json"
    analyses = json.loads(analyses_path.read_text()) if analyses_path.exists() else {}
    analyses["tngis_wfs"] = {
        "status": "loaded"
        if any(m.get("status") == "loaded" for m in results.values())
        else "unavailable",
        "layers": {k: {"status": m.get("status"), "feature_count": m.get("feature_count"), "reason": m.get("reason")} for k, m in results.items()},
        "note": "TNGIS settlement/habitation inventory for map context. Slum WFS Unavailable.",
        "bbox": list(BBOX),
        "fetched_at": _now(),
    }
    analyses_path.write_text(json.dumps(analyses, indent=2))
    _copy_web("analyses.json")
    print("[ok] TNGIS WFS ingest complete")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
