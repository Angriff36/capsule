/**
 * Canonical Service Style vocabulary (TPP master + Josh's four styles).
 * Shared by the create-event picker fallback and scripts/seed-catalogs.ts
 * so the UI never invents a parallel enum.
 */
export type ServiceStyleCatalogRow = {
  name: string;
  code: string;
  description?: string;
};

export const SERVICE_STYLE_CATALOG: readonly ServiceStyleCatalogRow[] = [
  {
    name: "Full Service",
    code: "full-service",
    description:
      "Staffed onsite service. TPP: Buffet - Cook Onsite, Plated Dinner, Action Station, Family Style, Private Chef, Bar.",
  },
  {
    name: "Limited Service",
    code: "limited-service",
    description:
      "Delivered hot or ready-to-heat with limited staffing. TPP: Buffet - Bring Hot, Ready To Heat - CPU, Ready To Heat - Delivery.",
  },
  {
    name: "Drop Off",
    code: "drop-off",
    description:
      "Delivered, no service staff. TPP: Drop Off, Drop Off - Individual, Pickup.",
  },
  {
    name: "Vending",
    code: "vending",
    description:
      "Vending and food-truck service. TPP: Vending, Food Truck Window.",
  },
];

export type ServiceStyleSelectOption = { id: string; name: string };

type ListedServiceStyle = {
  _id: string;
  name: string;
  status?: string;
  sortOrder?: number;
};

/**
 * Active Convex rows when the tenant has any; otherwise the domain catalog
 * so Full Service / Limited Service / Drop Off / Vending appear without a
 * seed. Catalog codes are labels only — never send them as serviceStyleId.
 */
export function serviceStyleSelectOptions(
  rows: readonly ListedServiceStyle[] | undefined,
): ServiceStyleSelectOption[] {
  if (rows === undefined) return [];
  const active = rows
    .filter((row) => row.status === "active")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  if (active.length > 0) {
    return active.map((row) => ({ id: row._id, name: row.name }));
  }
  return SERVICE_STYLE_CATALOG.map((row) => ({
    id: row.code,
    name: row.name,
  }));
}

/** True once the rows have loaded and none are active — the picker is showing
 * the built-in catalog, so the UI can say so instead of staying silent. */
export function usingBuiltInServiceStyles(
  rows: readonly ListedServiceStyle[] | undefined,
): boolean {
  if (rows === undefined) return false;
  return rows.every((row) => row.status !== "active");
}

/** Event.serviceStyleId is an optional uuid — catalog codes must not be sent. */
export function persistableServiceStyleId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (SERVICE_STYLE_CATALOG.some((row) => row.code === trimmed)) return "";
  return trimmed;
}
