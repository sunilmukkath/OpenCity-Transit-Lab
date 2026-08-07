"use client";

import Link from "next/link";

/** Compact CTA used on hub landings — points back to Home chooser. */
export function DecisionCta() {
  return (
    <aside className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-5 py-4">
      <p className="text-sm text-[var(--ink-muted)]">
        Need a different view? Switch stakeholder hub from Home.
      </p>
      <Link href="/" className="et-btn-primary mt-3 inline-flex">
        Choose hub →
      </Link>
    </aside>
  );
}
