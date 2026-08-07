import Link from "next/link";
import { SpectrumOrbs, SpectrumRule } from "@/components/BrandMotif";
import { HUBS } from "@/lib/hubs";

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(145deg,rgba(16,52,102,0.96)_0%,rgba(10,31,74,0.98)_48%,rgba(8,13,26,1)_100%)] px-6 py-14 shadow-[0_24px_70px_rgba(8,13,26,0.5)] sm:px-10">
        <SpectrumOrbs />
        <SpectrumRule className="absolute inset-x-0 top-0" />
        <div className="relative z-10 max-w-3xl">
          <p className="et-fade-up text-sm font-semibold uppercase tracking-[0.16em] text-[var(--yellow)]">
            OpenCity Transit Lab
          </p>
          <h1 className="et-fade-up et-fade-up-delay-1 mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--yellow-bright)] sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
            Chennai PT evidence — pick your hub
          </h1>
          <p className="et-fade-up et-fade-up-delay-2 mt-4 text-lg text-[var(--ink-muted)]">
            One hub page answers your question. Map and Sources are the only other tools.
          </p>
        </div>
      </section>

      <section>
        <h2 className="sr-only">Choose your hub</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {HUBS.map((hub, i) => (
            <Link
              key={hub.id}
              href={hub.href}
              className={`et-fade-up group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 transition hover:border-[var(--accent)] hover:shadow-[0_16px_40px_rgba(56,189,248,0.12)] et-fade-up-delay-${Math.min(i + 1, 3)}`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--yellow)]">
                {hub.short}
              </p>
              <h3 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--ink)] group-hover:text-[var(--accent)]">
                {hub.label}
              </h3>
              <p className="mt-1 text-sm font-medium text-[var(--ink)]">{hub.job}</p>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">{hub.blurb}</p>
              <span className="mt-4 inline-block text-sm font-semibold text-[var(--accent)]">
                Open →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <p className="text-center text-sm text-[var(--ink-muted)]">
        <Link href="/map" className="text-[var(--accent)] hover:underline">
          Map
        </Link>
        {" · "}
        <Link href="/sources" className="text-[var(--accent)] hover:underline">
          Sources
        </Link>
      </p>
    </div>
  );
}
