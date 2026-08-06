#!/usr/bin/env python3
"""
Ingest manually downloaded datasets from data/downloaded/.

Produces:
  - economic_census_wards.json (+ ward join fields for analyses)
  - railway_stations.geojson
  - pincodes_chennai.geojson (clipped)
  - cmp_mobility_insights.json (from CMP PDF text)
Updates manifest layers/sources and analyses.json.
"""

from __future__ import annotations

import json
import re
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd
from shapely.geometry import box

ROOT = Path(__file__).resolve().parents[1]
DL = ROOT / "data" / "downloaded"
PROCESSED = ROOT / "data" / "processed"
WEB = ROOT / "apps" / "web" / "public" / "data"
RAW = ROOT / "data" / "raw" / "downloads"

CHENNAI_BBOX = (79.95, 12.70, 80.40, 13.30)  # lon/lat


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _copy_web(name: str) -> None:
    src = PROCESSED / name
    if src.exists():
        WEB.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, WEB / name)


def ingest_economic_census() -> dict[str, Any]:
    csv_path = DL / "9acdf52e-9d99-480c-bacd-a06892ada652.csv"
    code_path = DL / "d7dc8f23-ea09-4f0d-9358-8b46ee1d4a1a.csv"
    if not csv_path.exists():
        return {"status": "unavailable", "reason": "Economic census CSV missing in data/downloaded/"}

    RAW.mkdir(parents=True, exist_ok=True)
    shutil.copy2(csv_path, RAW / "economic_census.csv")
    if code_path.exists():
        shutil.copy2(code_path, RAW / "economic_census_codebook.csv")

    # Chunked aggregate — file is ~21MB / 333k rows
    usecols = ["State", "District", "WC", "TOTAL_WORKER", "BACT", "SECTOR"]
    chunks = []
    for chunk in pd.read_csv(
        csv_path,
        encoding="utf-8-sig",
        usecols=lambda c: c.replace("\ufeff", "") in usecols or c in usecols,
        dtype=str,
        low_memory=False,
        chunksize=80_000,
    ):
        chunk.columns = [c.replace("\ufeff", "") for c in chunk.columns]
        chunk = chunk[(chunk["State"] == "33") & (chunk["District"].isin(["2", "02", "002"]))]
        if chunk.empty:
            continue
        chunk["WC"] = chunk["WC"].astype(str).str.strip().str.lstrip("0")
        chunk.loc[chunk["WC"] == "", "WC"] = "0"
        chunk["TOTAL_WORKER"] = pd.to_numeric(chunk["TOTAL_WORKER"], errors="coerce").fillna(0)
        chunks.append(chunk)

    if not chunks:
        return {"status": "unavailable", "reason": "No TN district-2 rows in economic census CSV"}

    df = pd.concat(chunks, ignore_index=True)
    g = (
        df.groupby("WC", as_index=False)
        .agg(
            establishments=("WC", "size"),
            total_workers=("TOTAL_WORKER", "sum"),
        )
        .sort_values("establishments", ascending=False)
    )
    g["ward_label"] = g["WC"]
    g["workers_per_est"] = (g["total_workers"] / g["establishments"]).round(2)

    # Join PT gap if reports exist
    reports_path = PROCESSED / "reports.json"
    gap_by: dict[str, Any] = {}
    if reports_path.exists():
        for w in json.loads(reports_path.read_text()).get("wards") or []:
            gap_by[str(w.get("label"))] = w

    rows = []
    for r in g.to_dict(orient="records"):
        label = str(r["ward_label"])
        gap = gap_by.get(label) or {}
        pt = None
        if gap.get("gap_index") is not None:
            pt = round(max(0.0, min(100.0, 100.0 - float(gap["gap_index"]))), 1)
        rows.append(
            {
                "ward_label": label,
                "establishments": int(r["establishments"]),
                "total_workers": int(r["total_workers"]),
                "workers_per_est": float(r["workers_per_est"]),
                "pt_index": pt,
                "gap_index": gap.get("gap_index"),
                "stop_count": gap.get("stop_count"),
            }
        )

    joined = [x for x in rows if x["pt_index"] is not None]
    # High activity + low PT
    pressure = sorted(
        [x for x in joined if (x["pt_index"] or 100) < 45],
        key=lambda x: (-x["establishments"], x["pt_index"] or 0),
    )[:20]

    # Activity bands for chart
    if joined:
        est = [x["establishments"] for x in joined]
        q33, q66 = pd.Series(est).quantile([0.33, 0.66]).tolist()
    else:
        q33, q66 = 0, 0

    def band(n: int) -> str:
        if n <= q33:
            return "lower_activity"
        if n <= q66:
            return "middle_activity"
        return "higher_activity"

    cross: dict[str, list[float]] = {
        "lower_activity": [],
        "middle_activity": [],
        "higher_activity": [],
    }
    for x in joined:
        cross[band(x["establishments"])].append(float(x["pt_index"]))

    chart = []
    for b, vals in cross.items():
        if not vals:
            continue
        chart.append(
            {
                "band": b,
                "ward_count": len(vals),
                "mean_pt_index": round(sum(vals) / len(vals), 1),
                "pct_low_pt": round(100 * sum(1 for v in vals if v < 40) / len(vals), 1),
            }
        )

    out = {
        "status": "loaded",
        "generated_at": _now(),
        "source_file": csv_path.name,
        "note": (
            "Economic Census microdata aggregated by WC (ward code) for TN State=33 District=2. "
            "Proxy for economic activity — not household income. Join to GCC ward_label is best-effort."
        ),
        "counts": {
            "rows_raw": int(len(df)),
            "wards_aggregated": len(rows),
            "wards_joined_pt": len(joined),
            "total_establishments": int(g["establishments"].sum()),
            "total_workers": int(g["total_workers"].sum()),
        },
        "chart": chart,
        "top_activity_wards": sorted(joined, key=lambda x: -x["establishments"])[:15],
        "high_activity_low_pt": pressure,
        "wards": rows,
    }
    (PROCESSED / "economic_census_wards.json").write_text(json.dumps(out, indent=2))
    _copy_web("economic_census_wards.json")
    return out


def ingest_railway() -> dict[str, Any]:
    src = DL / "chennai-railway.geojson"
    if not src.exists():
        return {"status": "unavailable", "reason": "chennai-railway.geojson missing"}
    gdf = gpd.read_file(src)
    # Prefer points; convert polygon stations to centroids for map dots
    pts = gdf.copy()
    pts["geometry"] = pts.geometry.centroid
    pts = pts[pts.geometry.notna()].to_crs(4326)
    pts["label"] = pts.apply(
        lambda r: str(r.get("name") or r.get("name:en") or r.get("ref") or "Station"),
        axis=1,
    )
    pts["hub_type"] = pts.apply(
        lambda r: "construction"
        if str(r.get("construction:railway") or "")
        else str(r.get("railway") or "station"),
        axis=1,
    )
    keep = ["label", "hub_type", "railway", "network", "operator", "ref", "construction:railway", "geometry"]
    keep = [c for c in keep if c in pts.columns or c == "geometry"]
    out_gdf = pts[[c for c in keep if c in pts.columns]]
    path = PROCESSED / "railway_stations.geojson"
    out_gdf.to_file(path, driver="GeoJSON")
    _copy_web("railway_stations.geojson")
    return {
        "status": "loaded",
        "feature_count": len(out_gdf),
        "file": "railway_stations.geojson",
        "note": "OSM railway stations from manual download — existing inventory enrichment.",
    }


def ingest_pincodes() -> dict[str, Any]:
    kmz = DL / "dd7bfd69-143e-462b-bfa3-2ac35d931342.kmz"
    if not kmz.exists():
        return {"status": "unavailable", "reason": "pin-code KMZ missing"}

    RAW.mkdir(parents=True, exist_ok=True)
    kml_path = RAW / "india_pin_codes_2025.kml"
    with zipfile.ZipFile(kmz) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".kml"))
        kml_path.write_bytes(z.read(name))

    # Fiona/KML can be heavy; read and clip
    try:
        gdf = gpd.read_file(kml_path)
    except Exception as exc:  # noqa: BLE001
        return {"status": "unavailable", "reason": f"Failed to read pin KML: {exc}"}

    if gdf.crs is None:
        gdf = gdf.set_crs(4326)
    else:
        gdf = gdf.to_crs(4326)

    # Prefer Chennai pincodes 600xxx; also bbox clip
    pin_col = next((c for c in gdf.columns if "pin" in c.lower()), None)
    if pin_col:
        mask = gdf[pin_col].astype(str).str.startswith("600")
        chen = gdf[mask].copy()
    else:
        chen = gdf.iloc[0:0].copy()

    if chen.empty:
        minx, miny, maxx, maxy = CHENNAI_BBOX
        chen = gdf[gdf.intersects(box(minx, miny, maxx, maxy))].copy()

    if chen.empty:
        return {"status": "unavailable", "reason": "No Chennai pin polygons after filter"}

    # Simplify for web
    chen["geometry"] = chen.geometry.simplify(0.0003, preserve_topology=True)
    path = PROCESSED / "pincodes_chennai.geojson"
    chen.to_file(path, driver="GeoJSON")
    _copy_web("pincodes_chennai.geojson")
    return {
        "status": "loaded",
        "feature_count": len(chen),
        "file": "pincodes_chennai.geojson",
        "note": "India pin-code KMZ clipped to Chennai 600xxx / CMA bbox.",
    }


def ingest_cmp_pdf() -> dict[str, Any]:
    pdf = DL / "b9c062d5-bebd-4f25-81dc-df68a2070230.pdf"
    if not pdf.exists():
        return {"status": "unavailable", "reason": "CMP PDF missing"}

    try:
        from pypdf import PdfReader
    except ImportError:
        return {"status": "unavailable", "reason": "pypdf not installed"}

    reader = PdfReader(str(pdf))
    # Executive summary is early pages; scan a useful window
    pages_text: list[str] = []
    for i in range(min(35, len(reader.pages))):
        pages_text.append(reader.pages[i].extract_text() or "")
    blob = "\n".join(pages_text)
    blob_one = re.sub(r"[ \t]+", " ", blob)

    corridors = []
    for pat, label in (
        (r"IT Corridor", "IT Corridor / OMR"),
        (r"Anna Salai", "Anna Salai"),
        (r"Periyar EVR Salai", "Periyar EVR Salai"),
        (r"GST\b|Grand Southern Trunk", "GST Road"),
        (r"GNT\b|Grand Northern Trunk", "GNT Road"),
        (r"Inner Ring Road|\bIRR\b", "Inner Ring Road"),
        (r"Outer Ring Road|\bORR\b", "Outer Ring Road"),
        (r"NH\s*32", "NH32"),
        (r"NH\s*16", "NH16"),
        (r"NH\s*48", "NH48"),
        (r"NH\s*716", "NH716"),
        (r"T\.?\s*Nagar", "T.Nagar"),
        (r"Purasawalkam|Purasawakkam", "Purasawalkam"),
        (r"George Town", "George Town"),
        (r"Nungambakkam", "Nungambakkam"),
        (r"Thiruvottiyur", "Thiruvottiyur–Ponneri corridor"),
    ):
        if re.search(pat, blob_one, re.I):
            corridors.append(label)

    # de-dupe preserve order
    seen: set[str] = set()
    corridor_list = []
    for c in corridors:
        if c not in seen:
            seen.add(c)
            corridor_list.append(c)

    insights = [
        {
            "theme": "Congestion drivers",
            "detail": (
                "CMP notes rapid motorisation with rising congestion and pollution across CMA; "
                "growth pressure along southern/northern radial corridors and the IT Corridor."
            ),
        },
        {
            "theme": "NMT gap",
            "detail": (
                "Primary survey finding cited: ~95% of surveyed roads lack adequate footpath "
                "infrastructure — CMP flags NMT around PT facilities as a priority."
            ),
        },
        {
            "theme": "Public transport spine",
            "detail": (
                "CMP frames CMA PT as MTC buses + suburban rail + MRTS (and metro expansion), "
                "with intermodal integration and NMT as complementary measures."
            ),
        },
        {
            "theme": "PT in the do-something case",
            "detail": (
                "Modelled BAU 'Do Something' case is described as reducing congestion levels "
                "substantially versus Do-Nothing — PT / TDM packages are part of the response."
            ),
        },
    ]

    pt_measures = []
    for pat, label in (
        (r"\bBRT\b|Bus Rapid Transit", "BRT corridors"),
        (r"\bMetro\b|CMRL", "Metro expansion / CMRL"),
        (r"\bMRTS\b", "MRTS"),
        (r"\bNMT\b|Non[- ]Motorized", "NMT / footpaths around PT"),
        (r"\bIPT\b|Intermediate Public Transport", "IPT integration"),
        (r"UMTA|Unified Metropolitan Transport", "UMTA institutional reform"),
        (r"feeder", "Feeder services"),
    ):
        if re.search(pat, blob_one, re.I):
            pt_measures.append(label)

    out = {
        "status": "loaded",
        "generated_at": _now(),
        "document": {
            "title": "Comprehensive Mobility Plan for Chennai Metropolitan Area — Final Report / Executive Summary",
            "file": pdf.name,
            "pages": len(reader.pages),
            "date_hint": "15.10.2019",
        },
        "note": (
            "Insights extracted from CMP PDF text (executive-summary window). "
            "Not a geocoded congestion hotspot inventory — corridor names are document mentions."
        ),
        "corridors_mentioned": corridor_list,
        "pt_measures_mentioned": list(dict.fromkeys(pt_measures)),
        "insights": insights,
        "chart": [
            {"label": c, "count": 1} for c in corridor_list[:12]
        ],
    }
    (PROCESSED / "cmp_mobility_insights.json").write_text(json.dumps(out, indent=2))
    _copy_web("cmp_mobility_insights.json")
    return out


def update_manifest(rail: dict, pins: dict, ec: dict, cmp: dict) -> None:
    path = PROCESSED / "manifest.json"
    if not path.exists():
        return
    manifest = json.loads(path.read_text())
    layers = manifest.setdefault("layers", {})
    sources = manifest.setdefault("sources", {})

    def upsert_source(sid: str, name: str, status: str, notes: str, url: str = "") -> None:
        sources[sid] = {
            "id": sid,
            "name": name,
            "publisher": "Manual download (data/downloaded)",
            "url": url or f"file://data/downloaded/",
            "portal": url or "",
            "license": "See original publisher",
            "kind": "manual_download",
            "notes": notes,
            "status": status,
            "fetched_at": _now(),
        }

    if rail.get("status") == "loaded":
        layers["railway_stations"] = {
            "status": "loaded",
            "feature_count": rail.get("feature_count"),
            "file": "railway_stations.geojson",
            "notes": rail.get("note"),
            "attributes": ["label", "hub_type", "railway", "network", "operator", "ref"],
        }
        upsert_source(
            "manual_chennai_railway",
            "Chennai railway stations (OSM GeoJSON)",
            "loaded",
            rail.get("note") or "",
        )

    if pins.get("status") == "loaded":
        layers["pincodes_chennai"] = {
            "status": "loaded",
            "feature_count": pins.get("feature_count"),
            "file": "pincodes_chennai.geojson",
            "notes": pins.get("note"),
        }
        upsert_source(
            "manual_pincodes_2025",
            "India pin codes 2025 (Chennai clip)",
            "loaded",
            pins.get("note") or "",
        )

    if ec.get("status") == "loaded":
        layers["economic_census_wards"] = {
            "status": "loaded",
            "feature_count": (ec.get("counts") or {}).get("wards_aggregated"),
            "file": "economic_census_wards.json",
            "notes": ec.get("note"),
        }
        upsert_source(
            "manual_economic_census",
            "Economic census microdata (ward aggregate)",
            "loaded",
            ec.get("note") or "",
        )

    if cmp.get("status") == "loaded":
        layers["cmp_mobility_insights"] = {
            "status": "loaded",
            "file": "cmp_mobility_insights.json",
            "notes": cmp.get("note"),
        }
        upsert_source(
            "manual_cmp_2019",
            "Chennai CMP Final Report / Exec Summary (PDF)",
            "loaded",
            cmp.get("note") or "",
        )

    # Drop satellite-style jam sources from primary noise? keep but mark category
    for sid, src in list(sources.items()):
        if isinstance(src, dict) and (src.get("category") == "Satellite data" or "gee" in str(src.get("url") or "").lower() or "bhuvan" in str(src.get("url") or "").lower()):
            src["ui_group"] = "not_used_satellite"

    path.write_text(json.dumps(manifest, indent=2))
    _copy_web("manifest.json")


def update_analyses(ec: dict, cmp: dict, rail: dict, pins: dict) -> None:
    path = PROCESSED / "analyses.json"
    analyses = json.loads(path.read_text()) if path.exists() else {}
    analyses["economic_census"] = {
        "status": ec.get("status"),
        "counts": ec.get("counts"),
        "chart": ec.get("chart"),
        "high_activity_low_pt": ec.get("high_activity_low_pt"),
        "top_activity_wards": ec.get("top_activity_wards"),
        "note": ec.get("note"),
        "file": "economic_census_wards.json",
    }
    analyses["cmp_mobility"] = {
        "status": cmp.get("status"),
        "document": cmp.get("document"),
        "corridors_mentioned": cmp.get("corridors_mentioned"),
        "pt_measures_mentioned": cmp.get("pt_measures_mentioned"),
        "insights": cmp.get("insights"),
        "chart": cmp.get("chart"),
        "note": cmp.get("note"),
        "file": "cmp_mobility_insights.json",
    }
    analyses["railway_stations"] = rail
    analyses["pincodes_chennai"] = pins
    path.write_text(json.dumps(analyses, indent=2))
    _copy_web("analyses.json")


def main() -> int:
    print("[…] economic census")
    ec = ingest_economic_census()
    print(f"  → {ec.get('status')} wards={((ec.get('counts') or {}).get('wards_aggregated'))}")

    print("[…] railway stations")
    rail = ingest_railway()
    print(f"  → {rail.get('status')} n={rail.get('feature_count')}")

    print("[…] pin codes (Chennai clip)")
    pins = ingest_pincodes()
    print(f"  → {pins.get('status')} n={pins.get('feature_count')}")

    print("[…] CMP PDF insights")
    cmp = ingest_cmp_pdf()
    print(f"  → {cmp.get('status')} corridors={len(cmp.get('corridors_mentioned') or [])}")

    update_manifest(rail, pins, ec, cmp)
    update_analyses(ec, cmp, rail, pins)
    print("[ok] downloads ingested")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
