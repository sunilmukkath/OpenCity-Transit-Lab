"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import {
  DashboardFilterBar,
  useEnrichedUniverse,
  useFilteredUniverse,
} from "@/components/DashboardFilterBar";
import { RealtimePanel } from "@/components/RealtimePanel";
import { StatusBadge } from "@/components/StatusBadge";
import { SectionEyebrow } from "@/components/BrandMotif";
import { useDashboardFilters, useFilterHref } from "@/hooks/useDashboardFilters";
import { hubById, type HubId } from "@/lib/hubs";
import { fetchAnalysesClient, fetchJson, fetchManifestClient } from "@/lib/data-client";
import type { AdvancedAnalyses } from "@/lib/types";
import type { ObjectivesAnalysis } from "@/lib/objectives-types";

function gapPlain(band: string | null | undefined): string {
  switch (band) {
    case "severe":
      return "very thin stop and shelter coverage";
    case "high":
      return "below-average stop and shelter coverage";
    case "moderate":
      return "middling stop and shelter coverage";
    case "low":
      return "relatively dense stop inventory";
    default:
      return "mixed coverage";
  }
}

function CitizenHub() {
  const [filters, setFilters] = useDashboardFilters({ unit: "ward" });
  const href = useFilterHref();
  const { loading, filtered, wardOptions, zoneOptions, all } = useFilteredUniverse(filters);
  const [walkNote, setWalkNote] = useState<string | null>(null);
  const [popNote, setPopNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [a, pop] = await Promise.all([
        fetchAnalysesClient(),
        fetchJson<{
          status?: string;
          city?: { pct_pop_within_400m?: number; population_joined?: number };
          note?: string;
          wards?: { label: string; est_pop_within_400m?: number | null; population_2011?: number | null }[];
        }>("/data/pop_access.json"),
      ]);
      if (cancelled) return;
      const walk = a?.walk_distance_bands as
        | {
            study?: { pct_within_100m?: number; pct_over_1000m?: number };
            counts?: { pct_within_100m?: number; pct_over_1000m?: number };
          }
        | undefined;
      const study = walk?.study ?? walk?.counts;
      if (study?.pct_within_100m != null) {
        setWalkNote(
          `About ${study.pct_within_100m.toFixed(1)}% of the study area is within 100m of a stop or hub (crow-flies). ${
            study.pct_over_1000m != null
              ? `${study.pct_over_1000m.toFixed(1)}% is more than 1km away.`
              : ""
          }`
        );
      }
      if (pop?.city?.pct_pop_within_400m != null) {
        setPopNote(
          `Among Census 2011 population joined to wards (~${(
            pop.city.population_joined ?? 0
          ).toLocaleString()} people), an estimated ${pop.city.pct_pop_within_400m}% live in areas within 400m of a stop (area-share method — Partial).`
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const unit = filtered[0] ?? null;
  const picked = Boolean(filters.ward || filters.zone);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <SectionEyebrow>Citizen</SectionEyebrow>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow)] sm:text-4xl">
          Is my neighbourhood poorly served?
        </h1>
        <p className="max-w-2xl text-[var(--ink-muted)]">
          Pick a ward or zone. We summarise inventory evidence in plain language — not a trip
          planner, and not an official live feed.
        </p>
      </header>

      <DashboardFilterBar
        filters={filters}
        onChange={setFilters}
        wardOptions={wardOptions}
        zoneOptions={zoneOptions}
        resultCount={filtered.length}
        compact
      />

      {loading ? (
        <p className="text-sm text-[var(--ink-muted)]">Loading wards…</p>
      ) : picked && unit ? (
        <section className="et-fade-up space-y-4 rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,rgba(16,52,102,0.9),rgba(8,13,26,1))] p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--yellow)]">
            Your area · {unit.unit_type === "zone" ? "Zone" : "Ward"} {unit.label}
          </p>
          <p className="text-lg text-[var(--ink)]">
            This area shows <strong className="text-[var(--yellow)]">{gapPlain(String(unit.gap_band))}</strong>
            {unit.stop_count != null ? (
              <>
                {" "}
                — about <strong>{unit.stop_count}</strong> mapped transit stops
                {unit.shelter_count != null ? (
                  <>
                    {" "}
                    and <strong>{unit.shelter_count}</strong> shelters
                  </>
                ) : null}
                .
              </>
            ) : (
              "."
            )}
          </p>
          <ul className="space-y-2 text-sm text-[var(--ink-muted)]">
            <li>
              Service band:{" "}
              <span className="font-semibold text-[var(--ink)]">{String(unit.gap_band)}</span>{" "}
              (inventory Gap Index {unit.gap_index ?? "—"} — stop/shelter/hub counts only, not
              ridership).
            </li>
            {unit.unit_type === "ward" ? (
              <li>
                Slum polygon overlap:{" "}
                {unit.has_slum
                  ? unit.pct_slum_area != null
                    ? `yes (~${unit.pct_slum_area.toFixed(1)}% of ward area)`
                    : "yes"
                  : "no mapped slum polygons inside this ward"}
                .
              </li>
            ) : null}
            {walkNote ? <li>{walkNote}</li> : null}
            {popNote ? <li>{popNote}</li> : null}
          </ul>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href={href(`/map?audience=citizen&preset=destinations&ward=${encodeURIComponent(filters.ward || "")}&zone=${encodeURIComponent(filters.zone || "")}`)}
              className="et-btn-primary"
            >
              See on map →
            </Link>
            <Link href={href("/sources")} className="et-btn-ghost">
              Data sources
            </Link>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-sm text-[var(--ink-muted)]">
          Choose a ward or zone above to get a short brief. Citywide there are{" "}
          {all.filter((u) => u.unit_type === "ward").length} GCC wards in the inventory.
        </section>
      )}
    </div>
  );
}

function PlannerHub() {
  const href = useFilterHref();
  const [filters, setFilters] = useDashboardFilters({
    unit: "ward",
    gapBand: "severe",
  });
  const { loading, filtered, wardOptions, zoneOptions, cityMeanGap } =
    useFilteredUniverse(filters);
  const [recs, setRecs] = useState<ObjectivesAnalysis | null>(null);

  useEffect(() => {
    let c = false;
    fetchJson<ObjectivesAnalysis>("/data/objectives_analysis.json").then((d) => {
      if (!c) setRecs(d);
    });
    return () => {
      c = true;
    };
  }, []);

  const top = filtered.slice(0, 8);
  const actions = (recs?.recommendations ?? []).slice(0, 5);
  const evidence = (recs?.objectives ?? [])
    .filter((o) => o.status === "loaded" || o.status === "partial")
    .slice(0, 4);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <SectionEyebrow>Planner</SectionEyebrow>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow)] sm:text-4xl">
          Where should we intervene?
        </h1>
        <p className="max-w-2xl text-[var(--ink-muted)]">
          Filter severe-gap areas, review priority actions, then open the map. Everything for
          planning is on this page.
        </p>
      </header>

      <DashboardFilterBar
        filters={filters}
        onChange={setFilters}
        wardOptions={wardOptions}
        zoneOptions={zoneOptions}
        resultCount={filtered.length}
        compact
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">City mean Gap</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--yellow)]">
            {cityMeanGap ?? "—"}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">In filter</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
            {loading ? "…" : filtered.length}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">Priority actions</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[var(--ink)]">
            {recs?.recommendations?.length ?? "—"}
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
            Top areas in the current slice
          </h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] uppercase text-[var(--ink-muted)]">
            <tr>
              <th className="px-3 py-2">Unit</th>
              <th className="px-3 py-2">Gap</th>
              <th className="px-3 py-2">Stops</th>
              <th className="px-3 py-2">Slum</th>
            </tr>
          </thead>
          <tbody>
            {top.map((u) => (
              <tr key={`${u.unit_type}:${u.label}`} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 font-medium">
                  {u.unit_type === "zone" ? "Zone" : "Ward"} {u.label}
                </td>
                <td className="px-3 py-2 text-[var(--yellow)]">{u.gap_index ?? "—"}</td>
                <td className="px-3 py-2">{u.stop_count ?? "—"}</td>
                <td className="px-3 py-2 text-[var(--ink-muted)]">
                  {u.unit_type !== "ward"
                    ? "—"
                    : u.has_slum
                      ? "Slum"
                      : "Non-slum"}
                </td>
              </tr>
            ))}
            {!top.length ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-[var(--ink-muted)]">
                  No areas match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {actions.length ? (
        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
            Priority actions
          </h2>
          <ul className="space-y-2">
            {actions.map((a, i) => (
              <li
                key={i}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm"
              >
                <p className="font-semibold text-[var(--ink)]">{a.title}</p>
                {a.detail ? (
                  <p className="mt-1 text-[var(--ink-muted)]">{a.detail}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {evidence.length ? (
        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
            Evidence snapshot
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {evidence.map((o) => (
              <article
                key={o.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <StatusBadge status={o.status} />
                  <h3 className="text-sm font-semibold text-[var(--ink)]">{o.title}</h3>
                </div>
                <p className="text-sm text-[var(--ink-muted)]">
                  {o.summary ?? o.reason ?? "Loaded from verified layers."}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <Link href={href("/map?audience=planner&preset=serve")} className="et-btn-primary inline-flex">
        Open map for this slice →
      </Link>
    </div>
  );
}

function OperatorHub() {
  const href = useFilterHref();
  const [analyses, setAnalyses] = useState<AdvancedAnalyses | null>(null);

  useEffect(() => {
    let c = false;
    fetchAnalysesClient().then((a) => {
      if (!c) setAnalyses(a);
    });
    return () => {
      c = true;
    };
  }, []);

  const hubs = analyses?.hub_last_mile?.priority_hubs?.slice(0, 10) ?? [];
  const shelters = analyses?.shelter_mismatch?.priority_wards?.slice(0, 8) ?? [];
  const need = analyses?.connectivity_need?.corridors?.slice(0, 6) ?? [];

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <SectionEyebrow>Operator</SectionEyebrow>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow)] sm:text-4xl">
          Where do feeders fail at hubs?
        </h1>
        <p className="max-w-2xl text-[var(--ink-muted)]">
          Weak last-mile hubs, shelter mismatches, and roads far from stops. Live vehicle
          positions stay Not connected until an agency feed is plugged in.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Weak last-mile hubs
            </h2>
            <StatusBadge status={analyses?.hub_last_mile?.status ?? "unavailable"} />
          </div>
          <ul className="space-y-2 text-sm">
            {hubs.map((h) => (
              <li
                key={String(h.id ?? h.label)}
                className="flex justify-between gap-2 border-t border-[var(--border)] pt-2"
              >
                <span className="font-medium text-[var(--ink)]">{h.label}</span>
                <span className="text-[var(--ink-muted)]">
                  {h.nearest_stop_m != null ? `${Math.round(h.nearest_stop_m)}m` : "—"} · score{" "}
                  {h.last_mile_score ?? "—"}
                </span>
              </li>
            ))}
            {!hubs.length ? (
              <li className="text-[var(--ink-muted)]">No hub last-mile table loaded.</li>
            ) : null}
          </ul>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              Shelter mismatch wards
            </h2>
            <StatusBadge status={analyses?.shelter_mismatch?.status ?? "unavailable"} />
          </div>
          <ul className="space-y-2 text-sm">
            {shelters.map((w) => (
              <li
                key={String(w.id ?? w.label)}
                className="flex justify-between gap-2 border-t border-[var(--border)] pt-2"
              >
                <span className="font-medium">Ward {w.label}</span>
                <span className="text-[var(--ink-muted)]">
                  {w.stop_count ?? 0} stops · {w.shelter_count ?? 0} shelters
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-lg font-semibold">
          Need-line corridors
        </h2>
        <ul className="space-y-2 text-sm">
          {need.map((c) => (
            <li
              key={`${c.rank}-${c.road_name}`}
              className="border-t border-[var(--border)] pt-2 text-[var(--ink-muted)]"
            >
              <span className="font-medium text-[var(--ink)]">{c.road_name}</span>
              {c.need_band ? ` · ${c.need_band}` : ""}
              {c.unmet_length_m != null
                ? ` · ~${Math.round(c.unmet_length_m)}m unmet`
                : ""}
            </li>
          ))}
          {!need.length ? (
            <li className="text-[var(--ink-muted)]">Connectivity need layer not summarised.</li>
          ) : null}
        </ul>
        <Link
          href={href("/map?audience=hubs&preset=hubs")}
          className="et-btn-primary mt-4 inline-flex"
        >
          Open hub map →
        </Link>
      </section>

      <RealtimePanel />
    </div>
  );
}

function PressHub() {
  const href = useFilterHref();
  const [analyses, setAnalyses] = useState<AdvancedAnalyses | null>(null);
  const [manifestAt, setManifestAt] = useState<string | null>(null);
  const { wards } = useEnrichedUniverse();

  useEffect(() => {
    let c = false;
    (async () => {
      const [a, m] = await Promise.all([fetchAnalysesClient(), fetchManifestClient()]);
      if (c) return;
      setAnalyses(a);
      setManifestAt(m?.generated_at ?? null);
    })();
    return () => {
      c = true;
    };
  }, []);

  const sec = analyses?.sec_proxy;
  const withSlum = wards.filter((w) => w.has_slum);
  const noSlum = wards.filter((w) => !w.has_slum);
  const meanPt = (list: typeof wards) => {
    const pts = list.map((w) => w.pt_index).filter((n): n is number => n != null);
    if (!pts.length) return null;
    return Math.round((pts.reduce((s, n) => s + n, 0) / pts.length) * 10) / 10;
  };

  const downloadCitation = () => {
    const lines = [
      "OpenCity Transit Lab — citation pack",
      `Generated from manifest: ${manifestAt ?? "unknown"}`,
      "",
      "Integrity: No fabricated equity or ridership scores. Slum = OpenCity polygon area share, not income.",
      "",
      `Wards with mapped slum polygons: ${sec?.counts?.wards_with_slum ?? withSlum.length}`,
      `Wards without: ${noSlum.length}`,
      `Mean PT index (slum wards): ${meanPt(withSlum) ?? "n/a"}`,
      `Mean PT index (non-slum wards): ${meanPt(noSlum) ?? "n/a"}`,
      "",
      "Sources portal: /sources",
      "OpenCity CKAN: https://data.opencity.in/",
      "Methodology: Gap Index = inventory rules (stops/shelters/hubs), not census equity.",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "opencity_transit_lab_citation.txt";
    a.click();
    URL.revokeObjectURL(url);

    const csv = [
      "ward,has_slum,pct_slum_area,pt_index,gap_index,establishments",
      ...wards.map(
        (w) =>
          `"${w.label}",${w.has_slum ? 1 : 0},${w.pct_slum_area ?? ""},${w.pt_index ?? ""},${w.gap_index ?? ""},${w.establishments ?? ""}`
      ),
    ].join("\n");
    const blob2 = new Blob([csv], { type: "text/csv" });
    const url2 = URL.createObjectURL(blob2);
    const a2 = document.createElement("a");
    a2.href = url2;
    a2.download = "opencity_ward_slum_pt.csv";
    a2.click();
    URL.revokeObjectURL(url2);
  };

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <SectionEyebrow>Press / NGO</SectionEyebrow>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow)] sm:text-4xl">
          What can I cite with provenance?
        </h1>
        <p className="max-w-2xl text-[var(--ink-muted)]">
          Slum vs non-slum facts from OpenCity polygons and inventory PT index. Not household
          income. Download a citation pack and verify layers on Sources.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] uppercase text-[var(--ink-muted)]">Slum wards</p>
          <p className="mt-1 text-2xl text-[var(--yellow)]">
            {sec?.counts?.wards_with_slum ?? withSlum.length}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] uppercase text-[var(--ink-muted)]">Non-slum wards</p>
          <p className="mt-1 text-2xl text-[var(--ink)]">{noSlum.length}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] uppercase text-[var(--ink-muted)]">Mean PT · slum</p>
          <p className="mt-1 text-2xl text-[var(--ink)]">{meanPt(withSlum) ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] uppercase text-[var(--ink-muted)]">Mean PT · non-slum</p>
          <p className="mt-1 text-2xl text-[var(--ink)]">{meanPt(noSlum) ?? "—"}</p>
        </div>
      </div>

      <p className="text-sm text-[var(--ink-muted)]">
        Status: <StatusBadge status={sec?.status ?? "partial"} /> — amenity joins cover{" "}
        {sec?.counts?.wards_amenity_joined ?? "—"} of 200 wards (Census 2011 HH-14); slum share
        from mapped polygons only.
      </p>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={downloadCitation} className="et-btn-primary">
          Download citation pack (TXT + CSV)
        </button>
        <Link href={href("/map?audience=equity&preset=slum")} className="et-btn-ghost">
          Equity map
        </Link>
        <Link href={href("/sources")} className="et-btn-ghost">
          Sources
        </Link>
      </div>
    </div>
  );
}

function HubBody({ id }: { id: HubId }) {
  switch (id) {
    case "citizen":
      return <CitizenHub />;
    case "planner":
      return <PlannerHub />;
    case "operator":
      return <OperatorHub />;
    case "press":
      return <PressHub />;
    default:
      return null;
  }
}

export function HubPage({ id }: { id: HubId }) {
  const hub = hubById(id);
  if (!hub) {
    return (
      <p className="text-[var(--danger)]">
        Unknown hub. <Link href="/">Back home</Link>
      </p>
    );
  }
  return (
    <Suspense fallback={<p className="text-sm text-[var(--ink-muted)]">Loading hub…</p>}>
      <HubBody id={id} />
    </Suspense>
  );
}
