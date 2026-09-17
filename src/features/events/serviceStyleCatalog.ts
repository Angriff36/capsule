/**
 * Canonical Service Style vocabulary: Josh's four umbrella styles first (the
 * TPP migration mapping; Event timing hints key off "Full Service" /
 * "Limited Service"), then the granular styles TPP actually writes on a BEO
 * (#368 item 8 — "Buffet - Cook Onsite" was being flattened to "Full Service"
 * and the fact that it is a buffet cooked on site was lost). Shared by the
 * create-event picker fallback, the Admin → Catalogs "Add the standard list"
 * button and scripts/seed-catalogs.ts so the UI never invents a parallel enum.
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
  // Granular TPP styles — what the BEO actually says. Pick one of these when
  // the umbrella style above would lose the detail the kitchen needs.
  {
    name: "Buffet – Cook Onsite",
    code: "buffet-cook-onsite",
    description: "Buffet service, food cooked at the venue. TPP: C.O.S.",
  },
  {
    name: "Buffet – Bring Hot",
    code: "buffet-bring-hot",
    description: "Buffet service, food arrives hot from the kitchen. TPP: B.H.",
  },
  {
    name: "Plated",
    code: "plated",
    description: "Seated, plated courses served by staff. TPP: Plate.",
  },
  {
    name: "Family Style",
    code: "family-style",
    description: "Shared platters brought to each table. TPP: Fam.",
  },
  {
    name: "Private Chef",
    code: "private-chef",
    description: "Chef cooks and serves in the client's space. TPP: P.C.",
  },
  {
    name: "Action Station",
    code: "action-station",
    description: "Chef-attended stations finished in front of guests.",
  },
  {
    name: "Ready To Heat",
    code: "ready-to-heat",
    description:
      "Delivered cold with reheating instructions. TPP: Ready To Heat - CPU / Delivery.",
  },
  {
    name: "Pickup",
    code: "pickup",
    description: "Client collects from the kitchen. TPP: Pickup.",
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
