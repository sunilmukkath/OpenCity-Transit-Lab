#!/usr/bin/env python3
"""Parse Datajam Excel Sheet 2 → data/catalog/jam_datasets.json."""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
XLSX = ROOT / "2026 Aug- Datasets and Problem Statements Chennai Public Transport.xlsx"
OUT = ROOT / "data" / "catalog" / "jam_datasets.json"

OPENCITY_LAYER = {
    "gcc-ward-information": {"maps_to": ["wards", "zones"]},
    "chennai-election-boundaries": {
        "maps_to": ["sir_chennai_ac_electors"],
        "note": "AC boundaries already used for SIR electors",
    },
    "chennai-mrts-data": {"maps_to": ["mrts_stations", "mrts_lines"]},
    "chennai-bus-shelters": {"maps_to": ["shelters"]},
    "chennai-slums": {"maps_to": ["slums"]},
    "chennai-census-2011-data": {"maps_to": ["wards"], "note": "HH-14 / SEC proxy on wards"},
    "chennai-schools": {
        "layer": "schools",
        "ingest": True,
        "prefer_formats": ["KML", "GeoJSON", "GEOJSON"],
    },
    "chennai-healthcare-uphcs-and-uchcs": {
        "layer": "healthcare",
        "ingest": True,
        "prefer_formats": ["KML", "GeoJSON", "GEOJSON"],
    },
    "chennai-parks": {
        "layer": "parks",
        "ingest": True,
        "prefer_formats": ["KML", "GeoJSON", "GEOJSON"],
    },
    "chennai-public-toilets": {
        "layer": "public_toilets",
        "ingest": True,
        "prefer_formats": ["KML", "GeoJSON", "GEOJSON", "CSV"],
    },
    "chennai-anganwadis-icds-centres": {
        "layer": "anganwadis",
        "ingest": True,
        "prefer_formats": ["KML", "GeoJSON", "GEOJSON"],
    },
    "chennai-bus-stop-audit-data": {
        "layer": "bus_stop_audit",
        "ingest": True,
        "prefer_formats": ["CSV", "KML", "GeoJSON"],
    },
    "chennai-mtc-performance-data": {
        "ingest": "tabular",
        "prefer_formats": ["CSV", "XLSX"],
    },
    "chennai-metro-monthly-usage-data": {
        "ingest": "tabular",
        "prefer_formats": ["CSV", "XLSX"],
    },
    "india-pincode-maps-2025": {"suggested": "unavailable"},
    "chennai-master-plan-2026": {"suggested": "unavailable"},
    "chennai-comprehensive-mobility-plan": {"suggested": "unavailable"},
    "chennai-economic-census": {"suggested": "unavailable"},
}

LINK_HOSTS = (
    "alsanthosh.github.io",
    "shift-transport.org",
    "transit-affinity.urbanuru.in",
    "ithuungalsoththu.vercel.app",
    "commuteimpact.com",
    "datsvarun.github.io",
    "chennai-transit-data.vercel.app",
    "chennaimetrorail.org",
)
UNAVAILABLE_PATTERNS = (
    "drive.google.com",
    "earth-engine",
    "gee-community",
    "zenodo.org",
    "global-surface-water",
    "globalforestwatch",
    "bhuvan",
    "vedas.sac",
    "data.gov.in",
    "tngis.tn.gov.in",
    "doi.org",
)


def slugify(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", s.strip().lower()).strip("_")
    return s[:80] or "dataset"


def opencity_slug(url: str) -> str | None:
    m = re.search(r"data\.opencity\.in/dataset/([a-z0-9\-]+)", url)
    return m.group(1) if m else None


def build_catalog() -> dict:
    if not XLSX.exists():
        raise FileNotFoundError(f"Missing workbook: {XLSX}")
    df = pd.read_excel(XLSX, sheet_name="Datasets", header=None)
    cat = None
    rows = []
    seen: dict[str, int] = {}
    for i, r in df.iterrows():
        if i == 0:
            continue
        if pd.notna(r[0]) and str(r[0]).strip():
            cat = str(r[0]).strip()
        url = str(r[1]).strip() if pd.notna(r[1]) else ""
        desc = str(r[2]).strip() if pd.notna(r[2]) else ""
        if not url or url == "nan":
            continue
        oc = opencity_slug(url)
        base = oc or slugify(desc or url.split("/")[-1] or f"row_{i}")
        n = seen.get(base, 0)
        seen[base] = n + 1
        sid = base if n == 0 else f"{base}_{n + 1}"

        suggested = "unavailable"
        kind = "catalog"
        layer = None
        ingest: bool | str = False
        maps_to: list[str] = []
        prefer: list[str] = []
        notes = desc

        if oc and oc in OPENCITY_LAYER:
            meta = OPENCITY_LAYER[oc]
            layer = meta.get("layer")
            ingest = meta.get("ingest", False) or False
            maps_to = list(meta.get("maps_to") or [])
            prefer = list(meta.get("prefer_formats") or [])
            if meta.get("note"):
                notes = f"{desc} — {meta['note']}".strip(" —") if desc else meta["note"]
            if meta.get("suggested"):
                suggested = meta["suggested"]
            elif ingest is True:
                suggested = "to_ingest"
            elif ingest == "tabular":
                suggested = "to_ingest_tabular"
            elif maps_to:
                suggested = "loaded_via_existing"
            else:
                suggested = "unavailable"
            kind = "opencity"
        elif any(h in url for h in LINK_HOSTS):
            suggested = "link"
            kind = "dashboard" if cat and "ashboard" in cat else "external"
        elif "github.com" in url and "ChennaiGTFS" in url:
            suggested = "loaded_via_existing"
            maps_to = ["stops", "hubs"]
            kind = "gtfs"
        elif any(p in url for p in UNAVAILABLE_PATTERNS):
            suggested = "unavailable"
            kind = "external"
            extra = ""
            if "drive.google.com" in url:
                extra = "Drive folder has no machine-downloadable public file URL."
            elif "tngis" in url:
                extra = "WFS connector not wired."
            elif any(
                x in url
                for x in (
                    "earth-engine",
                    "gee-community",
                    "bhuvan",
                    "zenodo",
                    "globalforestwatch",
                    "global-surface-water",
                    "vedas",
                    "data.gov.in",
                    "doi.org",
                )
            ):
                extra = "Satellite/raster; not ingested as local map layer."
            if extra:
                notes = f"{desc} — {extra}".strip(" —") if desc else extra
        else:
            suggested = "link"
            kind = "external"

        rows.append(
            {
                "id": f"jam_{sid}",
                "category": cat or "Uncategorized",
                "name": desc or sid.replace("_", " ").title(),
                "description": desc,
                "url": url,
                "portal": url,
                "opencity_slug": oc,
                "kind": kind,
                "suggested_status": suggested,
                "layer_key": layer,
                "ingest": ingest,
                "maps_to_layers": maps_to,
                "prefer_formats": prefer,
                "publisher": "OpenCity Datajam Aug 2026 catalog",
                "notes": notes,
            }
        )

    return {
        "generated_from": XLSX.name,
        "sheet": "Datasets",
        "count": len(rows),
        "datasets": rows,
    }


def main() -> None:
    catalog = build_catalog()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(catalog, indent=2) + "\n")
    print(f"[ok] {OUT} ({catalog['count']} datasets)")
    print(Counter(r["suggested_status"] for r in catalog["datasets"]))


if __name__ == "__main__":
    main()
