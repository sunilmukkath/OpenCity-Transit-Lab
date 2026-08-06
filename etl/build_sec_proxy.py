#!/usr/bin/env python3
"""
SEC / slum proxy for GCC wards — verified open data only.

1. Slum share: OpenCity slum boundary polygons ∩ 2022 wards → pct_slum_area.
2. Amenity proxy: Census 2011 HH-14 houselisting % (banking, assets, latrine, car…)
   joined by ward number for wards 1–155. Wards 156–200 = amenity unavailable.
3. Combined sec_proxy_band for map colour — labelled as proxy, not income.

Integrity: never invents income. Unmatched amenity wards stay Unavailable.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "census_sec"
PROCESSED = ROOT / "data" / "processed"
WEB = ROOT / "apps" / "web" / "public" / "data"


def _num(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


def load_hh14_amenities(path: Path) -> pd.DataFrame:
    df = pd.read_excel(path, header=None)
    rows: list[dict[str, Any]] = []
    for i in range(10, len(df)):
        area = str(df.iloc[i, 8] or "")
        if "Ward No." not in area:
            continue
        ward_raw = str(df.iloc[i, 7] or "")
        m = re.search(r"(\d+)", ward_raw) or re.search(r"Ward No\.(\d+)", area)
        if not m:
            continue
        ward_no = int(m.group(1))
        rows.append(
            {
                "ward_no": ward_no,
                "hh_condition_good_pct": _num(pd.Series([df.iloc[i, 11]])).iloc[0],
                "latrine_within_pct": _num(pd.Series([df.iloc[i, 90]])).iloc[0],
                "no_latrine_within_pct": _num(pd.Series([df.iloc[i, 99]])).iloc[0],
                "bathing_within_pct": _num(pd.Series([df.iloc[i, 102]])).iloc[0],
                "banking_pct": _num(pd.Series([df.iloc[i, 126]])).iloc[0],
                "television_pct": _num(pd.Series([df.iloc[i, 128]])).iloc[0],
                "scooter_pct": _num(pd.Series([df.iloc[i, 135]])).iloc[0],
                "car_pct": _num(pd.Series([df.iloc[i, 136]])).iloc[0],
                "full_asset_bundle_pct": _num(pd.Series([df.iloc[i, 137]])).iloc[0],
                "no_listed_assets_pct": _num(pd.Series([df.iloc[i, 138]])).iloc[0],
            }
        )
    out = pd.DataFrame(rows).drop_duplicates("ward_no")
    # Deprivation score 0–100 (higher = lower amenity / more deprivation proxy)
    # Components from HH-14 percentages — not income.
    def deprive(r: pd.Series) -> float:
        parts = []
        if pd.notna(r["banking_pct"]):
            parts.append(100 - float(r["banking_pct"]))
        if pd.notna(r["car_pct"]):
            parts.append(100 - float(r["car_pct"]))
        if pd.notna(r["scooter_pct"]):
            parts.append(max(0.0, 70 - float(r["scooter_pct"])) * (100 / 70))
        if pd.notna(r["no_listed_assets_pct"]):
            parts.append(min(100.0, float(r["no_listed_assets_pct"]) * 5))
        if pd.notna(r["no_latrine_within_pct"]):
            parts.append(min(100.0, float(r["no_latrine_within_pct"]) * 3))
        if pd.notna(r["hh_condition_good_pct"]):
            parts.append(100 - float(r["hh_condition_good_pct"]))
        if not parts:
            return float("nan")
        return float(np.clip(np.mean(parts), 0, 100))

    out["amenity_deprivation"] = out.apply(deprive, axis=1)
    return out


def load_census_sc_st(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, low_memory=False)
    for c in ["Total Population", "SC Population", "ST Population"]:
        df[c] = pd.to_numeric(
            df[c].astype(str).str.replace(",", "", regex=False).replace({"-": None, "NA": None}),
            errors="coerce",
        )
    agg = (
        df.groupby("Ward Number", as_index=False)
        .agg(
            census_pop_2011=("Total Population", "sum"),
            sc_pop_2011=("SC Population", "sum"),
            st_pop_2011=("ST Population", "sum"),
        )
        .rename(columns={"Ward Number": "ward_no"})
    )
    agg["sc_pct_2011"] = (agg["sc_pop_2011"] / agg["census_pop_2011"] * 100).round(2)
    return agg


def slum_share_by_ward(
    wards: gpd.GeoDataFrame, slums: gpd.GeoDataFrame
) -> gpd.GeoDataFrame:
    w = wards.copy()
    if "ward_label" not in w.columns:
        raise RuntimeError("wards missing ward_label")
    w_m = w.to_crs(3857)
    s_m = slums.to_crs(3857)
    s_m = s_m[~s_m.geometry.is_empty & s_m.geometry.notna()].copy()
    s_m["geometry"] = s_m.geometry.buffer(0)
    slum_union = s_m.unary_union

    pcts = []
    has = []
    for geom in w_m.geometry:
        if geom is None or geom.is_empty:
            pcts.append(0.0)
            has.append(False)
            continue
        try:
            inter = geom.intersection(slum_union)
            area = float(geom.area) or 1.0
            share = float(inter.area) / area * 100.0 if not inter.is_empty else 0.0
        except Exception:  # noqa: BLE001
            share = 0.0
        pcts.append(round(min(100.0, share), 3))
        has.append(share > 0.5)

    w["pct_slum_area"] = pcts
    w["has_slum"] = has
    return w


def tertile_band(values: pd.Series, labels: tuple[str, str, str]) -> pd.Series:
    """Assign tertiles among non-null values; nulls stay NA."""
    out = pd.Series([None] * len(values), index=values.index, dtype=object)
    valid = values.dropna()
    if valid.empty:
        return out
    try:
        cats = pd.qcut(valid, 3, labels=list(labels), duplicates="drop")
        out.loc[valid.index] = cats.astype(str)
    except ValueError:
        # Not enough unique values
        med = float(valid.median())
        out.loc[valid.index] = valid.apply(
            lambda v: labels[0] if v <= med else labels[2]
        )
    return out


def build_sec_proxy(
    wards: gpd.GeoDataFrame,
    *,
    housing_xlsx: Path,
    census_csv: Path,
    slum_kml: Path,
) -> dict[str, Any]:
    result: dict[str, Any] = {"layers": {}, "analysis": {}, "errors": []}

    amenities = load_hh14_amenities(housing_xlsx)
    scst = load_census_sc_st(census_csv)
    amen = amenities.merge(scst, on="ward_no", how="left")

    slums = gpd.read_file(slum_kml)
    if slums.crs is None:
        slums = slums.set_crs(4326)
    slums = slums.to_crs(4326)
    # Export simplified slum polygons for map
    slum_out = slums.copy()
    slum_out["slum_id"] = range(1, len(slum_out) + 1)
    keep_cols = [c for c in ["Name", "slum_id", "geometry"] if c in slum_out.columns or c == "geometry"]
    if "Name" not in slum_out.columns:
        slum_out["Name"] = slum_out["slum_id"].map(lambda i: f"Slum {i}")
    slum_export = slum_out[["Name", "slum_id", "geometry"]].copy()
    slum_export = slum_export[~slum_export.geometry.is_empty]
    PROCESSED.mkdir(parents=True, exist_ok=True)
    slum_path = PROCESSED / "slums.geojson"
    slum_export.to_file(slum_path, driver="GeoJSON")
    result["layers"]["slums"] = {
        "status": "loaded",
        "file": "slums.geojson",
        "feature_count": int(len(slum_export)),
        "notes": "OpenCity Chennai Slum Boundaries Map (KML). Presence polygons — not income.",
        "derived_from": "opencity_chennai_slums",
    }

    w = slum_share_by_ward(wards, slum_export)
    w["ward_no"] = pd.to_numeric(w["ward_label"], errors="coerce")

    # Join amenities by ward number (Census 2011 HH-14 covers 1–155)
    amen_idx = amen.set_index("ward_no")
    for col in amen.columns:
        if col == "ward_no":
            continue
        w[col] = w["ward_no"].map(amen_idx[col])

    w["amenity_join"] = w["ward_no"].apply(
        lambda n: (
            "joined_hh14_2011"
            if pd.notna(n) and int(n) in set(amen["ward_no"])
            else ("out_of_hh14_range" if pd.notna(n) and int(n) > 155 else "unmatched")
        )
    )

    # Slum bands
    w["slum_band"] = "none"
    with_slum = w["pct_slum_area"] > 0.5
    if with_slum.any():
        bands = tertile_band(
            w.loc[with_slum, "pct_slum_area"],
            ("low_slum_share", "moderate_slum_share", "high_slum_share"),
        )
        w.loc[with_slum, "slum_band"] = bands

    # Amenity bands among joined wards
    joined = w["amenity_join"] == "joined_hh14_2011"
    w["amenity_band"] = None
    if joined.any():
        w.loc[joined, "amenity_band"] = tertile_band(
            w.loc[joined, "amenity_deprivation"],
            ("higher_amenity", "middle_amenity", "lower_amenity"),
        )

    # Combined SEC proxy: prefer deprivation + slum boost
    def combine(row: pd.Series) -> str | None:
        dep = row.get("amenity_deprivation")
        slum = float(row.get("pct_slum_area") or 0)
        band_a = row.get("amenity_band")
        if pd.isna(dep) or band_a is None:
            # Slum-only fallback
            if slum >= 8:
                return "lower_proxy"
            if slum >= 2:
                return "middle_proxy"
            if slum > 0.05:
                return "middle_proxy"
            return None  # no census amenity, negligible slum → unavailable
        # Amenity tertile with slum uplift
        if band_a == "lower_amenity" or slum >= 10:
            return "lower_proxy"
        if band_a == "higher_amenity" and slum < 2:
            return "higher_proxy"
        return "middle_proxy"

    w["sec_proxy_band"] = w.apply(combine, axis=1)
    w["sec_proxy_note"] = (
        "Proxy from Census 2011 HH-14 amenities (ward nos 1–155) + OpenCity slum area share. "
        "Not household income. Ward numbers remapped after expansion — treat as indicative."
    )

    # Write enriched wards (merge new cols onto existing file attributes)
    # Keep geometry + prior inventory columns
    out_cols = [
        c
        for c in w.columns
        if c
        in {
            "ward_label",
            "stop_count",
            "shelter_count",
            "hub_count",
            "area_km2",
            "stops_per_km2",
            "geometry",
            "pct_slum_area",
            "has_slum",
            "slum_band",
            "amenity_deprivation",
            "amenity_band",
            "amenity_join",
            "banking_pct",
            "car_pct",
            "scooter_pct",
            "television_pct",
            "latrine_within_pct",
            "no_listed_assets_pct",
            "hh_condition_good_pct",
            "sc_pct_2011",
            "census_pop_2011",
            "sec_proxy_band",
        }
        or c == "geometry"
    ]
    # ensure key cols
    for c in [
        "pct_slum_area",
        "has_slum",
        "slum_band",
        "amenity_deprivation",
        "amenity_band",
        "amenity_join",
        "sec_proxy_band",
        "banking_pct",
        "car_pct",
        "scooter_pct",
        "sc_pct_2011",
    ]:
        if c not in w.columns:
            w[c] = None

    wards_out = w.copy()
    wards_path = PROCESSED / "wards.geojson"
    # Preserve full attribute set
    wards_out.to_file(wards_path, driver="GeoJSON")

    joined_n = int((w["amenity_join"] == "joined_hh14_2011").sum())
    proxy_n = int(w["sec_proxy_band"].notna().sum())
    slum_wards = int(w["has_slum"].sum())

    rows = []
    for _, r in w.iterrows():
        rows.append(
            {
                "label": str(r.get("ward_label")),
                "pct_slum_area": float(r["pct_slum_area"]) if pd.notna(r.get("pct_slum_area")) else 0.0,
                "has_slum": bool(r.get("has_slum")),
                "slum_band": None if pd.isna(r.get("slum_band")) else r.get("slum_band"),
                "amenity_deprivation": (
                    round(float(r["amenity_deprivation"]), 1)
                    if pd.notna(r.get("amenity_deprivation"))
                    else None
                ),
                "amenity_band": None if pd.isna(r.get("amenity_band")) else r.get("amenity_band"),
                "amenity_join": None if pd.isna(r.get("amenity_join")) else r.get("amenity_join"),
                "sec_proxy_band": (
                    None
                    if pd.isna(r.get("sec_proxy_band"))
                    else str(r.get("sec_proxy_band"))
                ),
                "banking_pct": float(r["banking_pct"]) if pd.notna(r.get("banking_pct")) else None,
                "car_pct": float(r["car_pct"]) if pd.notna(r.get("car_pct")) else None,
                "scooter_pct": float(r["scooter_pct"]) if pd.notna(r.get("scooter_pct")) else None,
                "sc_pct_2011": float(r["sc_pct_2011"]) if pd.notna(r.get("sc_pct_2011")) else None,
            }
        )

    result["layers"]["wards"] = {
        "status": "loaded",
        "file": "wards.geojson",
        "feature_count": int(len(w)),
        "notes": (
            f"Enriched with slum area share + Census 2011 HH-14 amenity proxy "
            f"({joined_n}/200 wards joined by number)."
        ),
        "attributes": [
            "ward_label",
            "pct_slum_area",
            "slum_band",
            "amenity_deprivation",
            "amenity_band",
            "sec_proxy_band",
            "amenity_join",
        ],
    }
    result["analysis"] = {
        "status": "partial" if joined_n < len(w) else "loaded",
        "note": (
            "SEC proxy combines Census 2011 houselisting amenity/asset percentages "
            "(wards 1–155 by number) with OpenCity slum polygon area share on 2022 wards. "
            "This is NOT household income or official poverty status. "
            "Ward renumbering/expansion means amenity joins are indicative — "
            f"{joined_n} of {len(w)} wards received HH-14 attributes; "
            f"{slum_wards} wards intersect mapped slum polygons."
        ),
        "method": {
            "slum_share": "intersection area of OpenCity slum boundaries ÷ ward area",
            "amenity_deprivation": (
                "mean of inverted banking/car/scooter/good-housing and elevated "
                "no-assets / no-latrine-within percentages from HH-14 (0–100, higher = lower amenity)"
            ),
            "sec_proxy_bands": {
                "lower_proxy": "lower amenity tertile and/or high slum area share",
                "middle_proxy": "middle amenity or modest slum share",
                "higher_proxy": "higher amenity tertile with low slum share",
            },
            "sources": [
                "OpenCity — Chennai Slum Boundaries Map",
                "OpenCity — Census 2011 Housing and Houselisting (HH-14)",
                "OpenCity — Census 2011 ward population (SC % contextual)",
            ],
        },
        "wards": rows,
        "counts": {
            "wards_total": int(len(w)),
            "wards_with_slum": slum_wards,
            "wards_amenity_joined": joined_n,
            "wards_with_sec_proxy": proxy_n,
            "wards_amenity_unavailable": int(len(w) - joined_n),
            "lower_proxy": int((w["sec_proxy_band"] == "lower_proxy").sum()),
            "middle_proxy": int((w["sec_proxy_band"] == "middle_proxy").sum()),
            "higher_proxy": int((w["sec_proxy_band"] == "higher_proxy").sum()),
            "slum_polygons": int(len(slum_export)),
        },
        "priority_lower_proxy": sorted(
            [r for r in rows if r.get("sec_proxy_band") == "lower_proxy"],
            key=lambda r: (-(r.get("pct_slum_area") or 0), -(r.get("amenity_deprivation") or 0)),
        )[:30],
    }
    return result


if __name__ == "__main__":
    wards_path = PROCESSED / "wards.geojson"
    if not wards_path.exists():
        raise SystemExit("wards.geojson missing — run main pipeline first")
    wards = gpd.read_file(wards_path)
    out = build_sec_proxy(
        wards,
        housing_xlsx=RAW / "housing_houselisting_2011.xlsx",
        census_csv=RAW / "census_ward_2011.csv",
        slum_kml=RAW / "slum_boundaries.kml",
    )
    # Update analyses + manifest
    analyses_path = PROCESSED / "analyses.json"
    analyses = json.loads(analyses_path.read_text()) if analyses_path.exists() else {}
    analyses["sec_proxy"] = out["analysis"]
    analyses_path.write_text(json.dumps(analyses, indent=2, allow_nan=False))

    manifest_path = PROCESSED / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        for k, meta in out["layers"].items():
            if k == "wards" and "wards" in manifest.get("layers", {}):
                manifest["layers"]["wards"].update(
                    {
                        "notes": meta.get("notes"),
                        "attributes": list(
                            dict.fromkeys(
                                (manifest["layers"]["wards"].get("attributes") or [])
                                + (meta.get("attributes") or [])
                            )
                        ),
                    }
                )
            else:
                manifest["layers"][k] = meta
        # Update unavailable analytics — equity now partial
        for u in manifest.get("unavailable_analytics") or []:
            if u.get("id") == "equity_sec":
                u["status"] = "partial"
                u["reason"] = out["analysis"]["note"]
                u["name"] = "SEC / slum amenity proxy (not income)"
        manifest_path.write_text(json.dumps(manifest, indent=2))

    WEB.mkdir(parents=True, exist_ok=True)
    for name in ("wards.geojson", "slums.geojson", "analyses.json", "manifest.json"):
        src = PROCESSED / name
        if src.exists():
            (WEB / name).write_bytes(src.read_bytes())
    print(json.dumps({"counts": out["analysis"].get("counts"), "layers": list(out["layers"])}, indent=2))
