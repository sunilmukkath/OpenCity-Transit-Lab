/* Shared visual motifs for the dark navy spectrum system — no third-party brand names. */

import type { ReactNode } from "react";

export function SpectrumOrbs({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute -left-24 -top-28 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.28),transparent_68%)] blur-2xl" />
      <div className="absolute -right-20 top-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(139,92,246,0.22),transparent_70%)] blur-2xl" />
      <div className="absolute bottom-[-4rem] left-1/3 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.18),transparent_70%)] blur-2xl" />
    </div>
  );
}

export function SpectrumRule({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`h-px w-full bg-[linear-gradient(90deg,transparent,rgba(56,189,248,0.55),rgba(139,92,246,0.7),rgba(45,212,191,0.55),transparent)] ${className}`}
    />
  );
}

export function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--yellow)]">
      {children}
    </p>
  );
}
