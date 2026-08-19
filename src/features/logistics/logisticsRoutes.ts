export const LOGISTICS_SECTIONS = [
  { key: "packs", label: "Pack lists", path: "/logistics/packs" },
  {
    key: "pack-templates",
    label: "Pack templates",
    path: "/logistics/pack-templates",
  },
  { key: "deliveries", label: "Deliveries", path: "/logistics/deliveries" },
  { key: "schedule", label: "Vehicle schedule", path: "/logistics/schedule" },
  { key: "route", label: "Route planner", path: "/logistics/route" },
  { key: "fleet", label: "Fleet", path: "/logistics/fleet" },
  { key: "maintenance", label: "Maintenance", path: "/logistics/maintenance" },
] as const;

export type LogisticsSection = (typeof LOGISTICS_SECTIONS)[number]["key"];

/** Hyphenated / concatenated pack-list URLs 404'd; the book is /logistics/packs. */
export function canonicalizePackListPath(pathname: string): string | null {
  if (
    pathname === "/logistics/pack-lists" ||
    pathname === "/logistics/packlists"
  ) {
    return "/logistics/packs";
  }
  const match = pathname.match(
    /^\/logistics\/(pack-lists|packlists)\/([^/]+)$/,
  );
  if (match) return `/logistics/packs/${match[2]}`;
  return null;
}
