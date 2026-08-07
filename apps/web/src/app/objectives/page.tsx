import { Suspense } from "react";
import { ObjectivesDashboard } from "@/components/ObjectivesDashboard";

export default function ObjectivesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--ink-muted)]">Loading…</p>}>
      <ObjectivesDashboard />
    </Suspense>
  );
}
