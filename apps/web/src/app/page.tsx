import Link from "next/link";
import { AUDIENCES, fetchManifest, fetchMetrics, layerIsReady } from "@/lib/data";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { RealtimePanel } from "@/components/RealtimePanel";

export default async function HomePage() {
  const [manifest, metrics] = await Promise.all([fetchManifest(), fetchMetrics()]);
  const counts = metrics?.counts ?? {};

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(135deg,rgba(16,52,102,0.95)_0%,rgba(10,31,74,0.98)_45%,rgba(12,26,56,1)_100%)] px-6 py-10 shadow-[0_20px_60px_rgba(8,13,26,0.45)] sm:px-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.22),transparent_65%)]"
        />
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--accent-bright)]">
          OpenCity Transit Lab
        </p>
        <h1 className="mt-2 max-w-3xl font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--ink)] sm:text-5xl">
          Chennai last-mile decision support
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-[var(--ink-muted)]">
          Shared evidence for policymakers, GCC local bodies, the traffic department, and
          the public. We show only verified open layers — never fabricated equity scores or
          simulated live buses.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/map"
            className="rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--void)]"
          >
            Open network map
          </Link>
          <Link
            href="/sources"
            className="rounded-md border border-[var(--border-strong)] bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-[var(--ink)] hover:bg-white/[0.08]"
          >
            Data Sources
          </Link>
        </div>
        {manifest ? (
          <p className="mt-4 text-xs text-[var(--ink-muted)]">
            Manifest generated {new Date(manifest.generated_at).toLocaleString()} ·{" "}
            {manifest.integrity_rule}
          </p>
        ) : (
          <p className="mt-4 text-sm text-[var(--danger)]">
            Data manifest not found. Run <code>python etl/run_pipeline.py</code> first.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl font-semibold">
          Who is this for?
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((a) => (
            <Link
              key={a.id}
              href={a.href}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm transition hover:border-[var(--accent)]"
            >
              <h3 className="font-semibold">{a.label}</h3>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">{a.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            Verified city counts
          </h2>
          <Link href="/sources" className="text-sm font-medium text-[var(--accent)]">
            Why some cards are empty →
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="GCC wards"
            value={counts.wards}
            subtext="From OpenCity ward map 2022"
          />
          <MetricCard
            label="Transit stops (GTFS)"
            value={counts.transit_stops}
            unavailableReason="GTFS stops layer not loaded. See Data Sources."
            subtext="Community ChennaiGTFS — unofficial"
          />
          <MetricCard
            label="Bus shelters"
            value={counts.bus_shelters}
            unavailableReason="Shelter layer empty or unavailable."
            subtext="Shelter presence map — not all stops"
          />
          <MetricCard
            label="Rail / metro hubs"
            value={counts.rail_hubs}
            unavailableReason="Hub geometries not loaded."
            subtext="MRTS + metro-tagged stops"
          />
          <MetricCard
            label="Equity / SEC gap"
            value={null}
            unavailableReason="Census→ward joins not validated. No invented equity scores."
          />
          <MetricCard
            label="Pop-weighted 400m access"
            value={null}
            unavailableReason="Requires validated population surface. Geometry catchments may still appear on the map."
          />
          <MetricCard
            label="Wards with zero GTFS stops"
            value={counts.wards_with_zero_stops}
            unavailableReason="Needs wards + stops spatial join."
          />
          <MetricCard
            label="Mean stops per ward"
            value={counts.mean_stops_per_ward}
            unavailableReason="Needs wards + stops spatial join."
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Layer status
          </h2>
          <ul className="mt-3 space-y-2">
            {manifest
              ? Object.entries(manifest.layers).map(([key, layer]) => (
                  <li key={key} className="flex items-center justify-between gap-2 text-sm">
                    <span>{key}</span>
                    <StatusBadge status={layer.status} />
                  </li>
                ))
              : (
                <li className="text-sm text-[var(--ink-muted)]">Manifest unavailable</li>
              )}
          </ul>
          <p className="mt-3 text-xs text-[var(--ink-muted)]">
            Loaded layers with features:{" "}
            {manifest
              ? Object.values(manifest.layers).filter((l) => layerIsReady(l)).length
              : 0}
          </p>
        </div>
        <RealtimePanel />
      </section>
    </div>
  );
}
