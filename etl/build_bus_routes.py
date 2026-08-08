#!/usr/bin/env python3
"""
Build MTC bus route lines from the unified Chennai GTFS.

The feed's shapes.txt only has a few CMRL polylines and trips have no shape_id,
so geometries are stop-to-stop straight lines from each route's best trip sequence.
Status = partial (not road-matched; not official MTC shapes).
"""

from __future__ import annotations

import csv
import io
import json
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
WEB = ROOT / "apps" / "web" / "public" / "data"
GTFS_ZIP = RAW / "chennai-unified-gtfs.zip"


def _read_csv(zf: zipfile.ZipFile, name: str) -> list[dict[str, str]]:
    with zf.open(name) as f:
        return list(csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig")))


def _round_coord(lon: float, lat: float) -> list[float]:
    return [round(lon, 5), round(lat, 5)]


def build(zip_path: Path = GTFS_ZIP) -> tuple[dict[str, Any], dict[str, Any]]:
    if not zip_path.exists():
        raise FileNotFoundError(f"GTFS zip not found: {zip_path}")

    with zipfile.ZipFile(zip_path) as zf:
        routes_raw = _read_csv(zf, "routes.txt")
        trips_raw = _read_csv(zf, "trips.txt")
        stops_raw = _read_csv(zf, "stops.txt")

        # Bus only (route_type 3). Metro rows in this feed sometimes misuse route_type.
        routes: dict[str, dict[str, str]] = {
            r["route_id"]: r for r in routes_raw if str(r.get("route_type", "")).strip() == "3"
        }

        stops: dict[str, list[float]] = {}
        for s in stops_raw:
            try:
                lat = float(s["stop_lat"])
                lon = float(s["stop_lon"])
            except (KeyError, TypeError, ValueError):
                continue
            if not (12.0 <= lat <= 14.0 and 79.5 <= lon <= 81.0):
                continue
            stops[s["stop_id"]] = _round_coord(lon, lat)

        # route_id + direction → candidate trip_ids
        candidates: dict[tuple[str, str], list[str]] = defaultdict(list)
        for t in trips_raw:
            rid = t.get("route_id") or ""
            if rid not in routes:
                continue
            did = str(t.get("direction_id") or "0")
            candidates[(rid, did)].append(t["trip_id"])

        trip_to_key = {
            tid: key for key, tids in candidates.items() for tid in tids
        }
        needed = set(trip_to_key)

        # Stream stop_times once
        sequences: dict[str, list[tuple[int, str]]] = defaultdict(list)
        with zf.open("stop_times.txt") as f:
            reader = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"))
            for row in reader:
                tid = row.get("trip_id")
                if tid not in needed:
                    continue
                try:
                    seq = int(row["stop_sequence"])
                except (KeyError, TypeError, ValueError):
                    continue
                sid = row.get("stop_id")
                if not sid:
                    continue
                sequences[tid].append((seq, sid))

    # Best trip per route+direction = longest valid stop sequence
    best: dict[tuple[str, str], tuple[int, str, list[list[float]]]] = {}
    for tid, seq in sequences.items():
        key = trip_to_key.get(tid)
        if key is None:
            continue
        seq_sorted = sorted(seq, key=lambda x: x[0])
        coords: list[list[float]] = []
        for _, sid in seq_sorted:
            pt = stops.get(sid)
            if not pt:
                continue
            if not coords or coords[-1] != pt:
                coords.append(pt)
        n = len(coords)
        if n < 2:
            continue
        prev = best.get(key)
        if prev is None or n > prev[0]:
            best[key] = (n, tid, coords)

    features: list[dict[str, Any]] = []
    for (rid, did), (n, tid, coords) in sorted(best.items(), key=lambda x: x[0][0]):
        r = routes[rid]
        short = (r.get("route_short_name") or "").strip() or rid
        long_name = (r.get("route_long_name") or "").strip()
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "route_id": rid,
                    "route_short_name": short,
                    "route_long_name": long_name,
                    "direction_id": did,
                    "trip_id": tid,
                    "stop_count": n,
                    "agency_id": r.get("agency_id"),
                    "mode": "bus",
                    "geometry_note": "stop-to-stop straight lines — GTFS has no bus shapes",
                },
                "geometry": {"type": "LineString", "coordinates": coords},
            }
        )

    fc: dict[str, Any] = {"type": "FeatureCollection", "features": features}
    note = (
        "MTC bus routes from unofficial Chennai GTFS (UngalSoththu). "
        "One LineString per route_id × direction from the trip with the most mapped stops. "
        "Straight stop-to-stop chords — not road-matched. shapes.txt has no usable bus geometry."
    )
    meta: dict[str, Any] = {
        "status": "partial",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "note": note,
        "counts": {
            "features": len(features),
            "bus_routes_in_gtfs": len(routes),
            "route_direction_pairs": len(candidates),
        },
        "source": "chennai_gtfs_unified",
        "limitation": "Crow-flies between consecutive stops; not official MTC path geometry.",
    }
    return fc, meta


def _bbox(features: list[dict[str, Any]]) -> list[float] | None:
    xs: list[float] = []
    ys: list[float] = []
    for f in features:
        for lon, lat in (f.get("geometry") or {}).get("coordinates") or []:
            xs.append(float(lon))
            ys.append(float(lat))
    if not xs:
        return None
    return [min(xs), min(ys), max(xs), max(ys)]


def main() -> int:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    WEB.mkdir(parents=True, exist_ok=True)

    fc, meta = build()
    out = PROCESSED / "bus_routes.geojson"
    payload = json.dumps(fc, separators=(",", ":"), ensure_ascii=False)
    out.write_text(payload)
    (WEB / "bus_routes.geojson").write_text(payload)
    (PROCESSED / "bus_routes_meta.json").write_text(json.dumps(meta, indent=2))
    (WEB / "bus_routes_meta.json").write_text(json.dumps(meta, indent=2))

    layer_entry = {
        "status": meta["status"],
        "feature_count": len(fc["features"]),
        "bbox": _bbox(fc["features"]),
        "file": "bus_routes.geojson",
        "derived_from": "chennai_gtfs_unified",
        "notes": meta["note"],
        "limitation": meta["limitation"],
    }

    for base in (PROCESSED, WEB):
        mp = base / "manifest.json"
        if not mp.exists():
            continue
        manifest = json.loads(mp.read_text())
        layers = manifest.setdefault("layers", {})
        layers["bus_routes"] = layer_entry
        # Keep GTFS source note honest about shapes
        sources = manifest.setdefault("sources", {})
        if "chennai_gtfs_unified" in sources:
            sources["chennai_gtfs_unified"]["notes"] = (
                "Unofficial community GTFS. Bus route lines are stop-to-stop "
                "(no usable shapes.txt for MTC); no suburban rail; no GTFS-RT."
            )
        mp.write_text(json.dumps(manifest, indent=2, allow_nan=False))

    print(
        f"bus_routes: {meta['status']} features={len(fc['features'])} "
        f"bytes={out.stat().st_size}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
