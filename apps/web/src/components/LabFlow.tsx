"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LAB_FLOW, flowStepForPath } from "@/lib/lab-flow";

export function NextFlowLink({ className }: { className?: string }) {
  const pathname = usePathname();
  const current = flowStepForPath(pathname);
  const next = LAB_FLOW.find((s) => s.step === current + 1);
  if (!next) {
    return (
      <Link href="/sources" className={className ?? "et-btn-primary"}>
        Review data sources →
      </Link>
    );
  }
  return (
    <Link href={next.href} className={className ?? "et-btn-primary"}>
      Next: {next.step}. {next.label} →
    </Link>
  );
}
