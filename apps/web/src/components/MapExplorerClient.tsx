"use client";

import dynamic from "next/dynamic";

const MapExplorer = dynamic(
  () =>
    import("@/components/MapExplorer").then((m) => ({ default: m.MapExplorer })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[620px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--map-wash)] text-sm text-[var(--ink-muted)]">
        Loading map…
      </div>
    ),
  }
);

export function MapExplorerClient({ audienceNote }: { audienceNote?: string }) {
  return <MapExplorer audienceNote={audienceNote} />;
}
