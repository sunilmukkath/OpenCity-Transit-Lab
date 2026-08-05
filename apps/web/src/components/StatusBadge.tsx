import type { LayerStatus } from "@/lib/types";
import { statusLabel } from "@/lib/types";

const STYLES: Record<LayerStatus, string> = {
  loaded: "bg-emerald-50 text-emerald-800 border-emerald-200",
  partial: "bg-amber-50 text-amber-900 border-amber-200",
  unavailable: "bg-slate-100 text-slate-600 border-slate-200",
  not_connected: "bg-slate-100 text-slate-600 border-slate-300 border-dashed",
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
