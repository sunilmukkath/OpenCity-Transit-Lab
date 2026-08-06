export function MetricCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value?: string | number | null;
  subtext?: string;
  /** @deprecated Empty cards are omitted; kept for call-site compatibility. */
  unavailableReason?: string;
}) {
  if (value === null || value === undefined || value === "") return null;

  return (
    <div className="et-card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
          {label}
        </p>
      </div>
      <p className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow)]">
        {value}
      </p>
      {subtext ? <p className="mt-2 text-sm text-[var(--ink-muted)]">{subtext}</p> : null}
    </div>
  );
}
