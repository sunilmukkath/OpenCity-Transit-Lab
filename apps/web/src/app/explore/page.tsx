import Link from "next/link";
import { MetricCard } from "@/components/MetricCard";
import { fetchMetrics, fetchManifest } from "@/lib/data";

export default async function ExplorePage() {
  const [metrics, manifest] = await Promise.all([fetchMetrics(), fetchManifest()]);
  const counts = metrics?.counts ?? {};

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wider text-[var(--yellow)]">
          Public explorer
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          Explore Chennai transit coverage
        </h1>
        <p className="max-w-2xl text-lg text-[var(--ink-muted)]">
          This is the same evidence officials see — written in plain language. If a number
          is missing, we say so instead of guessing.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="City wards on the map"
          value={counts.wards}
          subtext="Official GCC boundaries (2022)"
        />
        <MetricCard
          label="Mapped transit stops"
          value={counts.transit_stops}
          unavailableReason="Stop list not loaded yet from community GTFS."
          subtext="Community-maintained schedule data"
        />
        <MetricCard
          label="Mapped bus shelters"
          value={counts.bus_shelters}
          unavailableReason="Shelter map not available."
          subtext="Shows shelters, not every stop"
        />
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          What you can do
        </h2>
        <ul className="mt-3 space-y-3 text-sm text-[var(--ink-muted)]">
          <li>
            <Link href="/map" className="font-semibold text-[var(--accent)]">
              Open the map
            </Link>{" "}
            — see wards, stops, MRTS, and walk catchments that actually loaded.
          </li>
          <li>
            <Link href="/wards" className="font-semibold text-[var(--accent)]">
              Look up a ward
            </Link>{" "}
            — see stop and shelter counts inside that boundary.
          </li>
          <li>
            <Link href="/sources" className="font-semibold text-[var(--accent)]">
              Check Data Sources
            </Link>{" "}
            — every dataset, its date, and whether realtime is connected.
          </li>
        </ul>
      </section>

      <section className="rounded-xl bg-white/[0.04] border border-[var(--border)] p-5 text-sm text-[var(--ink-muted)]">
        <p>
          Live bus tracking is <strong>not connected</strong>
          {manifest ? ` (${manifest.realtime.length} connector slots ready)` : ""}. When
          transport agencies publish a feed, arrivals and vehicle positions can be plugged
          in without inventing data today.
        </p>
      </section>
    </div>
  );
}
