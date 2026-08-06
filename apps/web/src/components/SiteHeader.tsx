"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SpectrumRule } from "@/components/BrandMotif";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/analytics", label: "Analytics" },
  { href: "/objectives", label: "Objectives" },
  { href: "/recommendations", label: "Insights" },
  { href: "/map", label: "Map" },
  { href: "/sources", label: "Data Sources" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header no-print sticky top-0 z-50 border-b border-[var(--border)] bg-[rgba(8,13,26,0.78)] backdrop-blur-xl">
      <SpectrumRule />
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-[var(--yellow)]"
          >
            OpenCity Transit Lab
          </Link>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            We map. We measure. We recommend.
          </p>
        </div>
        <nav className="flex flex-wrap gap-1" aria-label="Primary">
          {LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
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
    </header>
  );
}
