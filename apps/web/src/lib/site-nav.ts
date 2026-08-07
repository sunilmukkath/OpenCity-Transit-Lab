/** Canonical 5-page app structure. */

export const SITE_PAGES = [
  {
    id: "home",
    href: "/",
    label: "Home",
    nav: true,
    title: "OpenCity Transit Lab",
    blurb: "Chennai PT evidence from verified open layers.",
  },
  {
    id: "last-mile",
    href: "/last-mile",
    label: "Last mile",
    nav: true,
    title: "Last-mile connectivity",
    blurb: "Hub feeders, walk distance, and need lines — analysis and map.",
  },
  {
    id: "destinations",
    href: "/destinations",
    label: "Hospitals & schools",
    nav: true,
    title: "Hospitals and schools",
    blurb: "How destinations sit relative to stops and hubs.",
  },
  {
    id: "assessments",
    href: "/assessments",
    label: "Wards & zones",
    nav: true,
    title: "Ward and zone assessments",
    blurb: "Gap Index and inventory by ward and zone.",
  },
  {
    id: "infrastructure",
    href: "/infrastructure",
    label: "Infrastructure",
    nav: true,
    title: "Stops vs shelters",
    blurb: "Where stops exist without weather protection.",
  },
] as const;

export type SitePageId = (typeof SITE_PAGES)[number]["id"];

export const PRIMARY_NAV = SITE_PAGES.filter((p) => p.nav && p.id !== "home").map((p) => ({
  href: p.href,
  label: p.label,
}));

/** Home cards exclude Home itself. */
export const HOME_CARDS = SITE_PAGES.filter((p) => p.id !== "home");
