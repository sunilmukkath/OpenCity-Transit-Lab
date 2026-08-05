import { StatusBadge } from "@/components/StatusBadge";

export function MetricCard({
  label,
  value,
  subtext,
  unavailableReason,
}: {
  label: string;
  value?: string | number | null;
  subtext?: string;
  unavailableReason?: string;
}) {
  const unavailable = value === null || value === undefined || value === "";

  return (
    <div className="et-card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
          {label}
        </p>
        {unavailable && <StatusBadge status="unavailable" />}
      </div>
      {unavailable ? (
        <>
          <p className="font-[family-name:var(--font-display)] text-2xl text-[var(--ink-muted)]">
            —
          </p>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {unavailableReason ?? "Not shown — backing data not loaded. See Data Sources."}
          </p>
        </>
      ) : (
        <>
          <p className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--yellow)]">
            {value}
          </p>
          {subtext ? (
            <p className="mt-2 text-sm text-[var(--ink-muted)]">{subtext}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
