import { Suspense } from "react";
import { RecommendationsPanel } from "@/components/RecommendationsPanel";

export default function RecommendationsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--ink-muted)]">Loading…</p>}>
      <RecommendationsPanel />
    </Suspense>
  );
}
