export const LOGISTICS_SECTIONS = [
  { key: "dispatch", label: "Dispatch board", path: "/logistics/dispatch" },
  { key: "fleet", label: "Fleet", path: "/logistics/fleet" },
  {
    key: "pack-templates",
    label: "Pack setup",
    path: "/logistics/pack-templates",
  },
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
