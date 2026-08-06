"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionEyebrow } from "@/components/BrandMotif";
import type { ObjectivesAnalysis } from "@/lib/objectives-types";
import { fetchJson } from "@/lib/data-client";

const PRIORITY_TONE: Record<string, string> = {
  critical: "border-[var(--danger)] bg-[rgba(251,113,133,0.1)]",
  high: "border-[rgba(249,115,22,0.5)] bg-[rgba(249,115,22,0.08)]",
  medium: "border-[var(--yellow)] bg-[rgba(255,229,102,0.08)]",
  info: "border-[var(--border)] bg-white/[0.03]",
};

export function RecommendationsPanel() {
  const [data, setData] = useState<ObjectivesAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const json = await fetchJson<ObjectivesAnalysis>("/data/objectives_analysis.json");
      if (!cancelled) {
        setData(json);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-sm text-[var(--ink-muted)]">Loading recommendations…</p>;
  }
  if (!data) {
    return (
      <p className="text-sm text-[var(--danger)]">
        objectives_analysis.json missing. Run{" "}
        <code>etl/build_objectives_analysis.py</code>.
      </p>
    );
  }

  const loaded = data.objectives.filter((o) => o.status === "loaded" || o.status === "partial");
  const gaps = data.objectives.filter((o) => o.status === "unavailable");

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,rgba(16,52,102,0.9),rgba(10,31,74,0.96))] px-6 py-7">
        <SectionEyebrow>Decision support</SectionEyebrow>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          Final recommendations &amp; insights
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">
          Synthesized from verified OpenCity / GTFS / MRTS layers for the Datajam problem
          statements. Where data is missing, we say Unavailable — we do not invent ridership,
          income, congestion, or schedules.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--ink-muted)]">
            {loaded.length} objectives with evidence
          </span>
          <span className="rounded-full border border-[var(--border)] px-3 py-1 text-[var(--ink-muted)]">
            {gaps.length} still Unavailable
          </span>
          <Link
            href="/objectives"
            className="rounded-full border border-[var(--accent)] px-3 py-1 font-semibold text-[var(--accent)]"
          >
            Full objective charts →
          </Link>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--ink)]">
          Priority actions
        </h2>
        {data.recommendations.map((rec) => (
          <article
            key={`${rec.priority}-${rec.title}`}
            className={`rounded-xl border p-4 ${PRIORITY_TONE[rec.priority] ?? PRIORITY_TONE.info}`}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">
                {rec.priority}
              </span>
              <StatusBadge
                status={
                  rec.priority === "info"
                    ? "unavailable"
                    : rec.priority === "critical"
                      ? "partial"
                      : "loaded"
                }
              />
            </div>
            <h3 className="font-semibold text-[var(--ink)]">{rec.title}</h3>
            <p className="mt-1.5 text-sm text-[var(--ink-muted)]">{rec.detail}</p>
            {rec.map_href ? (
              <Link
                href={rec.map_href}
                className="mt-3 inline-flex text-sm font-semibold text-[var(--accent)]"
              >
                Open related view →
              </Link>
            ) : null}
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Key insights (from loaded evidence)
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--ink-muted)]">
          {data.objectives
            .filter((o) => o.status === "loaded" || o.status === "partial")
            .map((o) => (
              <li key={o.id}>
                <strong className="text-[var(--ink)]">{o.title}:</strong>{" "}
                {o.summary ?? "See objective charts for metrics."}
              </li>
            ))}
        </ul>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Data gaps to close next
        </h2>
        <ul className="mt-3 space-y-3">
          {gaps.map((o) => (
            <li key={o.id} className="text-sm text-[var(--ink-muted)]">
              <div className="flex items-center gap-2">
                <StatusBadge status="unavailable" />
                <strong className="text-[var(--ink)]">{o.title}</strong>
              </div>
              <p className="mt-1">{o.reason}</p>
              {o.needed ? (
                <p className="mt-1">
                  <span className="font-semibold text-[var(--ink)]">Needed:</span> {o.needed}
                </p>
              ) : null}
            </li>
          ))}
          {data.objectives
            .filter((o) => o.status === "partial")
            .map((o) => (
              <li key={`partial-${o.id}`} className="text-sm text-[var(--ink-muted)]">
                <div className="flex items-center gap-2">
                  <StatusBadge status="partial" />
                  <strong className="text-[var(--ink)]">{o.title}</strong>
                </div>
                <p className="mt-1">{o.summary ?? o.reason}</p>
              </li>
            ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/objectives" className="et-btn-primary">
          Objective charts
        </Link>
        <Link href="/map" className="et-btn-ghost">
          Map
        </Link>
        <Link href="/sources" className="et-btn-ghost">
          Data sources
        </Link>
      </div>
    </div>
  );
}
