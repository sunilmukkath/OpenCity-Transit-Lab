import Link from "next/link";
import { ExportBar } from "@/components/ExportBar";
import { MetricCard } from "@/components/MetricCard";
import { StatusBadge } from "@/components/StatusBadge";
import { ProvenanceStrip } from "@/components/ProvenanceStrip";
import { fetchManifest, fetchMetrics, layerIsReady } from "@/lib/data";

export default async function PolicyPage() {
  const [manifest, metrics] = await Promise.all([fetchManifest(), fetchMetrics()]);
  const counts = metrics?.counts ?? {};

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wider text-[var(--yellow)]">
          Policymaker briefing
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          City overview
        </h1>
        <p className="max-w-3xl text-[var(--ink-muted)]">
          Defensible counts from loaded open data. Equity and population-weighted access are
          withheld until census joins are validated — better empty than wrong.
        </p>
        {manifest ? (
          <ProvenanceStrip source="ETL manifest" fetchedAt={manifest.generated_at} />
        ) : null}
      </header>

      <ExportBar manifest={manifest} metrics={metrics} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Wards mapped" value={counts.wards} subtext="GCC 2022" />
        <MetricCard
          label="Transit stops"
          value={counts.transit_stops}
          unavailableReason="GTFS not loaded — see Data Sources."
        />
        <MetricCard
          label="Bus shelters"
          value={counts.bus_shelters}
          unavailableReason="Shelter layer unavailable."
        />
        <MetricCard
          label="Rail hubs"
          value={counts.rail_hubs}
          unavailableReason="Hub layer unavailable."
        />
        <MetricCard
          label="Wards with zero stops"
          value={counts.wards_with_zero_stops}
          unavailableReason="Requires stop×ward join."
        />
        <MetricCard
          label="Equity gap"
          value={null}
          unavailableReason="Not computed — census join not validated."
        />
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          What you can say in a meeting
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--ink-muted)]">
          <li>
            Coverage inventory is drawn from OpenCity CKAN (wards, shelters, MRTS) and
            community ChennaiGTFS where loaded.
          </li>
          <li>
            Catchment polygons (400m / 800m) are geometry buffers around stops — not
            population-weighted accessibility rates.
          </li>
          <li>
            Real-time reliability is <StatusBadge status="not_connected" /> until MTC/CMRL
            publish a feed the city plugs in.
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/map" className="text-sm font-semibold text-[var(--accent)]">
            Open map →
          </Link>
          <Link href="/sources" className="text-sm font-semibold text-[var(--accent)]">
            Cite sources →
          </Link>
        </div>
      </section>

      <section className="print-only">
        <h2>Layer checklist</h2>
        <ul>
          {manifest &&
            Object.entries(manifest.layers).map(([k, layer]) => (
              <li key={k}>
                {k}: {layer.status}
                {layerIsReady(layer) ? ` (${layer.feature_count})` : ""}
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
