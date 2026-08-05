"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { RealtimeHealth } from "@/lib/realtime";

export function RealtimePanel() {
  const [health, setHealth] = useState<RealtimeHealth[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/realtime");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { feeds: RealtimeHealth[] };
        if (!cancelled) setHealth(data.feeds);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to probe feeds");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="et-card border-dashed p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
          Real-time connectors
        </h2>
        <StatusBadge status="not_connected" />
      </div>
      <p className="mb-4 text-sm text-[var(--ink-muted)]">
        Live arrivals, vehicle positions, and crowding improve traffic coordination and
        reliability analysis — only when an official feed is plugged in. Until then these
        panels stay <strong className="text-[var(--ink)]">Not connected</strong>. No simulated live data is shown.
      </p>
      {error ? (
        <p className="text-sm text-[var(--danger)]">{error}</p>
      ) : null}
      <ul className="space-y-3">
        {(health ?? []).map((feed) => (
          <li
            key={feed.id}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium text-sm text-[var(--ink)]">{feed.id.replaceAll("_", " ")}</span>
              <StatusBadge
                status={
                  feed.status === "connected"
                    ? "loaded"
                    : feed.status === "error"
                      ? "unavailable"
                      : "not_connected"
                }
              />
            </div>
            <p className="text-sm text-[var(--ink-muted)]">{feed.message}</p>
          </li>
        ))}
        {!health && !error ? (
          <li className="text-sm text-[var(--ink-muted)]">Checking connector status…</li>
        ) : null}
      </ul>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-[var(--ink-muted)]">
        <li>Bus/metro arrival reliability and delay heatmaps</li>
        <li>Live vehicle positions for hub / corridor coordination</li>
        <li>Station crowding and incident alerts</li>
      </ul>
    </section>
  );
}
