"use client";

/** Lightweight horizontal bar chart — no chart library dependency. */
export function SimpleBarChart({
  items,
  valueKey = "count",
  labelKey = "label",
  maxValue,
  formatValue,
}: {
  items: Record<string, unknown>[];
  valueKey?: string;
  labelKey?: string;
  maxValue?: number;
  formatValue?: (n: number) => string;
}) {
  const values = items
    .map((it) => Number(it[valueKey]))
    .filter((n) => Number.isFinite(n));
  const max = maxValue ?? Math.max(1, ...values);

  if (!items.length) {
    return <p className="text-sm text-[var(--ink-muted)]">No chart data.</p>;
  }

  return (
    <ul className="space-y-2.5">
      {items.map((it, idx) => {
        const raw = Number(it[valueKey]);
        const label = String(it[labelKey] ?? it.band ?? it.destination ?? `#${idx + 1}`);
        const color = typeof it.color === "string" ? it.color : "var(--accent)";
        const ok = Number.isFinite(raw);
        const pct = ok ? Math.max(2, Math.round((raw / max) * 100)) : 0;
        return (
          <li key={`${label}-${idx}`}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-[var(--ink)]">{label}</span>
              <span className="tabular-nums text-[var(--ink-muted)]">
                {ok ? (formatValue ? formatValue(raw) : raw.toLocaleString()) : "—"}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full transition-[width]"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Schools / healthcare access — primary threshold 100m. */
export function DualPctChart({
  items,
}: {
  items: {
    destination?: string;
    pct_within_100m?: number | null;
    pct_within_500m?: number | null;
    pct_over_100m?: number | null;
    /** legacy fallbacks */
    pct_within_1000m?: number | null;
    pct_over_1000m?: number | null;
    total?: number | null;
    within_100m?: number | null;
    over_100m?: number | null;
  }[];
}) {
  return (
    <div className="space-y-4">
      {items.map((it) => {
        const within100 = it.pct_within_100m ?? null;
        const within500 = it.pct_within_500m ?? it.pct_within_1000m ?? null;
        const over100 = it.pct_over_100m ?? it.pct_over_1000m ?? null;
        return (
          <div key={it.destination}>
            <p className="mb-1.5 text-sm font-semibold text-[var(--ink)]">
              {it.destination}{" "}
              <span className="font-normal text-[var(--ink-muted)]">
                ({it.total?.toLocaleString() ?? "—"} points · primary ≤100m)
              </span>
            </p>
            <SimpleBarChart
              items={[
                {
                  label: "Within 100m of a stop",
                  count: within100 ?? 0,
                  color: "#86efac",
                },
                {
                  label: "Within 500m (context)",
                  count: within500 ?? 0,
                  color: "#fde047",
                },
                {
                  label: "Over 100m (gap)",
                  count: over100 ?? 0,
                  color: "#dc2626",
                },
              ]}
              maxValue={100}
              formatValue={(n) => `${n}%`}
            />
            {it.over_100m != null ? (
              <p className="mt-1.5 text-xs text-[var(--ink-muted)]">
                {it.over_100m.toLocaleString()} sites beyond 100m
                {it.within_100m != null
                  ? ` · ${it.within_100m.toLocaleString()} within 100m`
                  : ""}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
