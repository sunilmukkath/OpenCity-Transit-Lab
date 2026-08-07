# Methodology notes

## Data integrity

- The platform never displays fabricated ward equity scores from the archived sample dashboard.
- ETL writes `data/processed/manifest.json` describing Loaded / Partial / Unavailable / Not connected layers.
- Real-time adapters live in `apps/web/src/lib/realtime` and report Not connected until env URLs are set.

## Catchments

- 400m / 800m polygons are dissolved Euclidean buffers around GTFS stop points (UTM 44N).
- They are **not** network isochrones.

## Population-weighted access (Partial)

- Census 2011 ward population (OpenCity / censusindia) joined to GCC 2022 wards by ward number where labels match (~155/200).
- Estimated people within 400m = `population_2011 × pct_area_within_400m / 100`.
- This is **not** a dasymetric population surface. Unmatched wards stay without population estimates.

## Equity / slum

- Slum share = OpenCity slum polygon ∩ ward area (not household income).
- Census 2011 HH-14 amenity joins remain Partial and labelled as proxies only.

## NMT network (Partial)

- OSM Overpass footway / cycleway / path / pedestrian ways in a Greater Chennai bbox.
- Coverage is incomplete and unofficial.

## CMP corridors (Partial)

- Corridor names extracted from the CMP PDF, then geocoded via Nominatim/OSM.
- Approximate map context only — not official CMDA centerlines.

## Multi-audience hubs

- Home routes users to Citizen / Planner / Operator / Press hubs.
- Dashboard filters sync via URL query parameters across tools.

## Sources

See in-app **Data Sources** or regenerate via `python etl/run_pipeline.py`.
