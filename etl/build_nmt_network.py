#!/usr/bin/env python3
"""
OSM NMT network (footways / cycleways / paths) for Chennai — Partial coverage.

Uses Overpass API. Output is incomplete by nature of OSM; status=partial.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
WEB = ROOT / "apps" / "web" / "public" / "data"

# Greater Chennai approx bbox (south, west, north, east)
BBOX = (12.75, 79.95, 13.25, 80.35)

OVERPASS = "https://overpass-api.de/api/interpreter"

QUERY = f"""
[out:json][timeout:180];
(
  way["highway"="footway"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  way["highway"="cycleway"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  way["highway"="path"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  way["highway"="pedestrian"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
);
out geom;
"""


def _way_to_feature(el: dict[str, Any]) -> dict[str, Any] | None:
    geom = el.get("geometry") or []
    if len(geom) < 2:
        return None
    coords = [[p["lon"], p["lat"]] for p in geom]
    tags = el.get("tags") or {}
    return {
        "type": "Feature",
        "properties": {
            "osm_id": el.get("id"),
            "highway": tags.get("highway"),
            "name": tags.get("name"),
            "source": "osm_overpass",
        },
        "geometry": {"type": "LineString", "coordinates": coords},
    }


def build() -> tuple[dict[str, Any], dict[str, Any]]:
    print("  Overpass NMT query…")
    try:
        resp = requests.post(
            OVERPASS,
            data={"data": QUERY},
            timeout=200,
            headers={"User-Agent": "OpenCity-TransitLab/1.0"},
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:  # noqa: BLE001
        empty = {
            "type": "FeatureCollection",
            "features": [],
            "properties": {"error": str(exc)},
        }
        meta = {
            "status": "unavailable",
            "note": f"Overpass NMT fetch failed: {exc}",
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        return empty, meta

    features: list[dict[str, Any]] = []
    for el in data.get("elements") or []:
        if el.get("type") != "way":
            continue
        feat = _way_to_feature(el)
        if feat:
            features.append(feat)

    # Cap very large responses for web map performance
    max_feat = 8000
    truncated = len(features) > max_feat
    if truncated:
        features = features[:max_feat]

    fc = {
        "type": "FeatureCollection",
        "features": features,
    }
    meta = {
        "status": "partial" if features else "unavailable",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "note": (
            "OSM footway/cycleway/path/pedestrian ways in Greater Chennai bbox. "
            "Coverage is incomplete and unofficial. "
            + ("Truncated for map performance. " if truncated else "")
        ),
        "counts": {
            "features": len(features),
            "truncated": truncated,
            "by_highway": {},
        },
        "bbox": list(BBOX),
        "source": "https://www.openstreetmap.org/copyright",
    }
    by_h: dict[str, int] = {}
    for f in features:
        h = str((f.get("properties") or {}).get("highway") or "other")
        by_h[h] = by_h.get(h, 0) + 1
    meta["counts"]["by_highway"] = by_h
    return fc, meta


def main() -> int:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    WEB.mkdir(parents=True, exist_ok=True)
    fc, meta = build()
    out = PROCESSED / "nmt_network.geojson"
    out.write_text(json.dumps(fc))
    (WEB / "nmt_network.geojson").write_text(out.read_text())
    (PROCESSED / "nmt_network_meta.json").write_text(json.dumps(meta, indent=2))
    (WEB / "nmt_network_meta.json").write_text(json.dumps(meta, indent=2))

    for base in (PROCESSED, WEB):
        mp = base / "manifest.json"
        if not mp.exists():
            continue
        manifest = json.loads(mp.read_text())
        layers = manifest.setdefault("layers", {})
        layers["nmt_network"] = {
            "status": meta["status"],
            "feature_count": len(fc["features"]),
            "file": "nmt_network.geojson",
            "derived_from": "osm_overpass",
            "notes": meta["note"],
        }
        sources = manifest.setdefault("sources", {})
        sources["osm_nmt"] = {
            "id": "osm_nmt",
            "name": "OSM NMT network (footway/cycleway)",
            "publisher": "OpenStreetMap contributors",
            "url": "https://www.openstreetmap.org/copyright",
            "kind": "overpass",
            "status": meta["status"],
            "notes": meta["note"],
        }
        mp.write_text(json.dumps(manifest, indent=2, allow_nan=False))

    print(f"nmt_network: {meta['status']} features={len(fc['features'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
