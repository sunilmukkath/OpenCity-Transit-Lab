# Methodology notes

## Data integrity

- The platform never displays fabricated ward equity scores from the archived sample dashboard.
- ETL writes `data/processed/manifest.json` describing Loaded / Unavailable layers.
- Real-time adapters live in `apps/web/src/lib/realtime` and report Not connected until env URLs are set.

## Catchments

- 400m / 800m polygons are dissolved Euclidean buffers around GTFS stop points (UTM 44N).
- They are **not** network isochrones and **not** population-weighted accessibility rates.

## Equity / SEC

- Withheld until Census attributes are joined to GCC 2022 wards with a documented join rate.

## Sources

See in-app **Data Sources** or regenerate via `python etl/run_pipeline.py`.
