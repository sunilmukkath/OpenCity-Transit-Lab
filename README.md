# OpenCity Transit Lab

Chennai Last-Mile Decision Support — civic evidence platform for policymakers, GCC local bodies, the traffic department, and the public.

## Principles

- **No fabricated metrics.** Only layers and counts derived from successfully ingested public data.
- Missing data shows as **Unavailable**; real-time feeds show as **Not connected** until plugged.
- **Data Sources** is a first-class view with provenance, licenses, and gaps.

## Structure

- `apps/web` — Next.js map and decision-support UI
- `etl/` — Python ingest/validate pipeline
- `data/raw` — downloaded source files
- `data/processed` — GeoJSON + `manifest.json` + `metrics.json`
- `archive/sample-dashboard` — original Datajam HTML prototype (mock numbers not used)

## Setup

### ETL

```bash
cd etl
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
python etl/run_pipeline.py
```

### Web app

```bash
cd apps/web
npm install
npm run dev
```

Open http://localhost:3000

## Real-time plugs (optional)

When an agency feed exists, set environment variables and extend `apps/web/src/lib/realtime/`:

- `GTFS_RT_VEHICLE_URL`
- `GTFS_RT_TRIP_URL`
- `AGENCY_CROWD_API_URL`

Until configured, the UI shows **Not connected**.
