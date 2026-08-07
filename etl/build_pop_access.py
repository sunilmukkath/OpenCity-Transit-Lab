#!/usr/bin/env python3
"""
Population-weighted access (Partial).

Joins OpenCity / Census 2011 ward population (155 historic wards) to GCC 2022
wards by ward number where labels match. Estimates people within 400m of transit
as: ward_population × pct_area_within_400m (geometry catchment share).

This is NOT a dasymetric population surface. Status stays Partial when join
rate < 200/200. Never invent population for unmatched wards.
"""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed"
RAW_CENSUS = ROOT / "data" / "raw" / "census_sec" / "census_ward_2011.csv"
WEB = ROOT / "apps" / "web" / "public" / "data"

OPENCITY_URL = (
    "https://data.opencity.in/dataset/chennai-census-2011-data"
)


def _load_census_pop(path: Path) -> dict[str, int]:
    """Ward number → total population (summed across EBs if present)."""
    by_ward: dict[str, int] = {}
    if not path.exists():
        return by_ward
    with path.open(newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        # Flexible column names
        fields = {h.lower().strip(): h for h in (reader.fieldnames or [])}
        ward_key = None
        pop_key = None
        for cand in ("ward number", "ward_number", "ward", "ward no", "ward_no"):
            if cand in fields:
                ward_key = fields[cand]
                break
        for cand in ("total population", "total_population", "population", "tot_p"):
            if cand in fields:
                pop_key = fields[cand]
                break
        if not ward_key or not pop_key:
            # try first numeric-looking columns
            print(f"  census columns: {list(fields.keys())}")
            return by_ward
        for row in reader:
            w = str(row.get(ward_key, "")).strip()
            if not w or w.lower() in ("nan", "none", ""):
                continue
            # normalize "001" → "1"
            try:
                w = str(int(float(w)))
            except ValueError:
                pass
            try:
                pop = int(float(str(row.get(pop_key, "0")).replace(",", "") or 0))
            except ValueError:
                continue
            by_ward[w] = by_ward.get(w, 0) + pop
    return by_ward


def _ward_label(props: dict[str, Any]) -> str:
    return str(props.get("ward_label") or props.get("label") or props.get("WARD_NO") or "")


def build() -> dict[str, Any]:
    census = _load_census_pop(RAW_CENSUS)
    reports_path = PROCESSED / "reports.json"
    analyses_path = PROCESSED / "analyses.json"
    if not reports_path.exists():
        reports_path = WEB / "reports.json"
    if not analyses_path.exists():
        analyses_path = WEB / "analyses.json"

    reports = json.loads(reports_path.read_text()) if reports_path.exists() else {}
    analyses = json.loads(analyses_path.read_text()) if analyses_path.exists() else {}

    catchment = {
        str(w.get("label")): w
        for w in (analyses.get("catchment_coverage") or {}).get("wards") or []
    }

    wards_out: list[dict[str, Any]] = []
    joined = 0
    for w in reports.get("wards") or []:
        label = str(w.get("label") or "")
        # Try exact and zero-stripped
        pop = census.get(label)
        if pop is None:
            try:
                pop = census.get(str(int(label)))
            except ValueError:
                pop = None
        catch = catchment.get(label) or {}
        pct400 = catch.get("pct_area_within_400m")
        est_within = None
        if pop is not None and pct400 is not None:
            est_within = int(round(pop * (float(pct400) / 100.0)))
            joined += 1
        wards_out.append(
            {
                "label": label,
                "population_2011": pop,
                "pct_area_within_400m": pct400,
                "est_pop_within_400m": est_within,
                "join_status": "joined" if pop is not None else "unmatched",
            }
        )

    total_pop = sum(w["population_2011"] for w in wards_out if w["population_2011"])
    total_within = sum(
        w["est_pop_within_400m"] for w in wards_out if w["est_pop_within_400m"] is not None
    )
    n_wards = len(wards_out)
    join_rate = joined / n_wards if n_wards else 0
    status = "partial" if joined > 0 else "unavailable"
    if joined >= 200:
        status = "loaded"

    payload = {
        "status": status,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "note": (
            "Population from Census 2011 ward tables (historic 155-ward scheme) joined to "
            "GCC 2022 wards by ward number where labels match. People within 400m estimated "
            "as population × geometry catchment share — not a dasymetric surface. "
            f"Joined {joined} of {n_wards} wards."
        ),
        "method": {
            "population_source": str(RAW_CENSUS.relative_to(ROOT)) if RAW_CENSUS.exists() else OPENCITY_URL,
            "opencity_dataset": OPENCITY_URL,
            "catchment": "pct_area_within_400m from Euclidean dissolved buffers",
            "formula": "est_pop_within_400m = population_2011 * pct_area_within_400m / 100",
            "join_rate": round(join_rate, 4),
            "wards_joined": joined,
            "wards_total": n_wards,
            "census_wards_in_table": len(census),
        },
        "city": {
            "population_joined": total_pop or None,
            "est_pop_within_400m": total_within or None,
            "pct_pop_within_400m": (
                round(100.0 * total_within / total_pop, 2) if total_pop else None
            ),
        },
        "wards": wards_out,
        "priority_low_access": sorted(
            [
                w
                for w in wards_out
                if w.get("est_pop_within_400m") is not None
                and w.get("pct_area_within_400m") is not None
                and float(w["pct_area_within_400m"]) < 50
            ],
            key=lambda x: x.get("est_pop_within_400m") or 0,
            reverse=True,
        )[:25],
    }
    return payload


def main() -> int:
    PROCESSED.mkdir(parents=True, exist_ok=True)
    WEB.mkdir(parents=True, exist_ok=True)
    payload = build()
    out = PROCESSED / "pop_access.json"
    out.write_text(json.dumps(payload, indent=2, allow_nan=False))
    (WEB / "pop_access.json").write_text(out.read_text())

    # Upsert into analyses.json
    for base in (PROCESSED, WEB):
        ap = base / "analyses.json"
        if not ap.exists():
            continue
        analyses = json.loads(ap.read_text())
        analyses["pop_access"] = payload
        ap.write_text(json.dumps(analyses, indent=2, allow_nan=False))

    # Update manifest unavailable → partial when we have joins
    for base in (PROCESSED, WEB):
        mp = base / "manifest.json"
        if not mp.exists():
            continue
        manifest = json.loads(mp.read_text())
        updated = False
        for item in manifest.get("unavailable_analytics") or []:
            if item.get("id") == "pop_weighted_access":
                item["status"] = payload["status"]
                item["reason"] = payload["note"]
                item["needed"] = (
                    "Validated population surface for all 200 GCC 2022 wards "
                    "(current join uses Census 2011 ward numbers)."
                )
                updated = True
        if updated:
            mp.write_text(json.dumps(manifest, indent=2, allow_nan=False))

    print(
        f"pop_access: status={payload['status']} joined={payload['method']['wards_joined']}/{payload['method']['wards_total']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
