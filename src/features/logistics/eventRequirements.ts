/**
 * What one event needs, sorted by kind (PR10-01, AC-131): food we cook, our
 * reusable equipment, items rented from a vendor, service supplies, and items
 * the client brings. Each line says where it comes from, how much, whether it
 * is there yet, and who is responsible for it.
 *
 * Pure. Each kind keeps its own record: food is ingredient demand, our
 * equipment is a hold on the equipment list, a rental is a vendor rental line
 * (or a hold on an item we rent), supplies and client items are pack lines.
 * Equipment is never counted as food, and a rental never as our stock.
 */

export type RequirementKind =
  "food" | "equipment" | "rental" | "supply" | "client";

export type RequirementLine = {
  key: string;
  kind: RequirementKind;
  name: string;
  source: string;
  quantity: number;
  unit: string;
  availability: string;
  responsible: string;
};

export type DemandInput = {
  id: string;
  ingredientName: string;
  requiredQuantity: number;
  unit: string;
  status: string;
  vendorName?: string | null;
};

export type HoldInput = {
  id: string;
  equipmentName: string;
  ownership: "owned" | "rented";
  quantity: number;
  countUnit?: string | null;
  status: string;
  homeLocation?: string | null;
  vendorName?: string | null;
};

export type RentalInput = {
  id: string;
  description: string;
  vendorName: string;
  quantity: number;
  countUnit: string;
  status: string;
  deliveredQuantity?: number | null;
  returnedQuantity?: number | null;
};

export type PackLineInput = {
  id: string;
  description: string;
  requiredQuantity: number;
  packedQuantity: number;
  unit: string;
  category?: string | null;
  ownership?: "owned" | "rented" | "client" | null;
  returnNote?: string | null;
  /** True when the line was put on the list by an equipment hold. */
  fromHold: boolean;
  excluded: boolean;
};

/** Pack categories that are used up or laundered, not reusable gear. */
const SUPPLY_CATEGORIES = new Set([
  "disposable",
  "place_setting",
  "linen",
  "ice",
  "garnish",
]);

const DEMAND_STATE: Record<string, string> = {
  pending: "Not worked out yet",
  calculated: "Worked out, not bought",
  confirmed: "On order",
  fulfilled: "In stock for this event",
  superseded: "Replaced",
};

const HOLD_STATE: Record<string, string> = {
  reserved: "Held",
  checked_out: "Out with the event",
  returned: "Back",
  cancelled: "Released",
};

export function rentalAvailability(rental: RentalInput): string {
  switch (rental.status) {
    case "requested":
      return "Asked, not confirmed";
    case "confirmed":
      return "Confirmed by vendor";
    case "delivered": {
      const came = rental.deliveredQuantity ?? rental.quantity;
      return came < rental.quantity
        ? `${came} of ${rental.quantity} arrived`
        : "Arrived";
    }
    case "returned": {
      const back = rental.returnedQuantity ?? 0;
      const came = rental.deliveredQuantity ?? rental.quantity;
      return back < came ? `Back, ${came - back} missing` : "Back to vendor";
    }
    case "cancelled":
      return "Cancelled";
    default:
      return rental.status;
  }
}

function packAvailability(line: PackLineInput): string {
  if (line.excluded) return "Left off";
  if (line.packedQuantity >= line.requiredQuantity) return "Packed";
  if (line.packedQuantity > 0)
    return `${line.packedQuantity} of ${line.requiredQuantity} packed`;
  return "Not packed";
}

const KIND_ORDER: RequirementKind[] = [
  "food",
  "equipment",
  "rental",
  "supply",
  "client",
];

export function buildEventRequirements(input: {
  demands: DemandInput[];
  holds: HoldInput[];
  rentals: RentalInput[];
  packLines: PackLineInput[];
}): RequirementLine[] {
  const lines: RequirementLine[] = [];
  for (const demand of input.demands) {
    if (demand.status === "superseded") continue;
    lines.push({
      key: `food:${demand.id}`,
      kind: "food",
      name: demand.ingredientName,
      source: "Menu recipes",
      quantity: demand.requiredQuantity,
      unit: demand.unit,
      availability: DEMAND_STATE[demand.status] ?? demand.status,
      responsible: demand.vendorName?.trim() || "Kitchen buying",
    });
  }
  for (const hold of input.holds) {
    if (hold.status === "cancelled") continue;
    const rented = hold.ownership === "rented";
    lines.push({
      key: `hold:${hold.id}`,
      kind: rented ? "rental" : "equipment",
      name: hold.equipmentName,
      source: "Held from the equipment list",
      quantity: hold.quantity,
      unit: hold.countUnit?.trim() || "each",
      availability: HOLD_STATE[hold.status] ?? hold.status,
      responsible: rented
        ? hold.vendorName?.trim() || "Rental company (not named)"
        : hold.homeLocation?.trim() || "Warehouse",
    });
  }
  for (const rental of input.rentals) {
    if (rental.status === "cancelled") continue;
    lines.push({
      key: `rental:${rental.id}`,
      kind: "rental",
      name: rental.description,
      source: "Rented from a vendor",
      quantity: rental.quantity,
      unit: rental.countUnit,
      availability: rentalAvailability(rental),
      responsible: rental.vendorName,
    });
  }
  for (const line of input.packLines) {
    // A hold already shows as its equipment or rental line.
    if (line.fromHold) continue;
    const kind: RequirementKind =
      line.ownership === "client"
        ? "client"
        : line.ownership === "rented"
          ? "rental"
          : SUPPLY_CATEGORIES.has(line.category ?? "")
            ? "supply"
            : "equipment";
    lines.push({
      key: `pack:${line.id}`,
      kind,
      name: line.description,
      source: "Pack list",
      quantity: line.requiredQuantity,
      unit: line.unit,
      availability: packAvailability(line),
      responsible:
        kind === "client"
          ? "Client brings it"
          : kind === "rental"
            ? line.returnNote?.trim() || "Rental company"
            : "Warehouse",
    });
  }
  return lines.sort(
    (a, b) =>
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      a.name.localeCompare(b.name),
  );
}

export const REQUIREMENT_KIND_LABEL: Record<RequirementKind, string> = {
  food: "Food",
  equipment: "Our equipment",
  rental: "Rented",
  supply: "Supplies",
  client: "Client brings",
};
