"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LAB_FLOW, flowStepForPath } from "@/lib/lab-flow";

export function LabFlowStrip({ compact }: { compact?: boolean }) {
  const pathname = usePathname();
  const current = flowStepForPath(pathname);

  return (
    <nav
      aria-label="Lab flow"
      className={`border-b border-[var(--border)] bg-[rgba(10,31,74,0.72)] ${
        compact ? "px-3 py-2" : "px-4 py-2.5"
      }`}
    >
      <ol className="mx-auto flex max-w-7xl flex-wrap items-center gap-1.5 text-xs sm:gap-2">
        <li className="mr-1 hidden font-semibold uppercase tracking-[0.12em] text-[var(--yellow)] sm:block">
          Flow
        </li>
        {LAB_FLOW.map((item, i) => {
          const active = current === item.step;
          const done = current > item.step;
          return (
            <li key={item.href} className="flex items-center gap-1.5 sm:gap-2">
              {i > 0 ? (
                <span aria-hidden className="text-[var(--ink-subtle)]">
                  →
                </span>
              ) : null}
              <Link
                href={item.href}
                aria-current={active ? "step" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold transition ${
                  active
                    ? "border-[var(--yellow)] bg-[rgba(255,229,102,0.14)] text-[var(--yellow)]"
                    : done
                      ? "border-[var(--border)] text-[var(--accent)] hover:border-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                }`}
              >
                <span className="tabular-nums opacity-80">{item.step}</span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex items-center gap-1.5 sm:gap-2">
          <span aria-hidden className="text-[var(--ink-subtle)]">
            →
          </span>
          <Link
            href="/sources"
            className={`rounded-full border px-2.5 py-1 font-semibold ${
              pathname.startsWith("/sources")
                ? "border-[var(--yellow)] bg-[rgba(255,229,102,0.14)] text-[var(--yellow)]"
                : "border-[var(--border)] text-[var(--ink-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            }`}
          >
            Sources
          </Link>
        </li>
      </ol>
    </nav>
  );
}

export function NextFlowLink({ className }: { className?: string }) {
  const pathname = usePathname();
  const current = flowStepForPath(pathname);
  const next = LAB_FLOW.find((s) => s.step === current + 1);
  if (!next) {
    return (
      <Link href="/sources" className={className ?? "et-btn-primary"}>
        Review data sources →
      </Link>
    );
  }
  return (
    <Link href={next.href} className={className ?? "et-btn-primary"}>
      Next: {next.step}. {next.label} →
    </Link>
  );
}
