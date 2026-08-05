import { WardWorkbench } from "@/components/WardWorkbench";
import { fetchManifest, fetchMetrics } from "@/lib/data";

export default async function WardsPage() {
  const [manifest, metrics] = await Promise.all([fetchManifest(), fetchMetrics()]);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-[var(--accent)]">
          Local body workbench
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Ward / zone inventory
        </h1>
        <p className="mt-1 max-w-3xl text-[var(--ink-muted)]">
          Drill into a GCC ward for stop and shelter counts derived from spatial joins on
          loaded layers. Export CSV for field teams.
        </p>
      </header>
      <WardWorkbench manifest={manifest} metrics={metrics} />
    </div>
  );
}
