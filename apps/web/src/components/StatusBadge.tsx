import type { LayerStatus } from "@/lib/types";
import { statusLabel } from "@/lib/types";

const STYLES: Record<LayerStatus, string> = {
  loaded:
    "bg-[rgba(45,212,191,0.14)] text-[var(--teal)] border-[rgba(45,212,191,0.35)]",
  partial:
    "bg-[rgba(232,168,32,0.14)] text-[var(--amber)] border-[rgba(232,168,32,0.35)]",
  unavailable:
    "bg-white/[0.06] text-[var(--ink-muted)] border-[var(--border)]",
  not_connected:
    "bg-white/[0.04] text-[var(--ink-muted)] border-[var(--border-strong)] border-dashed",
};

export function StatusBadge({ status }: { status: LayerStatus | string }) {
  const key = (status in STYLES ? status : "unavailable") as LayerStatus;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${STYLES[key]}`}
    >
      {statusLabel(status)}
    </span>
  );
}
