import { StatusBadge } from "@/components/StatusBadge";
import { ProvenanceStrip } from "@/components/ProvenanceStrip";
import { fetchManifest } from "@/lib/data";
import type { ManifestSource } from "@/lib/types";

const CATEGORY_ORDER = [
  "Basic Maps",
  "Public transport",
  "Amenities and Destinations",
  "Socio-economic",
  "Dashboards",
  "Servers",
  "Satellite data",
  "Uncategorized",
  "Platform (core pipeline)",
];

function groupSources(sources: ManifestSource[]) {
  const groups = new Map<string, ManifestSource[]>();
  const skipped: ManifestSource[] = [];
  for (const src of sources) {
    const cat = src.jam_catalog
      ? src.category || "Uncategorized"
      : "Platform (core pipeline)";
    // Hide satellite / greenery catalog noise from primary view
    if (
      cat === "Satellite data" ||
      src.ui_group === "not_used_satellite" ||
      /bhuvan|gee-community|earth-engine|globalforestwatch|modis|dynamic.?world/i.test(
        `${src.url || ""} ${src.name || ""}`
      )
    ) {
      skipped.push(src);
      continue;
    }
    // Prefer loaded / partial / link / not_connected with portal; demote pure unavailable without portal
    const list = groups.get(cat) ?? [];
    list.push(src);
    groups.set(cat, list);
  }
  return {
    grouped: CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({
      category: c,
      items: groups.get(c)!,
    })),
    skipped,
  };
}

export default async function SourcesPage() {
  const manifest = await fetchManifest();
  const allSources = manifest ? Object.values(manifest.sources) : [];
  const { grouped, skipped } = groupSources(allSources);
  const jamNote = manifest?.jam_catalog?.note;
  const jamCount = manifest?.jam_catalog?.count;

  return (
    <div className="space-y-8">
      <header className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,rgba(16,52,102,0.9),rgba(10,31,74,0.96))] px-6 py-7 sm:px-8 space-y-2">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(56,189,248,0.55),rgba(139,92,246,0.7),rgba(45,212,191,0.55),transparent)]"
        />
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--yellow)]">
          Catalog
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow-bright)]">
          Data Sources
        </h1>
        <p className="max-w-3xl text-[var(--ink-muted)]">
          First-class catalog of every dataset behind this platform. Status badges reflect
          what the ETL actually loaded — not aspirational coverage. Real-time connectors
          stay Not connected until an agency feed is plugged in.
        </p>
        {jamNote ? (
          <p className="max-w-3xl text-sm text-[var(--accent)]">
            {jamNote}
            {jamCount != null ? ` · ${jamCount} Sheet 2 entries.` : null}
          </p>
        ) : null}
        {manifest ? (
          <ProvenanceStrip
            source={manifest.platform}
            fetchedAt={manifest.generated_at}
          />
        ) : (
          <p className="text-sm text-[var(--danger)]">
            Manifest missing. Run the ETL pipeline to populate this page.
          </p>
        )}
      </header>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          Integrity rule
        </h2>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          {manifest?.integrity_rule ??
            "No fabricated metrics. Unavailable or not_connected when data is missing."}
        </p>
        <p className="mt-2 text-xs text-[var(--ink-muted)]">
          Dashboards are listed as Not connected (open the Portal link). Satellite / greenery
          catalog rows are collapsed below — they are not used in PT analyses.
        </p>
      </section>

      {grouped.map(({ category, items }) => {
        const visible = items.filter(
          (src) =>
            src.status === "loaded" ||
            src.status === "partial" ||
            Boolean(src.portal || src.url)
        );
        if (!visible.length) return null;
        return (
        <section key={category}>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl font-semibold">
            {category}
            <span className="ml-2 text-sm font-normal text-[var(--ink-muted)]">
              ({visible.length})
            </span>
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {visible.map((src) => (
              <article
                key={src.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-sm"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{src.name}</h3>
                  <StatusBadge status={src.status} />
                </div>
                <p className="text-sm text-[var(--ink-muted)]">{src.publisher}</p>
                {src.notes ? (
                  <p className="mt-2 text-sm text-[var(--ink-muted)]">{src.notes}</p>
                ) : null}
                {src.error ? (
                  <p className="mt-2 text-sm text-[var(--danger)]">Error: {src.error}</p>
                ) : null}
                <dl className="mt-3 space-y-1 text-xs text-[var(--ink-muted)]">
                  <div>
                    <dt className="inline font-semibold">License: </dt>
                    <dd className="inline">{src.license ?? "See portal"}</dd>
                  </div>
                  {src.kind ? (
                    <div>
                      <dt className="inline font-semibold">Kind: </dt>
                      <dd className="inline">{src.kind}</dd>
                    </div>
                  ) : null}
                  {src.fetched_at ? (
                    <div>
                      <dt className="inline font-semibold">Fetched: </dt>
                      <dd className="inline">
                        {new Date(src.fetched_at).toLocaleString()}
                      </dd>
                    </div>
                  ) : null}
                  {src.bytes ? (
                    <div>
                      <dt className="inline font-semibold">Bytes: </dt>
                      <dd className="inline">{src.bytes.toLocaleString()}</dd>
                    </div>
                  ) : null}
                </dl>
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  {src.portal ? (
                    <a
                      href={src.portal}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[var(--accent)]"
                    >
                      Portal
                    </a>
                  ) : null}
                  {src.url && src.url !== src.portal ? (
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[var(--accent)]"
                    >
                      Download URL
                    </a>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
        );
      })}

      {skipped.length ? (
        <details className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)] p-4">
          <summary className="cursor-pointer font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink-muted)]">
            Not used in PT analyses ({skipped.length} satellite / greenery links)
          </summary>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--ink-muted)]">
            {skipped.map((s) => (
              <li key={s.id}>
                {s.name}
                {s.portal ? (
                  <>
                    {" "}
                    —{" "}
                    <a href={s.portal} className="text-[var(--accent)]" target="_blank" rel="noreferrer">
                      portal
                    </a>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <section>
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl font-semibold">
          Processed layers
        </h2>
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-white/[0.04] text-xs uppercase tracking-wide text-[var(--ink-muted)]">
              <tr>
                <th className="px-4 py-3">Layer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Features</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {manifest
                ? Object.entries(manifest.layers)
                    .filter(([, layer]) => layer.status === "loaded" || layer.status === "partial")
                    .map(([key, layer]) => (
                    <tr key={key} className="border-b border-[var(--border)]">
                      <td className="px-4 py-3 font-medium">{key}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={layer.status} />
                      </td>
                      <td className="px-4 py-3">{layer.feature_count ?? "—"}</td>
                      <td className="px-4 py-3 text-[var(--ink-muted)]">
                        {layer.notes || layer.error || "—"}
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          International last-mile references
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--ink-muted)]">
          <li>
            <strong>Singapore LTA DataMall</strong> — unified open transit catalog; we mirror
            the transparency pattern in this page.
          </li>
          <li>
            <strong>Helsinki</strong> — treat feeder / walk / cycle access to hubs as part of
            public transport planning (station colocation within ~100m).
          </li>
          <li>
            <strong>London TfL</strong> — catchment and accessibility maps for investment
            arguments; open realtime culture (aspirational for Chennai).
          </li>
          <li>
            <strong>Barcelona / Bogotá</strong> — dense feeders to trunk lines rather than
            trunk expansion alone.
          </li>
        </ul>
      </section>
    </div>
  );
}
