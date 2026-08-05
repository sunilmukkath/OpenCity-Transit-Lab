import Link from "next/link";
import { AUDIENCES, fetchManifest, fetchMetrics, layerIsReady } from "@/lib/data";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { RealtimePanel } from "@/components/RealtimePanel";
import { LayerMarquee } from "@/components/LayerMarquee";
import { DecisionCta } from "@/components/DecisionCta";
import { SectionEyebrow, SpectrumOrbs, SpectrumRule } from "@/components/BrandMotif";

export default async function HomePage() {
  const [manifest, metrics] = await Promise.all([fetchManifest(), fetchMetrics()]);
  const counts = metrics?.counts ?? {};
  const loadedLayers = manifest
    ? Object.values(manifest.layers).filter((l) => layerIsReady(l)).length
    : 0;

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,rgba(16,52,102,0.96)_0%,rgba(10,31,74,0.98)_48%,rgba(8,13,26,1)_100%)] px-6 py-12 shadow-[0_24px_70px_rgba(8,13,26,0.5)] sm:px-10">
        <SpectrumOrbs />
        <SpectrumRule className="absolute inset-x-0 top-0" />
        <div className="relative z-10">
          <span className="et-pill et-fade-up">Civic evidence · verified layers only</span>
          <p className="et-fade-up et-fade-up-delay-1 mt-5 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--yellow)]">
            OpenCity Transit Lab
          </p>
          <h1 className="et-fade-up et-fade-up-delay-1 mt-2 max-w-3xl font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--yellow-bright)] sm:text-5xl lg:text-[3.35rem] lg:leading-[1.08]">
            Chennai last-mile decision support
          </h1>
          <p className="et-fade-up et-fade-up-delay-2 mt-4 max-w-2xl text-lg text-[var(--ink-muted)]">
            We map. We measure. We recommend. Shared evidence for policymakers, GCC local
            bodies, traffic planners, and the public — never fabricated equity scores or
            simulated live buses.
          </p>
          <div className="et-fade-up et-fade-up-delay-3 mt-7 flex flex-wrap gap-3">
            <Link href="/analytics?tab=spatial" className="et-btn-primary">
              Ward &amp; zone reports
            </Link>
            <Link href="/analytics" className="et-btn-ghost">
              Analytics overview
            </Link>
            <Link href="/map" className="et-btn-ghost">
              Network map
            </Link>
            <Link href="/sources" className="et-btn-ghost">
              Data Sources
            </Link>
          </div>
          {manifest ? (
            <p className="mt-5 text-xs text-[var(--ink-muted)]">
              Manifest generated {new Date(manifest.generated_at).toLocaleString()} ·{" "}
              {manifest.integrity_rule}
            </p>
          ) : (
            <p className="mt-5 text-sm text-[var(--danger)]">
              Data manifest not found. Run <code>python etl/run_pipeline.py</code> first.
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="et-stat">
          <strong>
            {counts.wards?.toLocaleString() ?? "—"}
          </strong>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            GCC wards mapped
          </p>
        </div>
        <div className="et-stat">
          <strong>
            {counts.transit_stops?.toLocaleString() ?? "—"}
          </strong>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Transit stops loaded
          </p>
        </div>
        <div className="et-stat">
          <strong>
            {counts.city_mean_gap_index != null
              ? Number(counts.city_mean_gap_index).toFixed(1)
              : "—"}
          </strong>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            City Gap Index mean
          </p>
        </div>
        <div className="et-stat">
          <strong>{loadedLayers || "—"}</strong>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
            Verified map layers
          </p>
        </div>
      </section>

      <LayerMarquee />

      <section>
        <SectionEyebrow>Who is this for?</SectionEyebrow>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
          One evidence layer. Four entry paths.
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AUDIENCES.map((a) => (
            <Link key={a.id} href={a.href} className="et-card group block p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                Explore
              </p>
              <h3 className="mt-2 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--yellow-bright)] group-hover:text-[var(--yellow)]">
                {a.label}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">{a.blurb}</p>
              <span className="mt-4 inline-flex text-sm font-semibold text-[var(--accent)]">
                Open →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <SectionEyebrow>Verified inventory</SectionEyebrow>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
              City counts from loaded layers
            </h2>
          </div>
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
        <div className="et-card p-5">
          <SectionEyebrow>Layer status</SectionEyebrow>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-lg font-semibold">
            What actually loaded
          </h2>
          <ul className="mt-3 space-y-2">
            {manifest ? (
              Object.entries(manifest.layers).map(([key, layer]) => (
                <li key={key} className="flex items-center justify-between gap-2 text-sm">
                  <span>{key}</span>
                  <StatusBadge status={layer.status} />
                </li>
              ))
            ) : (
              <li className="text-sm text-[var(--ink-muted)]">Manifest unavailable</li>
            )}
          </ul>
          <p className="mt-3 text-xs text-[var(--ink-muted)]">
            Loaded layers with features: {loadedLayers}
          </p>
        </div>
        <RealtimePanel />
      </section>

      <DecisionCta />
    </div>
  );
}
