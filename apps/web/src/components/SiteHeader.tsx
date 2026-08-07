"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { SpectrumRule } from "@/components/BrandMotif";
import { PRIMARY_NAV } from "@/lib/site-nav";
import { hrefWithFilters } from "@/lib/filter-url";

function SiteHeaderInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const withQ = (href: string) => hrefWithFilters(href, searchParams);

  const links = [{ href: "/", label: "Home" }, ...PRIMARY_NAV];

  return (
    <header className="site-header no-print sticky top-0 z-50 border-b border-[var(--border)] bg-[rgba(8,13,26,0.78)] backdrop-blur-xl">
      <SpectrumRule />
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-[var(--yellow)]"
        >
          OpenCity Transit Lab
        </Link>
        <nav className="flex flex-wrap gap-1" aria-label="Primary">
          {links.map((link) => {
            const pathOnly = link.href.split("?")[0];
            const active =
              pathOnly === "/"
                ? pathname === "/"
                : pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
            return (
              <Link
                key={link.href}
                href={withQ(link.href)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
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
