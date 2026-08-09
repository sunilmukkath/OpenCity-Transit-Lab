"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { MapExplorerClient } from "@/components/MapExplorerClient";
import { StatusBadge } from "@/components/StatusBadge";
import { fetchAnalysesClient, fetchManifestClient } from "@/lib/data-client";
import type {
  AdvancedAnalyses,
  Manifest,
  ManifestSource,
  ShelterMismatchRow,
} from "@/lib/types";

function gapLabel(score: number): { band: string; plain: string; color: string } {
  if (score >= 70) {
    return {
      band: "Critical",
      plain: "Many stops, almost no mapped shelters",
      color: "text-[#f43f5e]",
    };
  }
  if (score >= 40) {
    return {
      band: "High",
      plain: "Shelters scarce relative to stops",
      color: "text-[#f97316]",
    };
  }
  return {
    band: "Moderate",
    plain: "Some shelters, still below a healthy share",
    color: "text-[#eab308]",
  };
}

function ratioPlain(ratio: number, stops: number, shelters: number): string {
  if (shelters === 0) return `${stops} stops · 0 shelters`;
  if (ratio <= 0) return `${stops} stops · ${shelters} shelters`;
  const perShelter = Math.round(1 / ratio);
  return `About 1 shelter per ${perShelter} stops`;
}

function SourceRow({
  name,
  publisher,
  portal,
  notes,
  status,
}: {
  name: string;
  publisher?: string | null;
  portal?: string | null;
  notes?: string | null;
  status?: string | null;
}) {
  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium text-[var(--ink)]">{name}</p>
        {status ? <StatusBadge status={status} /> : null}
      </div>
      {publisher ? (
        <p className="mt-1 text-xs text-[var(--ink-muted)]">{publisher}</p>
      ) : null}
      {notes ? <p className="mt-1 text-xs text-[var(--ink-muted)]">{notes}</p> : null}
      {portal ? (
        <a
          href={portal}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-xs font-semibold text-[var(--accent)] hover:underline"
        >
          Open source →
        </a>
      ) : null}
    </li>
  );
}

export function InfrastructurePage() {
  const [analyses, setAnalyses] = useState<AdvancedAnalyses | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);

  useEffect(() => {
    let c = false;
    Promise.all([fetchAnalysesClient(), fetchManifestClient()]).then(([a, m]) => {
      if (!c) {
        setAnalyses(a);
        setManifest(m);
      }
    });
    return () => {
      c = true;
    };
  }, []);

  const smm = analyses?.shelter_mismatch;
  const wards = smm?.priority_wards?.slice(0, 40) ?? [];
  const zones = smm?.priority_zones?.slice(0, 12) ?? [];
  const top = wards[0] as ShelterMismatchRow | undefined;

  const sources = useMemo(() => {
    const s = manifest?.sources ?? {};
    const pick = (...keys: string[]): ManifestSource | undefined => {
      for (const k of keys) {
        const x = s[k];
        if (x && x.status !== "unavailable") return x;
      }
      return undefined;
    };
    return {
      stops: pick("chennai_gtfs_unified"),
      shelters: pick("bus_shelters"),
      wards: pick("gcc_wards_2022"),
      zones: pick("gcc_zones_2022"),
    };
  }, [manifest]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          Stops vs shelters
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--ink-muted)]">
          Which GCC wards have bus <strong className="text-[var(--ink)]">stops</strong> but few or
          no mapped <strong className="text-[var(--ink)]">shelters</strong> (weather protection)?
          This is a presence inventory — not boarding demand or ridership.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={smm?.status ?? "unavailable"} />
        <p className="max-w-3xl text-sm text-[var(--ink-muted)]">
          {smm?.note ??
            "Compares GTFS stop counts with OpenCity shelter points inside each ward."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] uppercase text-[var(--ink-muted)]">Wards with a shelter gap</p>
          <p className="mt-1 text-2xl text-[var(--yellow)]">
            {smm?.counts?.mismatch_wards ?? wards.length}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            Have stops, but shelters are scarce relative to stops
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] uppercase text-[var(--ink-muted)]">Zero-shelter wards</p>
          <p className="mt-1 text-2xl text-[var(--ink)]">
            {smm?.counts?.zero_shelter_wards ?? "—"}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            At least one GTFS stop mapped, zero shelter points
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] uppercase text-[var(--ink-muted)]">Zones with a gap</p>
          <p className="mt-1 text-2xl text-[var(--ink)]">
            {smm?.counts?.mismatch_zones ?? zones.length}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">Same logic at zone level</p>
        </div>
      </div>

      {top ? (
        <aside className="rounded-2xl border border-[var(--border)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--ink)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
            How to read a row
          </p>
          <p className="mt-1">
            Ward <strong>{top.label}</strong> has <strong>{top.stop_count}</strong> stops and{" "}
            <strong>{top.shelter_count}</strong> shelters
            {top.shelter_to_stop_ratio != null
              ? ` (${ratioPlain(top.shelter_to_stop_ratio, top.stop_count, top.shelter_count)})`
              : ""}
            . Shelter gap score <strong>{top.mismatch_score}</strong> means{" "}
            {gapLabel(top.mismatch_score).plain.toLowerCase()}. Higher score = worse gap.
          </p>
        </aside>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Priority wards — largest shelter gaps
          </h2>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            Sorted by shelter gap score (higher = more urgent to field-check for weather protection).
          </p>
        </div>
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[rgba(10,31,74,0.96)] text-[10px] uppercase text-[var(--ink-muted)]">
              <tr>
                <th className="px-3 py-2">Ward</th>
                <th className="px-3 py-2">Stops</th>
                <th className="px-3 py-2">Shelters</th>
                <th className="px-3 py-2">What that means</th>
                <th className="px-3 py-2">Shelter gap</th>
                <th className="px-3 py-2">Severity</th>
              </tr>
            </thead>
            <tbody>
              {wards.map((w) => {
                const g = gapLabel(w.mismatch_score);
                return (
                  <tr key={String(w.id ?? w.label)} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 font-medium text-[var(--ink)]">{w.label}</td>
                    <td className="px-3 py-2">{w.stop_count}</td>
                    <td className="px-3 py-2">{w.shelter_count}</td>
                    <td className="px-3 py-2 text-xs text-[var(--ink-muted)]">
                      {ratioPlain(w.shelter_to_stop_ratio, w.stop_count, w.shelter_count)}
                    </td>
                    <td className="px-3 py-2 font-semibold text-[var(--yellow)]">
                      {w.mismatch_score}
                      <span className="ml-1 text-[10px] font-normal text-[var(--ink-muted)]">
                        / 100
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-xs font-semibold ${g.color}`}>
                      {g.band}
                      <span className="mt-0.5 block font-normal text-[var(--ink-muted)]">
                        {g.plain}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!wards.length ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[var(--ink-muted)]">
                    Shelter gap table not loaded.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {zones.length ? (
        <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Priority zones
            </h2>
          </div>
          <div className="max-h-[280px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-[rgba(10,31,74,0.96)] text-[10px] uppercase text-[var(--ink-muted)]">
                <tr>
                  <th className="px-3 py-2">Zone</th>
                  <th className="px-3 py-2">Stops</th>
                  <th className="px-3 py-2">Shelters</th>
                  <th className="px-3 py-2">Shelter gap</th>
                  <th className="px-3 py-2">Severity</th>
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => {
                  const g = gapLabel(z.mismatch_score);
                  return (
                    <tr key={String(z.id ?? z.label)} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2 font-medium">{z.label}</td>
                      <td className="px-3 py-2">{z.stop_count}</td>
                      <td className="px-3 py-2">{z.shelter_count}</td>
                      <td className="px-3 py-2 text-[var(--yellow)]">{z.mismatch_score}</td>
                      <td className={`px-3 py-2 text-xs font-semibold ${g.color}`}>{g.band}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
          Map — stop inventory &amp; gap wards
        </h2>
        <Suspense
          fallback={
            <div className="flex h-[520px] items-center justify-center rounded-xl border border-[var(--border)] text-sm text-[var(--ink-muted)]">
              Loading map…
            </div>
          }
        >
          <MapExplorerClient
            initialPreset="serve"
            audience="planner"
            audienceNote="Stops vs shelters — ward gap colours show inventory stress; use Layers for stops."
          />
        </Suspense>
      </section>

      <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 sm:p-5">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
            How the shelter gap score is calculated
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Score is 0–100. <strong className="text-[var(--ink)]">Higher = worse</strong> (more
            stops relative to mapped shelters). Only wards/zones with at least one GTFS stop are
            scored. Units with a healthy shelter share (ratio ≥ 0.4) are omitted from this list.
          </p>
        </div>

        <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--ink-muted)]">
          <li>
            Count <strong className="text-[var(--ink)]">stops</strong> (GTFS points) and{" "}
            <strong className="text-[var(--ink)]">shelters</strong> (OpenCity KML points) inside
            each GCC ward / zone.
          </li>
          <li>
            Compute ratio = shelters ÷ stops. Example: 2 shelters and 20 stops → ratio 0.10 (1
            shelter per 10 stops).
          </li>
          <li>Assign a shelter gap score from that ratio (see table below).</li>
        </ol>

        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[rgba(10,31,74,0.7)] text-[10px] uppercase text-[var(--ink-muted)]">
              <tr>
                <th className="px-3 py-2">Condition</th>
                <th className="px-3 py-2">Shelter gap score</th>
                <th className="px-3 py-2">Plain meaning</th>
              </tr>
            </thead>
            <tbody className="text-[var(--ink-muted)]">
              <tr className="border-t border-[var(--border)]">
                <td className="px-3 py-2">0 shelters (any stop count)</td>
                <td className="px-3 py-2 text-[var(--yellow)]">55 + min(stops, 40)</td>
                <td className="px-3 py-2">
                  Critical — more stops push the score up (capped near 95)
                </td>
              </tr>
              <tr className="border-t border-[var(--border)]">
                <td className="px-3 py-2">Ratio &lt; 0.08</td>
                <td className="px-3 py-2 text-[var(--yellow)]">70</td>
                <td className="px-3 py-2">Fewer than ~1 shelter per 12 stops</td>
              </tr>
              <tr className="border-t border-[var(--border)]">
                <td className="px-3 py-2">Ratio &lt; 0.15</td>
                <td className="px-3 py-2 text-[var(--yellow)]">55</td>
                <td className="px-3 py-2">Fewer than ~1 shelter per 7 stops</td>
              </tr>
              <tr className="border-t border-[var(--border)]">
                <td className="px-3 py-2">Ratio &lt; 0.25</td>
                <td className="px-3 py-2 text-[var(--yellow)]">40</td>
                <td className="px-3 py-2">Fewer than 1 shelter per 4 stops</td>
              </tr>
              <tr className="border-t border-[var(--border)]">
                <td className="px-3 py-2">Ratio &lt; 0.40</td>
                <td className="px-3 py-2 text-[var(--yellow)]">25</td>
                <td className="px-3 py-2">Still thin coverage — moderate gap</td>
              </tr>
              <tr className="border-t border-[var(--border)]">
                <td className="px-3 py-2">Ratio ≥ 0.40</td>
                <td className="px-3 py-2">Not listed</td>
                <td className="px-3 py-2">Treated as adequate for this inventory screen</td>
              </tr>
            </tbody>
          </table>
        </div>

        <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ink-muted)]">
          <li>Not ridership, boarding counts, or passenger comfort surveys.</li>
          <li>
            Shelter layer is presence-only and may be incomplete — always field-audit before capital
            works.
          </li>
          <li>
            This is <em>not</em> the ward Gap Index (that mixes stops, shelters, hubs, density, and
            walk).
          </li>
        </ul>

        <div className="border-t border-[var(--border)] pt-4">
          <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-[var(--ink)]">
            Data sources
          </h3>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            Layers used on this page. Full catalog on{" "}
            <Link href="/sources" className="font-semibold text-[var(--accent)] hover:underline">
              Sources
            </Link>
            .
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            <SourceRow
              name={sources.stops?.name ?? "Chennai Unified GTFS (stops)"}
              publisher={sources.stops?.publisher}
              portal={sources.stops?.portal ?? "https://github.com/ungalsoththu/ChennaiGTFS"}
              notes={
                sources.stops?.notes ??
                "Unofficial community GTFS — stop points counted per ward."
              }
              status={sources.stops?.status}
            />
            <SourceRow
              name={sources.shelters?.name ?? "Chennai Bus Shelters"}
              publisher={sources.shelters?.publisher}
              portal={
                sources.shelters?.portal ??
                "https://data.opencity.in/dataset/chennai-bus-shelters"
              }
              notes={
                sources.shelters?.notes ??
                "Presence of shelters; not a complete stop inventory."
              }
              status={sources.shelters?.status}
            />
            <SourceRow
              name={sources.wards?.name ?? "GCC Wards 2022"}
              publisher={sources.wards?.publisher}
              portal={sources.wards?.portal}
              notes="Ward polygons for counting stops and shelters."
              status={sources.wards?.status}
            />
            <SourceRow
              name={sources.zones?.name ?? "GCC Zones 2022"}
              publisher={sources.zones?.publisher}
              portal={sources.zones?.portal}
              notes="Zone polygons for the zone table."
              status={sources.zones?.status}
            />
          </ul>
        </div>
      </section>
    </div>
  );
}
