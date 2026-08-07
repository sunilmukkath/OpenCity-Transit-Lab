#!/usr/bin/env python3
"""
Geocode CMP corridor names (from PDF extract) via Nominatim → LineString layer.

Partial: only corridors that resolve to OSM ways/relations with geometry.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
WEB = ROOT / "apps" / "web" / "public" / "data"

NOMINATIM = "https://nominatim.openstreetmap.org/search"
UA = "OpenCity-TransitLab/1.0 (civic research; contact via GitHub)"

# Prefer searchable road names in Chennai
CORRIDOR_QUERIES: list[tuple[str, str]] = [
    ("IT Corridor / OMR", "Rajiv Gandhi Salai, Chennai"),
    ("Anna Salai", "Anna Salai, Chennai"),
    ("Periyar EVR Salai", "EVR Periyar Salai, Chennai"),
    ("GST Road", "GST Road, Chennai"),
    ("GNT Road", "Grand Northern Trunk Road, Chennai"),
    ("Inner Ring Road", "Inner Ring Road, Chennai"),
    ("Outer Ring Road", "Chennai Outer Ring Road"),
    ("NH32", "NH 32, Chennai"),
    ("NH16", "NH 16, Chennai"),
    ("T.Nagar", "Thyagaraya Road, T Nagar, Chennai"),
]


def _geocode(query: str) -> dict[str, Any] | None:
    try:
        resp = requests.get(
            NOMINATIM,
            params={
                "q": query,
                "format": "json",
                "limit": 1,
                "polygon_geojson": 1,
                "countrycodes": "in",
            },
            headers={"User-Agent": UA},
            timeout=30,
        )
        resp.raise_for_status()
        rows = resp.json()
        if not rows:
            return None
        return rows[0]
    except Exception:  # noqa: BLE001
        return None


def build() -> tuple[dict[str, Any], dict[str, Any]]:
    cmp_path = WEB / "cmp_mobility_insights.json"
    if not cmp_path.exists():
        cmp_path = PROCESSED / "cmp_mobility_insights.json"
    mentioned: list[str] = []
    if cmp_path.exists():
        cmp = json.loads(cmp_path.read_text())
        mentioned = list(cmp.get("corridors_mentioned") or [])

    features: list[dict[str, Any]] = []
    resolved: list[str] = []
    failed: list[str] = []

    for name, query in CORRIDOR_QUERIES:
        row = _geocode(query)
        time.sleep(1.1)  # Nominatim usage policy
        if not row:
            failed.append(name)
            continue
        geom = row.get("geojson")
        if not geom:
            # fallback point → skip lines-only layer
            failed.append(name)
            continue
        if geom.get("type") not in ("LineString", "MultiLineString", "Polygon", "MultiPolygon"):
            # Accept polygons as corridor envelopes
            pass
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "corridor_name": name,
                    "query": query,
                    "osm_display_name": row.get("display_name"),
                    "osm_type": row.get("type") or row.get("class"),
                    "source": "cmp_pdf_mention+nominatim",
                },
                "geometry": geom,
            }
        )
        resolved.append(name)

    fc = {"type": "FeatureCollection", "features": features}
    meta = {
        "status": "partial" if features else "unavailable",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "note": (
            "CMP corridor names from PDF text extract, geocoded via Nominatim/OSM. "
            "Not official CMDA centerlines — approximate for map context only."
        ),
        "corridors_mentioned_in_pdf": mentioned[:30],
        "resolved": resolved,
        "failed": failed,
        "counts": {"features": len(features)},
    }
    return fc, meta


def main() -> int:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    WEB.mkdir(parents=True, exist_ok=True)
    print("  Geocoding CMP corridors (Nominatim)…")
    fc, meta = build()
    out = PROCESSED / "cmp_corridors.geojson"
    out.write_text(json.dumps(fc))
    (WEB / "cmp_corridors.geojson").write_text(out.read_text())
    (PROCESSED / "cmp_corridors_meta.json").write_text(json.dumps(meta, indent=2))
    (WEB / "cmp_corridors_meta.json").write_text(json.dumps(meta, indent=2))

    for base in (PROCESSED, WEB):
        mp = base / "manifest.json"
        if not mp.exists():
            continue
        manifest = json.loads(mp.read_text())
        layers = manifest.setdefault("layers", {})
        layers["cmp_corridors"] = {
            "status": meta["status"],
            "feature_count": len(fc["features"]),
            "file": "cmp_corridors.geojson",
            "derived_from": "cmp_mobility_insights+nominatim",
            "notes": meta["note"],
        }
        sources = manifest.setdefault("sources", {})
        sources["cmp_corridors_geocoded"] = {
            "id": "cmp_corridors_geocoded",
            "name": "CMP corridors (geocoded)",
            "publisher": "CMDA CMP text + OSM Nominatim",
            "url": "https://data.opencity.in/",
            "kind": "derived",
            "status": meta["status"],
            "notes": meta["note"],
        }
        mp.write_text(json.dumps(manifest, indent=2, allow_nan=False))

    print(f"cmp_corridors: {meta['status']} features={len(fc['features'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
