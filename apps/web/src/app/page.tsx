import Link from "next/link";
import { promises as fs } from "fs";
import path from "path";
import { fetchManifest, fetchMetrics, layerIsReady } from "@/lib/data";
import { MetricCard } from "@/components/MetricCard";
import { SectionEyebrow, SpectrumOrbs, SpectrumRule } from "@/components/BrandMotif";
import { LAB_FLOW } from "@/lib/lab-flow";
import type { ObjectivesAnalysis } from "@/lib/objectives-types";

async function loadObjectives(): Promise<ObjectivesAnalysis | null> {
  try {
    const file = path.join(process.cwd(), "public", "data", "objectives_analysis.json");
    const text = await fs.readFile(file, "utf8");
    return JSON.parse(text) as ObjectivesAnalysis;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const [manifest, metrics, objectives] = await Promise.all([
    fetchManifest(),
    fetchMetrics(),
    loadObjectives(),
  ]);
  const counts = metrics?.counts ?? {};
  const loadedLayers = manifest
    ? Object.values(manifest.layers).filter((l) => layerIsReady(l)).length
    : 0;
  const objList = (objectives?.objectives ?? []).filter(
    (o) => o.status === "loaded" || o.status === "partial"
  );

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,rgba(16,52,102,0.96)_0%,rgba(10,31,74,0.98)_48%,rgba(8,13,26,1)_100%)] px-6 py-12 shadow-[0_24px_70px_rgba(8,13,26,0.5)] sm:px-10">
        <SpectrumOrbs />
        <SpectrumRule className="absolute inset-x-0 top-0" />
        <div className="relative z-10">
          <span className="et-pill et-fade-up">Step 1 of 5 · Home</span>
          <p className="et-fade-up et-fade-up-delay-1 mt-5 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--yellow)]">
            OpenCity Transit Lab
          </p>
          <h1 className="et-fade-up et-fade-up-delay-1 mt-2 max-w-3xl font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--yellow-bright)] sm:text-5xl lg:text-[3.35rem] lg:leading-[1.08]">
            Answer Chennai PT questions with evidence
          </h1>
          <p className="et-fade-up et-fade-up-delay-2 mt-4 max-w-2xl text-lg text-[var(--ink-muted)]">
            Follow one path: Objectives charts → Map gaps → Actions → Ward reports. Sources
            stay available for provenance.
          </p>
          <div className="et-fade-up et-fade-up-delay-3 mt-7 flex flex-wrap gap-3">
            <Link href="/objectives" className="et-btn-primary">
              Next: 2. Objectives →
            </Link>
            <Link href="/map" className="et-btn-ghost">
              Skip to map
            </Link>
          </div>
          {manifest ? (
            <p className="mt-5 text-xs text-[var(--ink-muted)]">
              Manifest {new Date(manifest.generated_at).toLocaleString()} · {loadedLayers} layers
              loaded
            </p>
          ) : (
            <p className="mt-5 text-sm text-[var(--danger)]">
              Data manifest not found. Run <code>python etl/run_pipeline.py</code> first.
            </p>
          )}
        </div>
      </section>

      <section>
        <SectionEyebrow>Recommended path</SectionEyebrow>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
          Home → Objectives → Map → Actions → Reports
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--ink-muted)]">
          Use the steps in order. Filters live on Objectives, Map, Actions, and Reports — not
          before you start.
        </p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {LAB_FLOW.map((f) => (
            <li key={f.href}>
              <Link
                href={f.href}
                className={`et-card block h-full p-4 transition hover:border-[var(--accent)] ${
                  f.step === 1 ? "border-[var(--yellow)] bg-[rgba(255,229,102,0.06)]" : ""
                }`}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--yellow)]">
                  Step {f.step}
                </span>
                <p className="mt-1 font-semibold text-[var(--ink)]">{f.label}</p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">{f.blurb}</p>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <SectionEyebrow>Step 2 preview</SectionEyebrow>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--ink)]">
              Jump into an objective
            </h2>
          </div>
          <Link href="/objectives" className="text-sm font-semibold text-[var(--accent)]">
            All objective charts →
          </Link>
        </div>
        {objList.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {objList.map((o, i) => (
              <Link
                key={o.id}
                href={`/objectives#${o.id}`}
                className="et-card group block p-4"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-1 font-[family-name:var(--font-display)] text-base font-semibold text-[var(--yellow-bright)] group-hover:text-[var(--yellow)]">
                  {o.title}
                </h3>
                <p className="mt-2 line-clamp-2 text-sm text-[var(--ink-muted)]">
                  {o.summary ?? "Open for charts and metrics."}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--ink-muted)]">
            Objectives analysis not generated yet.
          </p>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "GCC wards", value: counts.wards?.toLocaleString() },
          { label: "GTFS stops", value: counts.transit_stops?.toLocaleString() },
          {
            label: "Mean Gap Index",
            value:
              counts.city_mean_gap_index != null
                ? Number(counts.city_mean_gap_index).toFixed(1)
                : null,
          },
          {
            label: "Objectives with data",
            value: objList.length ? String(objList.length) : null,
          },
        ]
          .filter((s) => s.value != null && s.value !== "")
          .map((s) => (
            <div key={s.label} className="et-stat">
              <strong>{s.value}</strong>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                {s.label}
              </p>
            </div>
          ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Schools mapped"
          value={counts.schools ?? manifest?.layers?.schools?.feature_count}
        />
        <MetricCard
          label="Healthcare mapped"
          value={counts.healthcare ?? manifest?.layers?.healthcare?.feature_count}
        />
        <MetricCard label="Weak last-mile hubs" value={counts.weak_last_mile_hubs} />
        <MetricCard
          label="High gap wards"
          value={counts.high_gap_wards ?? counts.severe_gap_wards}
        />
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/objectives" className="et-btn-primary">
          Next: 2. Objectives →
        </Link>
        <Link href="/sources" className="et-btn-ghost">
          Data sources
        </Link>
      </div>
    </div>
  );
}
