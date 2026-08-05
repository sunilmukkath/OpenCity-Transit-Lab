"use client";

const LAYERS = [
  "GCC wards 2022",
  "GCC zones",
  "ChennaiGTFS stops",
  "Bus shelters",
  "MRTS lines",
  "MRTS stations",
  "Rail hubs",
  "400m catchments",
  "800m catchments",
  "Gap Index",
  "Ward reports",
  "Zone reports",
];

export function LayerMarquee() {
  const row = [...LAYERS, ...LAYERS];
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[rgba(16,52,102,0.55)] py-3">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[var(--bg-card)] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[var(--bg-card)] to-transparent" />
      <div className="et-marquee flex w-max gap-3">
        {row.map((label, i) => (
          <span
            key={`${label}-${i}`}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--border)] bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-muted)]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
