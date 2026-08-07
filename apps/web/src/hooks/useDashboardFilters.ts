"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEFAULT_FILTERS,
  type DashboardFilters,
} from "@/lib/dashboard-filters";
import {
  filtersFromSearchParams,
  hrefWithFilters,
  writeFiltersToSearchParams,
} from "@/lib/filter-url";

/**
 * URL-synced dashboard filters. Preserves audience / preset / tab query keys.
 * Wrap consumers in <Suspense> (Next.js useSearchParams requirement).
 */
export function useDashboardFilters(
  pageDefaults?: Partial<DashboardFilters>
): [
  DashboardFilters,
  (next: DashboardFilters | ((prev: DashboardFilters) => DashboardFilters)) => void,
] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const defaults = useMemo(
    () => ({ ...DEFAULT_FILTERS, ...(pageDefaults ?? {}) }),
    // pageDefaults is expected to be a stable object from the caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(pageDefaults ?? {})]
  );

  const filters = useMemo(
    () => filtersFromSearchParams(searchParams, defaults),
    [searchParams, defaults]
  );

  const setFilters = useCallback(
    (next: DashboardFilters | ((prev: DashboardFilters) => DashboardFilters)) => {
      const resolved = typeof next === "function" ? next(filters) : next;
      const params = new URLSearchParams(searchParams.toString());
      writeFiltersToSearchParams(params, resolved, defaults);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname, defaults, filters]
  );

  return [filters, setFilters];
}

/** Build links that keep the current filter + audience slice. */
export function useFilterHref() {
  const searchParams = useSearchParams();
  return useCallback(
    (href: string, filterOverrides?: Partial<DashboardFilters>) =>
      hrefWithFilters(href, searchParams, filterOverrides),
    [searchParams]
  );
}

export function useAudienceParam(): string | null {
  const searchParams = useSearchParams();
  return searchParams.get("audience");
}

export function usePresetParam(): string | null {
  const searchParams = useSearchParams();
  return searchParams.get("preset");
}
