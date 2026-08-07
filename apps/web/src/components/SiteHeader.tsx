"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { SpectrumRule } from "@/components/BrandMotif";
import { GLOBAL_NAV, HUBS, hubFromAudience, hubById } from "@/lib/hubs";
import { hrefWithFilters } from "@/lib/filter-url";

function SiteHeaderInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeHub = useMemo(() => {
    const fromPath = pathname.match(/^\/for\/([^/]+)/)?.[1];
    if (fromPath) return hubById(fromPath);
    return hubFromAudience(searchParams.get("audience"));
  }, [pathname, searchParams]);

  const withQ = (href: string) => hrefWithFilters(href, searchParams);

  return (
    <header className="site-header no-print sticky top-0 z-50 border-b border-[var(--border)] bg-[rgba(8,13,26,0.78)] backdrop-blur-xl">
      <SpectrumRule />
      <div className="mx-auto flex max-w-7xl flex-col gap-2.5 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-[var(--yellow)]"
          >
            OpenCity Transit Lab
          </Link>
          <nav className="flex flex-wrap gap-1" aria-label="Primary">
            {GLOBAL_NAV.map((link) => {
              const pathOnly = link.href.split("?")[0];
              const active =
                pathOnly === "/"
                  ? pathname === "/"
                  : pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
              return (
                <Link
                  key={link.href}
                  href={withQ(link.href)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-[linear-gradient(135deg,#38bdf8,#5eead4)] text-[var(--void)] shadow-[0_8px_22px_rgba(56,189,248,0.28)]"
                      : "text-[var(--ink-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            Hub
          </span>
          <nav className="flex flex-wrap gap-1" aria-label="Stakeholder hub">
            {HUBS.map((hub) => {
              const active = activeHub?.id === hub.id;
              return (
                <Link
                  key={hub.id}
                  href={hub.href}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                    active
                      ? "bg-[rgba(255,229,102,0.14)] text-[var(--yellow)] ring-1 ring-[var(--yellow)]"
                      : "text-[var(--ink-muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                  }`}
                >
                  {hub.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}

export function SiteHeader() {
  return (
    <Suspense
      fallback={
        <header className="site-header no-print sticky top-0 z-50 border-b border-[var(--border)] bg-[rgba(8,13,26,0.78)] backdrop-blur-xl">
          <SpectrumRule />
          <div className="mx-auto px-4 py-3.5">
            <span className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--yellow)]">
              OpenCity Transit Lab
            </span>
          </div>
        </header>
      }
    >
      <SiteHeaderInner />
    </Suspense>
  );
}
