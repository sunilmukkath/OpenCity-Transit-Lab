"""Inventory Gap Index (0–100). Higher = larger gap.

When mean OSM-network walk minutes are available (wards), a walk_gap component
is included and inventory weights are rebalanced to keep max 100.
When walk is Unavailable (zones / missing), the legacy 4-component formula is used.
"""

from __future__ import annotations

from typing import Any


def walk_gap_points(mean_walk_min: float | None) -> int:
    """Score OSM mean walk-to-PT minutes. Max 20. None → 0 (caller chooses legacy path)."""
    if mean_walk_min is None:
        return 0
    m = float(mean_walk_min)
    if m >= 15:
        return 20
    if m >= 12:
        return 16
    if m >= 10:
        return 12
    if m >= 8:
        return 8
    if m >= 6:
        return 4
    return 0


def build_gap_index(
    *,
    stop_count: int | None,
    shelter_count: int | None,
    hub_count: int | None,
    area_km2: float | None,
    city_mean_stops: float | None,
    mean_walk_min: float | None = None,
) -> dict[str, Any]:
    """
    Inventory Gap Index 0–100 (higher = larger gap).
    Built from verified point-in-polygon counts plus optional OSM walk minutes.
    Not a census equity or ridership score.
    """
    stops = stop_count
    shelters = shelter_count
    hubs = hub_count
    density = None
    if stops is not None and area_km2 and area_km2 > 0:
        density = stops / area_km2

    include_walk = mean_walk_min is not None

    if include_walk:
        # Rebalanced: stop 30 + shelter 25 + hub 15 + density 10 + walk 20 = 100
        stop_gap = 0
        if stops is None:
            stop_gap = 0
        elif stops == 0:
            stop_gap = 30
        elif stops < 5:
            stop_gap = 22
        elif city_mean_stops and stops < city_mean_stops * 0.35:
            stop_gap = 20
        elif city_mean_stops and stops < city_mean_stops * 0.5:
            stop_gap = 14
        elif city_mean_stops and stops < city_mean_stops * 0.75:
            stop_gap = 8
        elif city_mean_stops and stops < city_mean_stops:
            stop_gap = 3

        shelter_gap = 0
        if shelters is None:
            shelter_gap = 0
        elif stops is not None and stops > 0:
            ratio = shelters / max(stops, 1)
            if shelters == 0:
                shelter_gap = 25
            elif ratio < 0.08:
                shelter_gap = 20
            elif ratio < 0.15:
                shelter_gap = 13
            elif ratio < 0.25:
                shelter_gap = 6
        elif stops == 0 and shelters == 0:
            shelter_gap = 8

        hub_gap = 0
        if hubs is None:
            hub_gap = 0
        elif hubs == 0:
            hub_gap = 15
        elif hubs == 1:
            hub_gap = 5

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

        walk_gap = walk_gap_points(mean_walk_min)
        components = {
            "stop_gap": stop_gap,
            "shelter_gap": shelter_gap,
            "hub_gap": hub_gap,
            "density_gap": density_gap,
            "walk_gap": walk_gap,
        }
        gap_max = {
            "stop_gap": 30,
            "shelter_gap": 25,
            "hub_gap": 15,
            "density_gap": 10,
            "walk_gap": 20,
        }
    else:
        # Legacy inventory-only (zones / walk Unavailable)
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
            shelter_gap = 10

        hub_gap = 0
        if hubs is None:
            hub_gap = 0
        elif hubs == 0:
            hub_gap = 20
        elif hubs == 1:
            hub_gap = 6

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
        gap_max = {
            "stop_gap": 40,
            "shelter_gap": 30,
            "hub_gap": 20,
            "density_gap": 10,
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
        "gap_max": gap_max,
        "includes_walk": include_walk,
    }


def apply_gap_to_unit(
    unit: dict[str, Any],
    *,
    city_mean_stops: float | None,
    mean_walk_min: float | None = None,
) -> None:
    """Recompute gap_index / band / components on an existing unit report dict."""
    walk = mean_walk_min
    if walk is None and unit.get("mean_walk_min") is not None:
        walk = float(unit["mean_walk_min"])
    gap = build_gap_index(
        stop_count=unit.get("stop_count"),
        shelter_count=unit.get("shelter_count"),
        hub_count=unit.get("hub_count"),
        area_km2=unit.get("area_km2"),
        city_mean_stops=city_mean_stops,
        mean_walk_min=walk,
    )
    unit["gap_index"] = gap["gap_index"]
    unit["gap_band"] = gap["gap_band"]
    unit["gap_components"] = gap["gap_components"]
    unit["priority_score"] = gap["gap_index"]
