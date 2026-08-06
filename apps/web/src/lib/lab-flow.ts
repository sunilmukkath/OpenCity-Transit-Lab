/** Canonical lab path: Home → Objectives → Map → Actions → Reports (Sources is reference). */
export const LAB_FLOW = [
  { step: 1, href: "/", label: "Home", blurb: "Start here" },
  { step: 2, href: "/objectives", label: "Objectives", blurb: "Charts & evidence" },
  { step: 3, href: "/map", label: "Map", blurb: "See gaps spatially" },
  { step: 4, href: "/recommendations", label: "Actions", blurb: "What to do" },
  { step: 5, href: "/analytics", label: "Reports", blurb: "Ward briefs" },
] as const;

export function flowStepForPath(pathname: string): number {
  if (pathname === "/") return 1;
  if (pathname.startsWith("/objectives")) return 2;
  if (pathname.startsWith("/map")) return 3;
  if (pathname.startsWith("/recommendations")) return 4;
  if (pathname.startsWith("/analytics")) return 5;
  return 0;
}
