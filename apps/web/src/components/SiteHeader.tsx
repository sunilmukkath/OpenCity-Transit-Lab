"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/analytics", label: "Analytics" },
  { href: "/map", label: "Map" },
  { href: "/wards", label: "Wards" },
  { href: "/explore", label: "Explore" },
  { href: "/sources", label: "Data Sources" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="no-print border-b border-[var(--border)] bg-[rgba(10,31,74,0.92)] backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/" className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-[var(--yellow)]">
            OpenCity Transit Lab
          </Link>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            Chennai last-mile decision support · verified open data only
          </p>
        </div>
        <nav className="flex flex-wrap gap-1" aria-label="Primary">
          {LINKS.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--accent)] text-[var(--void)]"
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
